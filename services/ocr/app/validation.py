"""
Post-parse consistency checks: line sums vs document subtotal, subtotal+tax vs total, per-line sanity.
"""

from __future__ import annotations

import re

from .models import ExtractedPurchaseItem, OcrDocumentFields

WARN_ITEMS_SUM_SUBTOTAL = "La suma de líneas no coincide con el subtotal detectado."
WARN_SUBTOTAL_TAX_TOTAL = "Subtotal + IVA no coincide con el total detectado."
WARN_LINES_NEED_REVIEW = "Algunas líneas requieren revisión por importes inconsistentes."

# Single-token names that look like table headers / bands (not products)
_HEADER_TOKEN = frozenset(
    {
        "TOTAL",
        "IVA",
        "DTO",
        "CODIGO",
        "LOTE",
        "KILOS",
        "PRECIO",
        "IMPORTE",
    }
)


def merge_warning_lists(*lists: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for lst in lists:
        for w in lst:
            if w not in seen:
                seen.add(w)
                out.append(w)
    return out


def _norm_token(t: str) -> str:
    u = t.strip().upper()
    for a, b in (("Á", "A"), ("É", "E"), ("Í", "I"), ("Ó", "O"), ("Ú", "U")):
        u = u.replace(a, b)
    return u


def _looks_like_header_name(raw_name: str) -> bool:
    s = raw_name.strip()
    if not s:
        return True
    tokens = [_norm_token(x) for x in re.split(r"\s+", s) if x.strip()]
    if not tokens:
        return True
    if len(tokens) == 1 and tokens[0] in _HEADER_TOKEN:
        return True
    return False


def _item_math_inconsistent(item: ExtractedPurchaseItem) -> bool:
    if item.quantity <= 0 or item.unit_price < 0:
        return False
    tol = max(0.05, 0.02 * max(abs(item.total_price), 1.0))
    return abs(item.quantity * item.unit_price - item.total_price) > tol


def _item_disproportionate_total(item: ExtractedPurchaseItem, subtotal: float | None) -> bool:
    if subtotal is None or subtotal <= 0 or item.total_price <= 0:
        return False
    tol = max(0.05, 0.01 * subtotal)
    return item.total_price > subtotal + tol


def validate_ocr_extraction(
    document: OcrDocumentFields,
    items: list[ExtractedPurchaseItem],
) -> tuple[list[ExtractedPurchaseItem], list[str]]:
    warnings: list[str] = []
    seen: set[str] = set()

    def add_warn(msg: str) -> None:
        if msg not in seen:
            seen.add(msg)
            warnings.append(msg)

    subtotal = document.subtotal
    tax = document.tax
    total = document.total

    item_sum = sum(i.total_price for i in items)
    if subtotal is not None:
        tol_sum = max(0.05, 0.02 * abs(subtotal))
        if abs(item_sum - subtotal) > tol_sum:
            add_warn(WARN_ITEMS_SUM_SUBTOTAL)

    if subtotal is not None and tax is not None and total is not None:
        tol_tt = max(0.05, 0.01 * abs(total))
        if abs((subtotal + tax) - total) > tol_tt:
            add_warn(WARN_SUBTOTAL_TAX_TOTAL)

    marked_review_line = False
    out_items: list[ExtractedPurchaseItem] = []

    for item in items:
        bad = False
        name_st = item.raw_name.strip()
        if item.quantity <= 0:
            bad = True
        if item.unit_price < 0:
            bad = True
        if item.total_price < 0:
            bad = True
        if not name_st or len(name_st) < 2:
            bad = True
        if _looks_like_header_name(item.raw_name):
            bad = True
        if _item_math_inconsistent(item):
            bad = True
        if _item_disproportionate_total(item, subtotal):
            bad = True

        new_review = bool(item.needs_review or bad)
        if bad:
            marked_review_line = True

        out_items.append(item.model_copy(update={"needs_review": new_review}))

    if marked_review_line:
        add_warn(WARN_LINES_NEED_REVIEW)

    return out_items, warnings
