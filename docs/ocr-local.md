# OCR local (Forkcount)

El reconocimiento de texto se ejecuta **en tu máquina** con [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) dentro de Docker. **No hace falta ninguna API key** de OpenAI, Google Vision, AWS Textract ni Azure: solo modelos descargados por PaddleOCR en el primer arranque (o en el build).

## Variables de entorno

| Variable | Descripción |
|----------|-------------|
| `OCR_SERVICE_URL` | URL base del microservicio (no es una clave secreta). Ejemplo: `http://localhost:8001`. Next.js la usa en `/api/purchases/ocr` para reenviar la imagen. |
| `OCR_INTERNAL_SECRET` | Opcional. Si la defines en Next (`.env.local`) y en `docker-compose` para el servicio `ocr`, el microservicio exige el header `X-OCR-Internal-Token` con ese valor. |
| `OCR_LANG` | Idioma de PaddleOCR en el contenedor (por defecto `es` en `docker-compose.yml`). |
| `DEBUG_OCR` | Si es `true`, el servicio incluye en la respuesta JSON el array `blocks` (cajas de texto) y escribe artefactos de depuración bajo `/tmp/forkcount-ocr-debug`. |

## Arranque del servicio

Desde la raíz del repositorio:

```bash
docker compose up ocr --build
```

El servicio escucha en el puerto **8001** (mapeado `8001:8001`).

## Comprobar que responde

```bash
curl -s http://localhost:8001/health
```

Respuesta esperada: `{"ok":true}`.

## Next.js

En `.env.local` (o `.env`):

```env
OCR_SERVICE_URL=http://localhost:8001
```

Tras arrancar el contenedor `ocr`, el asistente **Nueva compra** puede usar **Extraer con OCR local**: las líneas se rellenan en el paso «Líneas»; **no se crea la compra** hasta que guardes el formulario.

## Notas

- **Primera petición**: PaddleOCR puede tardar en cargar modelos y ser lenta la primera extracción.
- **Recursos**: OCR con redes neuronales consume CPU/RAM; en equipos modestos sube el tiempo de respuesta.
- **PDF**: el flujo actual solo admite **imágenes** (JPEG, PNG, WebP, etc.), no PDF.
