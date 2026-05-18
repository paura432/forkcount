"""
Parser for professional delivery notes (albarán): Descripción / Kilos / Precio / Importe.
Tolerant to OCR noise: €, @, extra integers, 3-digit money fractions.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from itertools import combinations

from .line_noise import is_likely_noise_line
from .models import ExtractedPurchaseItem, QuantityUnit
from .row_grouping import RowInfo
from .spanish_numbers import (
    OcrMoneyParse,
    OcrQuantityParse,
    parse_money_token_ocr,
    parse_quantity_token_ocr,
)


def document_suggests_kg(full_text: str) -> bool:
    t = full_text.lower()
    return "kilos" in t or " kg" in t or "kgs" in t or "\nkg" in t


def _line_confidence(row: RowInfo | None) -> float:
    if not row:
        return 0.0
    blocks = row["blocks"]
    if not blocks:
        return 0.0
    return sum(b.confidence for b in blocks) / len(blocks)


_BAD_FIRST = frozenset(
    {
        "CODIGO",
        "LOTE",
        "IVA",
        "DTO",
        "PRECIO",
        "IMPORTE",
        "KILOS",
        "KILO",
        "TOTAL",
        "ALBARAN",
        "DESCRIPCION",
        "ARTICULO",
        "UNIDAD",
        "FACTURA",
    }
)


def _norm_first_tok(s: str) -> str:
    t = s.strip().upper()
    for a, b in (
        ("Á", "A"),
        ("É", "E"),
        ("Í", "I"),
        ("Ó", "O"),
        ("Ú", "U"),
        ("Ñ", "N"),
    ):
        t = t.replace(a, b)
    return t.rstrip(".").rstrip(":")


def _should_skip_header_like_line(parts: list[str]) -> bool:
    if not parts:
        return True
    first = _norm_first_tok(parts[0])
    if first in _BAD_FIRST:
        return True
    if first.startswith("CODIGO"):
        return True
    return False


def _plausible_qty(v: float) -> bool:
    return 0 < v <= 9999.99


def _plausible_unit_price(v: float) -> bool:
    return 0 < v <= 50_000


def _plausible_line_total(v: float) -> bool:
    return 0 <= v <= 1_000_000


def _token_qty_value(
    q: OcrQuantityParse | None,
    m: OcrMoneyParse | None,
) -> tuple[float | None, bool, bool]:
    """Returns (value, qty_aggressive, used_money_from_qty_slot)."""
    if q and _plausible_qty(q.value):
        return q.value, q.aggressive, False
    if m is not None and _plausible_qty(m.value) and m.value <= 500:
        return m.value, m.aggressive_truncation or m.tiny_or_dubious, True
    return None, False, False


def _token_unit_price_value(
    m: OcrMoneyParse | None,
    q: OcrQuantityParse | None,
) -> tuple[float | None, bool]:
    if m and _plausible_unit_price(m.value):
        return m.value, m.aggressive_truncation or m.tiny_or_dubious
    if q and _plausible_unit_price(q.value):
        return q.value, q.aggressive
    return None, False


def _token_total_value(m: OcrMoneyParse | None) -> tuple[float | None, bool]:
    if m and _plausible_line_total(m.value):
        return m.value, m.aggressive_truncation or m.tiny_or_dubious
    return None, False


@dataclass
class _NumTok:
    ti: int
    q: OcrQuantityParse | None
    m: OcrMoneyParse | None


def _collect_numeric_tokens(parts: list[str]) -> list[_NumTok]:
    out: list[_NumTok] = []
    for i, tok in enumerate(parts):
        q = parse_quantity_token_ocr(tok)
        m = parse_money_token_ocr(tok)
        if q is None and m is None:
            continue
        out.append(_NumTok(ti=i, q=q, m=m))
    return out


def _coherence_score(q: float, p: float, t: float) -> float:
    implied = q * p
    err = abs(implied - t)
    tol = max(0.025, 0.02 * max(abs(t), 1.0))
    if err <= tol:
        return 2000.0 - err * 80.0
    return 400.0 - min(err, 8000.0)


def _raw_name_suspicious(name: str) -> bool:
    s = name.strip()
    if not s or len(s) < 2:
        return True
    if re.fullmatch(r"[\d\s.,/@€$£-]+", s):
        return True
    letters = sum(1 for c in s if c.isalpha())
    if letters == 0:
        return True
    return False


def parse_delivery_note_line(
    line: str,
    *,
    default_unit: QuantityUnit = "kg",
    row: RowInfo | None = None,
) -> ExtractedPurchaseItem | None:
    parts = line.strip().split()
    if len(parts) < 4:
        return None
    if _should_skip_header_like_line(parts):
        return None
    # Albaranes: primera columna suele ser código artículo (90539…); sin template por proveedor, se obvia la fila.
    if parts[0].isdigit() and len(parts[0]) >= 5:
        return None

    nums = _collect_numeric_tokens(parts)
    if len(nums) < 3:
        return None

    tail = nums[-6:] if len(nums) > 6 else nums
    best_score = -1e18
    best: tuple[float, float, float, int, int, int, bool, bool, bool, bool, int] | None = None

    for idx_a, idx_b, idx_c in combinations(range(len(tail)), 3):
        a, b, c = tail[idx_a], tail[idx_b], tail[idx_c]
        if not (a.ti < b.ti < c.ti):
            continue
        qv, ag_q_slot, _fq = _token_qty_value(a.q, a.m)
        pv, ag_p = _token_unit_price_value(b.m, b.q)
        tv, ag_t = _token_total_value(c.m)
        if qv is None or pv is None or tv is None:
            continue
        if qv <= 0 or pv < 0 or tv < 0:
            continue

        sc = _coherence_score(qv, pv, tv)
        trailing = 0
        for tok in parts[c.ti + 1 :]:
            if parse_money_token_ocr(tok) or parse_quantity_token_ocr(tok):
                trailing += 1
        trail_pen = 55.0 * trailing
        sc -= trail_pen

        if qv > tv + 1.0:
            sc -= 120.0
        if pv > tv + 0.05 and tv > 0:
            sc -= 80.0

        if sc > best_score:
            best_score = sc
            best = (qv, pv, tv, a.ti, b.ti, c.ti, ag_q_slot, ag_p, ag_t, trailing > 0, trailing)

    if best is None:
        return None

    qv, pv, tv, ti_a, _ti_b, _ti_c, ag_q, ag_p, ag_t, extra_after, _ntrail = best
    raw_name = " ".join(parts[:ti_a]).strip()
    if not raw_name or _raw_name_suspicious(raw_name):
        return None

    implied = qv * pv
    err = abs(implied - tv)
    tol = max(0.025, 0.02 * max(abs(tv), 1.0))
    math_review = err > tol
    conf = _line_confidence(row)
    low_conf = row is not None and conf < 0.5

    needs_review = bool(
        math_review
        or ag_q
        or ag_p
        or ag_t
        or extra_after
        or low_conf
    )

    return ExtractedPurchaseItem(
        raw_name=raw_name,
        quantity=qv,
        quantity_unit=default_unit,
        unit_price=round(pv, 4),
        total_price=round(tv, 2),
        confidence=conf,
        needs_review=needs_review,
        suggested_ingredient_name=None,
    )


def parse_delivery_note_lines(
    reconstructed_lines: list[str],
    full_raw_text: str,
    rows: list[RowInfo] | None = None,
) -> list[ExtractedPurchaseItem]:
    default_unit: QuantityUnit = "kg" if document_suggests_kg(full_raw_text) else "kg"

    items: list[ExtractedPurchaseItem] = []
    seen: set[tuple[str, float, float]] = set()
    for idx, ln in enumerate(reconstructed_lines):
        ln_st = ln.strip()
        if not ln_st:
            continue
        if is_likely_noise_line(ln_st):
            continue
        row = rows[idx] if rows is not None and idx < len(rows) else None
        it = parse_delivery_note_line(ln_st, default_unit=default_unit, row=row)
        if it:
            key = (it.raw_name, it.quantity, it.total_price)
            if key not in seen:
                seen.add(key)
                items.append(it)
    return items
