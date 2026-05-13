"""
Image preprocessing for document OCR (OpenCV).
"""

from __future__ import annotations

import logging
import os
import time
from pathlib import Path

import cv2
import numpy as np

_log = logging.getLogger(__name__)

DEBUG_DIR = Path("/tmp/forkcount-ocr-debug")


def load_image(image_bytes: bytes) -> np.ndarray | None:
    """Decode image bytes to BGR uint8."""
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)


def resize_for_ocr(image_bgr: np.ndarray, max_side: int = 1800) -> np.ndarray:
    """Resize keeping aspect ratio so the longest side is at most max_side."""
    h, w = image_bgr.shape[:2]
    m = max(h, w)
    if m <= max_side:
        return image_bgr
    scale = max_side / m
    nw, nh = int(w * scale), int(h * scale)
    return cv2.resize(image_bgr, (nw, nh), interpolation=cv2.INTER_AREA)


def grayscale(image_bgr: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)


def denoise(gray: np.ndarray, h: float = 8.0) -> np.ndarray:
    return cv2.fastNlMeansDenoising(gray, None, h, 7, 21)


def increase_contrast(gray: np.ndarray, clip_limit: float = 2.0, tile: int = 8) -> np.ndarray:
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(tile, tile))
    return clahe.apply(gray)


def threshold_image(gray: np.ndarray, adaptive: bool = True) -> np.ndarray:
    if adaptive:
        return cv2.adaptiveThreshold(
            gray,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            35,
            10,
        )
    _, th = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    return th


def deskew_image(gray: np.ndarray, max_angle_deg: float = 12.0) -> tuple[np.ndarray, bool]:
    """
    Deskew using minAreaRect on the largest dark-on-light contour (rough).
    Returns (possibly rotated) gray image and whether rotation was applied.
    """
    h, w = gray.shape[:2]
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    _, th = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    contours, _ = cv2.findContours(th, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return gray, False
    c = max(contours, key=cv2.contourArea)
    if cv2.contourArea(c) < 0.05 * w * h:
        return gray, False
    rect = cv2.minAreaRect(c)
    angle = rect[-1]
    if angle < -45:
        angle = 90 + angle
    elif angle > 45:
        angle = angle - 90
    if abs(angle) < 0.4 or abs(angle) > max_angle_deg:
        return gray, False
    m = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    rotated = cv2.warpAffine(gray, m, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    return rotated, True


def gray_to_bgr(gray: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)


def preprocess_for_paddle(
    image_bgr: np.ndarray,
    *,
    enable_deskew: bool = True,
) -> tuple[np.ndarray, bool]:
    """
    Full chain for PaddleOCR: resize → optional deskew → denoise → CLAHE → 3-channel.
    Returns (bgr_for_ocr, deskew_applied).
    """
    img = resize_for_ocr(image_bgr)
    g = grayscale(img)
    deskewed = False
    if enable_deskew:
        g, deskewed = deskew_image(g)
    g2 = denoise(g, h=6.0)
    g3 = increase_contrast(g2)
    return gray_to_bgr(g3), deskewed


def maybe_save_debug_image(image_bgr: np.ndarray, label: str) -> None:
    if os.environ.get("DEBUG_OCR", "").lower() not in ("1", "true", "yes"):
        return
    try:
        DEBUG_DIR.mkdir(parents=True, exist_ok=True)
        ts = int(time.time() * 1000)
        path = DEBUG_DIR / f"{label}_{ts}.png"
        cv2.imwrite(str(path), image_bgr)
        _log.info("DEBUG_OCR saved %s", path)
    except OSError as e:
        _log.warning("DEBUG_OCR could not save image: %s", e)
