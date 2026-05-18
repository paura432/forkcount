import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getRestaurantId } from "@/lib/auth/restaurant";
import { parseOcrHttpResponse } from "@/lib/ocr-extraction";
import { PURCHASE_DOCUMENT_TYPES, type PurchaseDocumentType } from "@/lib/types";

export const maxDuration = 120;

function safeFileName(name: string): string {
  const base = name.replace(/[^\w.\-]+/g, "_").slice(0, 180);
  return base || "factura";
}

function isPurchaseDocumentType(v: string): v is PurchaseDocumentType {
  return (PURCHASE_DOCUMENT_TYPES as readonly string[]).includes(v);
}

function ocrUpstreamDetail(json: unknown, fallback: string): string {
  const errObj = json && typeof json === "object" && json !== null ? (json as Record<string, unknown>) : null;
  if (errObj && typeof errObj.error === "string" && errObj.error.length > 0) {
    return errObj.error;
  }
  if (errObj && "detail" in errObj) {
    const rawDetail = errObj.detail;
    return typeof rawDetail === "string"
      ? rawDetail
      : JSON.stringify(rawDetail ?? "").slice(0, 2000);
  }
  return fallback;
}

function ocrServiceErrorResponse(status: number, json: unknown) {
  const detail = ocrUpstreamDetail(json, status === 401 ? "Unauthorized" : "Error");
  return NextResponse.json(
    {
      error: `OCR service returned ${status}: ${detail}`,
      ocr_status: status,
    },
    { status: 502 },
  );
}

async function getImageBytesAndName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  restaurantId: string,
  formData: FormData,
): Promise<{ bytes: Buffer; filename: string; contentType: string } | { error: string }> {
  const file = formData.get("file");
  const storagePathRaw = formData.get("storage_path");

  if (file instanceof File && file.size > 0) {
    const ct = file.type || "application/octet-stream";
    if (!/^image\/(jpeg|jpg|png|webp|gif|bmp|tiff)$/i.test(ct)) {
      return { error: "El archivo debe ser una imagen (JPEG, PNG, WebP…). PDF no soportado en OCR local." };
    }
    if (file.size > 25 * 1024 * 1024) {
      return { error: "Imagen demasiado grande (máx. 25 MB)" };
    }
    const buf = Buffer.from(await file.arrayBuffer());
    return { bytes: buf, filename: safeFileName(file.name || "scan.jpg"), contentType: ct };
  }

  if (typeof storagePathRaw === "string" && storagePathRaw.trim()) {
    const storage_path = storagePathRaw.trim();
    const firstFolder = storage_path.split("/")[0];
    if (firstFolder !== restaurantId) {
      return { error: "storage_path no pertenece a tu restaurante" };
    }
    const { data: blob, error: dlErr } = await supabase.storage.from("invoices").download(storage_path);
    if (dlErr || !blob) {
      return { error: dlErr?.message ?? "No se pudo descargar el archivo de Storage" };
    }
    const buf = Buffer.from(await blob.arrayBuffer());
    const name = storage_path.split("/").pop() || "documento";
    const ct = blob.type || "image/jpeg";
    return { bytes: buf, filename: safeFileName(name), contentType: ct };
  }

  return { error: "Indica file (multipart) o storage_path" };
}

/**
 * Proxy autenticado al microservicio OCR local. No crea compras ni sube archivos.
 */
export async function POST(request: Request) {
  const ocrBase = process.env.OCR_SERVICE_URL?.replace(/\/$/, "");
  if (!ocrBase) {
    return NextResponse.json(
      { error: "OCR_SERVICE_URL no configurada. Arranca el servicio Docker (ver docs/ocr-local.md)." },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  let restaurantId: string;
  try {
    restaurantId = await getRestaurantId();
  } catch {
    return NextResponse.json({ error: "Perfil sin restaurante" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Body inválido (multipart esperado)" }, { status: 400 });
  }

  const img = await getImageBytesAndName(supabase, restaurantId, formData);
  if ("error" in img) {
    return NextResponse.json({ error: img.error }, { status: 400 });
  }

  const docRaw = formData.get("document_type");
  const documentType =
    typeof docRaw === "string" && isPurchaseDocumentType(docRaw) ? docRaw : "receipt";

  const ocrForm = new FormData();
  ocrForm.set("document_type", documentType);
  const blob = new Blob([new Uint8Array(img.bytes)], { type: img.contentType });
  ocrForm.set("file", blob, img.filename);

  const ocrHeaders: HeadersInit = {};
  const secret = process.env.OCR_INTERNAL_SECRET?.trim();
  if (secret) {
    ocrHeaders["X-OCR-Internal-Token"] = secret;
  }

  let json: unknown;
  try {
    const ocrRes = await fetch(`${ocrBase}/ocr/extract`, {
      method: "POST",
      body: ocrForm,
      headers: ocrHeaders,
      signal: AbortSignal.timeout(110_000),
    });
    json = await ocrRes.json().catch(() => null);
    if (!ocrRes.ok) {
      return ocrServiceErrorResponse(ocrRes.status, json);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error de red al llamar al OCR";
    return NextResponse.json(
      {
        error: `OCR service unreachable: ${msg}`,
        ocr_status: null,
      },
      { status: 502 },
    );
  }

  const normalized = parseOcrHttpResponse(json);
  if (!normalized) {
    return NextResponse.json(
      {
        error: "OCR service returned invalid JSON (missing text/lines/items)",
        ocr_status: 200,
      },
      { status: 502 },
    );
  }

  const body: Record<string, unknown> = {
    ok: normalized.ok,
    text: normalized.text,
    lines: normalized.lines,
    items: normalized.items,
    document: normalized.document,
    raw_text: normalized.raw_text,
    reconstructed_lines: normalized.reconstructed_lines,
    debug: normalized.debug,
  };
  if (normalized.blocks.length > 0) {
    body.blocks = normalized.blocks;
  }

  return NextResponse.json(body);
}
