"""
Lazy singleton PaddleOCR — first request loads models (slow).
"""

from __future__ import annotations

import logging
import os
from typing import Any

import numpy as np

from .models import OCRBlock

_log = logging.getLogger(__name__)
_ocr: Any = None


def _lang_try_order() -> list[str]:
    preferred = os.environ.get("OCR_LANG", "es").strip().lower() or "es"
    order: list[str] = []
    for cand in (preferred, "latin", "en"):
        if cand not in order:
            order.append(cand)
    return order


def get_ocr():
    global _ocr
    if _ocr is None:
        from paddleocr import PaddleOCR

        _log.info("Initializing PaddleOCR (first run may download models)")
        last_err: Exception | None = None
        for lang in _lang_try_order():
            try:
                _ocr = PaddleOCR(
                    use_angle_cls=True,
                    lang=lang,
                    show_log=False,
                )
                _log.info("PaddleOCR ready (lang=%s)", lang)
                break
            except Exception as e:
                last_err = e
                _log.warning("PaddleOCR init failed for lang=%s: %s", lang, e)
        if _ocr is None:
            raise RuntimeError(f"PaddleOCR could not initialize: {last_err}") from last_err
    return _ocr


def _bbox_metrics(box: list[list[float]]) -> tuple[float, float, float, float]:
    xs = [float(p[0]) for p in box]
    ys = [float(p[1]) for p in box]
    x_min, x_max = min(xs), max(xs)
    y_min, y_max = min(ys), max(ys)
    return (x_min + x_max) / 2, (y_min + y_max) / 2, x_max - x_min, y_max - y_min


def run_ocr_on_bgr(image_bgr: np.ndarray) -> list[OCRBlock]:
    ocr = get_ocr()
    result = ocr.ocr(image_bgr, cls=True)
    if not result or result[0] is None:
        return []

    blocks: list[OCRBlock] = []
    for line in result[0]:
        if not line or len(line) < 2:
            continue
        box_raw, text_conf = line
        if not isinstance(text_conf, (list, tuple)) or len(text_conf) < 1:
            continue
        box = [[float(p[0]), float(p[1])] for p in box_raw]
        text = (text_conf[0] or "").strip()
        conf = float(text_conf[1]) if len(text_conf) > 1 else 0.0
        if not text:
            continue
        xc, yc, bw, bh = _bbox_metrics(box)
        # Paddle often returns 0–1 confidence; clamp
        c = max(0.0, min(1.0, conf))
        blocks.append(
            OCRBlock(
                text=text,
                confidence=c,
                bbox=box,
                x_center=xc,
                y_center=yc,
                width=max(bw, 1.0),
                height=max(bh, 1.0),
            )
        )
    return blocks
