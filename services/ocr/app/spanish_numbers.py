"""Spanish-style decimal parsing for OCR tokens."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass

# Suffix noise from OCR / stamps (currency, batch symbols)
_MONEY_NOISE_SUFFIX = re.compile(
    r"[\s€¤$£¥@\u20a0-\u20cf]*$", re.I
)
_MONEY_NOISE_PREFIX = re.compile(r"^[^\d.,]*")
_LEADING_NUMBER = re.compile(r"^([\d.,]+)")


@dataclass(frozen=True)
class OcrMoneyParse:
    value: float
    """Truncated to cents (floor); aggressive if 3+ decimal digits were folded."""
    aggressive_truncation: bool
    """True if we folded OCR excess fractional digits (e.g. 126.406 -> 126.40)."""
    tiny_or_dubious: bool
    """True if value was < 0.01 before/after fix (e.g. 0.006 -> 0.00)."""


@dataclass(frozen=True)
class OcrQuantityParse:
    value: float
    """Heuristic comma-three-digit fix (e.g. 10,300 -> 10.3)."""
    aggressive: bool


def parse_es_float(token: str) -> float:
    s = token.strip().replace(" ", "")
    if not s:
        raise ValueError("empty")
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".")
    else:
        if s.count(".") == 1:
            intpart, frac = s.split(".")
            ## Miles ES: "1.234" sin coma -> 1234 (compat legado recibos)
            if len(frac) == 3 and intpart.isdigit() and frac.isdigit():
                s = intpart + frac
    return float(s)


def extract_leading_digit_run(token: str) -> str | None:
    """First maximal `[digits][.,digits]` chunk (leading), ignoring leading junk."""
    t = token.strip().replace(" ", "")
    if not t:
        return None
    t = _MONEY_NOISE_PREFIX.sub("", t)
    m = _LEADING_NUMBER.match(t)
    return m.group(1) if m else None


def parse_quantity_token_ocr(token: str) -> OcrQuantityParse | None:
    """
    Quantity on Spanish delivery notes. Handles OCR patterns like:
    - "10,300" / "3,200" -> thousandths after comma (10.3 / 3.2)
    - "10.300" -> same with dot (OCR)
    - Otherwise delegates to parse_es_float on a cleaned run (avoid 3-digit-dot thousands merge).
    """
    raw = extract_leading_digit_run(token)
    if not raw or not re.search(r"\d", raw):
        return None
    if re.fullmatch(r"\d+,\d{3}", raw):
        intp, frac = raw.split(",")
        v = float(intp) + float(frac) / 1000.0
        return OcrQuantityParse(value=v, aggressive=False)
    if re.fullmatch(r"\d+\.\d{3}", raw):
        intp, frac = raw.split(".")
        v = float(intp) + float(frac) / 1000.0
        return OcrQuantityParse(value=v, aggressive=True)
    if re.fullmatch(r"\d+\.\d{1,2}", raw) or re.fullmatch(r"\d+,\d{1,2}", raw):
        try:
            v = parse_es_float(raw)
        except (ValueError, OverflowError):
            return None
    else:
        try:
            v = parse_es_float(raw)
        except (ValueError, OverflowError):
            return None
    if v < 0 or math.isnan(v) or math.isinf(v):
        return None
    return OcrQuantityParse(value=v, aggressive=False)


def _money_from_dot_decimal(intpart: str, frac: str) -> tuple[float, bool, float]:
    """
    Dot as decimal separator (typical in OCR dumps). 3 fractional digits -> thousandths, then floor to cents.
    Returns (value_cents_floored, aggressive, raw_thousandth).
    """
    if not intpart.isdigit() or not frac.isdigit():
        raise ValueError("non-digit parts")
    aggressive = len(frac) > 2
    if len(frac) <= 2:
        vf = float(f"{intpart}.{frac}")
        return vf, False, vf
    v_thousandth = float(intpart) + float(frac) / (1000 ** 1)
    v = math.floor(v_thousandth * 100 + 1e-9) / 100
    return v, aggressive, v_thousandth


def _money_from_comma_decimal(intpart: str, frac: str) -> tuple[float, bool, float]:
    aggressive = len(frac) > 2
    if len(frac) <= 2:
        vf = float(f"{intpart}.{frac}")
        return vf, False, vf
    v_thousandth = float(intpart) + float(frac) / (1000 ** 1)
    v = math.floor(v_thousandth * 100 + 1e-9) / 100
    return v, aggressive, v_thousandth


def parse_money_token_ocr(token: str) -> OcrMoneyParse | None:
    """
    Money on albaranes: strip € @ etc., then parse with dot/comma as decimal
    (avoid parse_es_float's '1.234'->1234 rule which breaks 126.406).
    """
    t = token.strip().replace(" ", "")
    if not t:
        return None
    t = _MONEY_NOISE_PREFIX.sub("", t)
    t = _MONEY_NOISE_SUFFIX.sub("", t)
    if not t:
        return None
    # Single run: extend through first digits + one decimal block
    m = re.match(r"^(\d+)([.,])(\d+)", t)
    if not m:
        m2 = re.match(r"^(\d+)$",t)
        if m2:
            try:
                v = float(m2.group(1))
            except ValueError:
                return None
            return OcrMoneyParse(
                value=round(v, 2),
                aggressive_truncation=False,
                tiny_or_dubious=v > 0 and v < 0.01,
            )
        return None
    intp, sep, frac = m.group(1), m.group(2), m.group(3)
    try:
        if sep == ".":
            v, aggressive, v_raw = _money_from_dot_decimal(intp, frac)
        else:
            v, aggressive, v_raw = _money_from_comma_decimal(intp, frac)
    except ValueError:
        return None
    tiny = False
    if v_raw > 0 and v < 0.01:
        tiny = True
        v = 0.0
        aggressive = True
    if v < 0 or math.isnan(v) or math.isinf(v):
        return None
    return OcrMoneyParse(
        value=round(v, 2),
        aggressive_truncation=aggressive,
        tiny_or_dubious=tiny,
    )
