"""
Forkcount OCR microservice — PaddleOCR + preprocess + row grouping + parsers.
"""

from __future__ import annotations

import json
import logging
import os
import re
import time

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from .delivery_note_parser import parse_delivery_note_lines
from .document_parser import parse_document_fields
from .image_preprocess import load_image, maybe_save_debug_image, preprocess_for_paddle
from .ingredient_matcher import attach_suggestions
from .models import DocumentTypeHint, OcrDocumentFields, OcrExtractResponse, OcrDebugInfo
from .ocr_engine import run_ocr_on_bgr
from .receipt_parser import parse_receipt_lines
from .row_grouping import group_blocks_into_rows
from .validation import merge_warning_lists, validate_ocr_extraction

logging.basicConfig(level=logging.INFO)
_log = logging.getLogger(__name__)

app = FastAPI(title="Forkcount OCR", version="1.0.0")

ALLOWED_CT = re.compile(r"^image/(jpeg|jpg|png|webp|gif|bmp|tiff)$", re.I)
DEBUG_DIR = "/tmp/forkcount-ocr-debug"


def _http_error_payload(message: str, *, warnings: list[str] | None = None) -> dict:
    return {
        "ok": False,
        "error": message,
        "debug": {"warnings": list(warnings or [])},
    }


def _detail_to_error_message(detail: object) -> str:
    if isinstance(detail, str):
        return detail
    if isinstance(detail, list):
        parts: list[str] = []
        for item in detail:
            if isinstance(item, dict):
                loc = item.get("loc", ())
                msg = item.get("msg", item)
                loc_s = ".".join(str(x) for x in loc) if loc else ""
                parts.append(f"{loc_s}: {msg}" if loc_s else str(msg))
            else:
                parts.append(str(item))
        return "; ".join(parts) if parts else "Request error"
    if isinstance(detail, dict):
        if "message" in detail and isinstance(detail["message"], str):
            return detail["message"]
        try:
            return json.dumps(detail, ensure_ascii=False)[:2000]
        except (TypeError, ValueError):
            return str(detail)
    return str(detail)


@app.exception_handler(HTTPException)
async def _http_exception_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content=_http_error_payload(_detail_to_error_message(exc.detail)),
    )


@app.exception_handler(RequestValidationError)
async def _validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content=_http_error_payload(_detail_to_error_message(exc.errors())),
    )


def _check_internal_token(request: Request) -> None:
    secret = os.environ.get("OCR_INTERNAL_SECRET", "").strip()
    if not secret:
        return
    token = request.headers.get("X-OCR-Internal-Token", "")
    if token != secret:
        raise HTTPException(status_code=401, detail="Invalid internal token")


def _debug_ocr_enabled() -> bool:
    return os.environ.get("DEBUG_OCR", "").strip().lower() in ("1", "true", "yes")


def _dump_debug_artifacts(blocks, reconstructed_lines: list[str]) -> None:
    if not _debug_ocr_enabled():
        return
    try:
        os.makedirs(DEBUG_DIR, exist_ok=True)
        ts = int(time.time() * 1000)
        bp = os.path.join(DEBUG_DIR, f"blocks_{ts}.json")
        with open(bp, "w", encoding="utf-8") as f:
            json.dump([b.model_dump() for b in blocks], f, ensure_ascii=False, indent=2)
        lp = os.path.join(DEBUG_DIR, f"reconstructed_lines_{ts}.json")
        with open(lp, "w", encoding="utf-8") as f:
            json.dump(reconstructed_lines, f, ensure_ascii=False, indent=2)
        _log.info("DEBUG_OCR wrote %s and %s", bp, lp)
    except OSError as e:
        _log.warning("DEBUG_OCR dump failed: %s", e)


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/ocr/extract", response_model=OcrExtractResponse)
async def ocr_extract(
    request: Request,
    file: UploadFile = File(...),
    document_type: str = Form("receipt"),
):
    _check_internal_token(request)

    ct = (file.content_type or "").strip()
    if not ALLOWED_CT.match(ct):
        raise HTTPException(
            status_code=400,
            detail="Unsupported media type; send image/jpeg, image/png, or image/webp",
        )

    raw = await file.read()
    if not raw or len(raw) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Empty or file too large (max 25MB)")

    img = load_image(raw)
    if img is None:
        arr = np.frombuffer(raw, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail="Could not decode image")

    image_preprocessed = True
    try:
        preprocessed, _deskewed = preprocess_for_paddle(img, enable_deskew=True)
        maybe_save_debug_image(preprocessed, "preprocessed")
        blocks = run_ocr_on_bgr(preprocessed)
        reconstructed_lines, rows = group_blocks_into_rows(blocks)
        raw_text = "\n".join(reconstructed_lines)
        _dump_debug_artifacts(blocks, reconstructed_lines)
    except Exception as e:
        _log.exception("OCR failed")
        raise HTTPException(status_code=500, detail=str(e)) from e

    hint: DocumentTypeHint | str = document_type
    if hint not in ("invoice", "delivery_note", "receipt", "order"):
        hint = "receipt"

    if hint == "delivery_note":
        items = parse_delivery_note_lines(reconstructed_lines, raw_text, rows)
        parser_used = "delivery_note"
    else:
        items = parse_receipt_lines(reconstructed_lines, rows)
        parser_used = "receipt" if hint == "receipt" else f"receipt_as_{hint}"

    attach_suggestions(items, None)

    if hint in ("delivery_note", "invoice"):
        document, doc_warnings = parse_document_fields(reconstructed_lines, raw_text, items)
    else:
        document = OcrDocumentFields()
        doc_warnings = []

    items, val_warnings = validate_ocr_extraction(document, items)
    merged_warnings = merge_warning_lists(doc_warnings, val_warnings)

    debug = OcrDebugInfo(
        parser_used=parser_used,
        image_preprocessed=image_preprocessed,
        row_count=len(rows),
        block_count=len(blocks),
        warnings=merged_warnings,
    )

    return OcrExtractResponse(
        ok=True,
        text=raw_text,
        reconstructed_lines=reconstructed_lines,
        items=items,
        document=document,
        debug=debug,
        blocks=blocks,
        raw_text=raw_text,
        lines=reconstructed_lines,
    )
