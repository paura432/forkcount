"""
Parser for supermarket-style receipts / tickets.
"""

from __future__ import annotations

import re

from .line_noise import is_likely_noise_line
from .models import ExtractedPurchaseItem, QuantityUnit
from .row_grouping import RowInfo
from .spanish_numbers import parse_es_float

# 500g, 500 g, 1kg, 1 kg, 1,5l, 1 l, 12 ud, 12u (word boundary after u for 12u)
_EMBEDDED_QTY = re.compile(
    r"(\d+(?:[.,]\d+)?)\s*(g|kg|ml|l|ud|u)\b",
    re.IGNORECASE,
)


def _unit_from_token(u: str) -> QuantityUnit:
    x = u.lower()
    if x in ("g",):
        return "g"
    if x in ("kg",):
        return "kg"
    if x in ("ml",):
        return "ml"
    if x in ("l", "u"):  # lone u matched as ud
        return "l" if x == "l" else "ud"
    return "ud"


def _line_confidence(row: RowInfo | None) -> float:
    if not row:
        return 0.0
    blocks = row["blocks"]
    if not blocks:
        return 0.0
    return sum(b.confidence for b in blocks) / len(blocks)


def _last_money_token(line: str) -> tuple[str, int, float] | None:
    """Prefix before last numeric token, index of that token, parsed value."""
    parts = line.split()
    for i in range(len(parts) - 1, -1, -1):
        try:
            v = parse_es_float(parts[i])
        except (ValueError, OverflowError):
            continue
        if v >= 0:
            prefix = " ".join(parts[:i]).strip()
            return prefix, i, v
    return None


def parse_receipt_line(line: str, row: RowInfo | None = None) -> ExtractedPurchaseItem | None:
    got = _last_money_token(line)
    if not got:
        return None
    prefix, _money_idx, total_price = got
    if total_price < 0:
        return None

    conf = _line_confidence(row)
    m = _EMBEDDED_QTY.search(prefix)
    if not m:
        raw_name = prefix.strip() or line.strip()
        if not raw_name:
            return None
        return ExtractedPurchaseItem(
            raw_name=raw_name,
            quantity=1.0,
            quantity_unit="ud",
            unit_price=round(total_price, 4),
            total_price=round(total_price, 2),
            confidence=conf,
            needs_review=True,
            suggested_ingredient_name=None,
        )

    qty = parse_es_float(m.group(1))
    if qty <= 0:
        return None
    qu = _unit_from_token(m.group(2))
    raw_name = prefix[: m.start()].strip()
    if not raw_name:
        raw_name = prefix.strip()
    unit_price = total_price / qty if qty > 0 else 0.0
    return ExtractedPurchaseItem(
        raw_name=raw_name,
        quantity=qty,
        quantity_unit=qu,
        unit_price=round(unit_price, 4),
        total_price=round(total_price, 2),
        confidence=conf,
        needs_review=False,
        suggested_ingredient_name=None,
    )


def parse_receipt_lines(
    reconstructed_lines: list[str],
    rows: list[RowInfo] | None = None,
) -> list[ExtractedPurchaseItem]:
    items: list[ExtractedPurchaseItem] = []
    seen: set[tuple[str, float, float]] = set()
    for idx, ln in enumerate(reconstructed_lines):
        ln_st = ln.strip()
        if not ln_st:
            continue
        if is_likely_noise_line(ln_st):
            continue
        row = rows[idx] if rows is not None and idx < len(rows) else None
        it = parse_receipt_line(ln_st, row=row)
        if it:
            key = (it.raw_name, it.quantity, it.total_price)
            if key not in seen:
                seen.add(key)
                items.append(it)
    return items
