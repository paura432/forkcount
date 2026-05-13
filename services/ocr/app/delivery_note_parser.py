"""
Parser for professional delivery notes (albarán): Descripción / Kilos / Precio / Importe.
"""

from __future__ import annotations

import re

from .line_noise import is_likely_noise_line
from .models import ExtractedPurchaseItem, QuantityUnit
from .row_grouping import RowInfo
from .spanish_numbers import parse_es_float

_NUM_TOKEN = re.compile(r"^[\d.,]+$")


def document_suggests_kg(full_text: str) -> bool:
    t = full_text.lower()
    return "kilos" in t or " kg" in t or "kgs" in t or "\nkg" in t


def _is_numeric_token(tok: str) -> bool:
    if not _NUM_TOKEN.match(tok):
        return False
    try:
        parse_es_float(tok)
    except (ValueError, OverflowError):
        return False
    return True


def _line_confidence(row: RowInfo | None) -> float:
    if not row:
        return 0.0
    blocks = row["blocks"]
    if not blocks:
        return 0.0
    return sum(b.confidence for b in blocks) / len(blocks)


def parse_delivery_note_line(
    line: str,
    *,
    default_unit: QuantityUnit = "kg",
    row: RowInfo | None = None,
) -> ExtractedPurchaseItem | None:
    parts = line.strip().split()
    if len(parts) < 4:
        return None

    end = len(parts)
    start = end
    while start > 0 and _is_numeric_token(parts[start - 1]):
        start -= 1
    suffix = parts[start:end]
    if len(suffix) < 3:
        return None

    qty_tok, up_tok, tot_tok = suffix[-3], suffix[-2], suffix[-1]
    try:
        qty = parse_es_float(qty_tok)
        unit_p = parse_es_float(up_tok)
        total = parse_es_float(tot_tok)
    except (ValueError, OverflowError):
        return None

    if qty <= 0 or unit_p < 0 or total < 0:
        return None

    raw_name = " ".join(parts[:start]).strip()
    if not raw_name:
        return None

    implied = qty * unit_p
    abs_err = abs(implied - total)
    tol = max(0.02, 0.05 * max(total, 1e-6))
    needs_review = abs_err > tol

    conf = _line_confidence(row)
    return ExtractedPurchaseItem(
        raw_name=raw_name,
        quantity=qty,
        quantity_unit=default_unit,
        unit_price=round(unit_p, 4),
        total_price=round(total, 2),
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
