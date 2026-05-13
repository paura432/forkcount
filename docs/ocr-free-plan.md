# OCR gratuito / código abierto en Forkcount

Este documento describe la arquitectura de OCR **local** con **PaddleOCR** (sin OpenAI Vision por ahora), sus limitaciones y el flujo de **revisión manual** antes de confirmar una compra.

## Por qué PaddleOCR

- **Licencia**: PaddleOCR es código abierto (Apache 2.0); encaja en un producto self-hosted sin coste por página de terceros.
- **Ejecución offline**: el microservicio en Docker no envía la imagen a APIs externas; solo el tráfico interno entre Next.js y el contenedor `ocr`.
- **Rendimiento razonable en CPU**: suficiente para prototipos y uso moderado en un servidor propio (no está optimizado para latencia de milisegundos como un SaaS especializado).
- **Multilingüe**: el motor puede reconocer texto latino y mixto; la calidad en español depende de la foto y del layout.

## Arquitectura

1. El usuario sube una **imagen** (factura, albarán, ticket) desde la app (p. ej. paso «Adjunto» en nueva compra o vía API).
2. Next.js (`POST /api/purchases/ocr`) crea una fila `purchases` con `status = pending_review`, `extraction_source = ocr`, sube el archivo al bucket **invoices** de Supabase Storage y llama al servicio Python `POST /ocr/extract`.
3. El servicio devuelve `text`, `lines` (texto por caja de detección) e `items` (heurística de parser para albarán / ticket).
4. El resultado se guarda en `invoice_ocr_raw` (borrador versionado) y `invoice_ocr_status = done` (o `error` si falla).
5. En la ficha de la compra, el usuario **revisa y edita** las líneas y pulsa **Guardar líneas**; entonces se insertan `purchase_items` y se actualizan totales y `status` (confirmada o sigue pendiente).

No hay confirmación automática: hasta que el usuario no guarde las líneas, la compra no alimenta costes con filas definitivas.

## Limitaciones

- **Solo imágenes** en el flujo OCR local (JPEG, PNG, WebP, etc.); PDF no se procesa en este microservicio.
- **CPU y tamaño de imagen**: la primera ejecución descarga modelos; el reconocimiento puede tardar decenas de segundos.
- **Layout variable**: tickets estrechos, doble columna o tinta baja degradan la detección de líneas.
- **Parser heurístico**: los patrones para albarán (`nombre cantidad precio_unitario importe`) y ticket (`cantidad en el nombre` + último importe) son aproximaciones; conviene revisar siempre decimales y unidades (p. ej. albarán asume `kg` si la línea no trae unidad explícita).
- **Timeouts**: en despliegue serverless, el tiempo máximo de la ruta puede ser un límite; en producción suele ser mejor Next **self-hosted** o worker dedicado para OCR largo.

## Flujo de revisión manual

- Estado de compra: **`pending_review`** desde la creación por OCR hasta que el usuario confirme líneas (o elija seguir en pendiente al guardar).
- Columnas útiles: `invoice_ocr_raw` (JSON con `ocr.text`, `ocr.lines`, `items`), `invoice_ocr_status`, `invoice_ocr_error`.
- Tras guardar líneas, la compra puede pasar a **`confirmed`** o permanecer en **`pending_review`** según el radio en pantalla.

## Futura opción: OpenAI Vision (u otro modelo cloud)

Si en el futuro se prioriza **precisión** sobre coste y privacidad estricta, se puede añadir un segundo proveedor (p. ej. OpenAI Vision) que reciba la misma imagen y devuelva JSON estructurado, manteniendo el mismo patrón `pending_review` + revisión humana. PaddleOCR seguiría siendo la opción por defecto para entornos offline o sin claves de terceros.

## Puesta en marcha local

```bash
docker compose up --build ocr
```

En `.env.local` de Next:

- `OCR_SERVICE_URL=http://127.0.0.1:8000`
- Opcional: `OCR_INTERNAL_SECRET` (mismo valor en `docker-compose.yml` para el servicio `ocr`).

Arranca Next (`pnpm dev`) con esas variables para que `POST /api/purchases/ocr` pueda alcanzar el contenedor.
