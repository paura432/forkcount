"""
Optional fuzzy match of OCR product names to catalog names (rapidfuzz if installed).
"""

from __future__ import annotations

import re
import unicodedata
from typing import Iterable

from .models import ExtractedPurchaseItem

try:
    from rapidfuzz import fuzz, process

    _HAS_RF = True
except ImportError:
    _HAS_RF = False


def normalize_for_match(text: str) -> str:
    nf = unicodedata.normalize("NFKD", text)
    stripped = "".join(c for c in nf if not unicodedata.combining(c))
    lowered = stripped.lower()
    return re.sub(r"[^a-z0-9\s]+", " ", lowered)


def suggest_ingredient(
    raw_name: str,
    catalog_names: Iterable[str] | None = None,
    *,
    score_cutoff: float = 82.0,
) -> str | None:
    """
    Return best matching catalog ingredient name or None.
    `catalog_names` reserved for future DB/alias table; empty → always None.
    """
    names = [n for n in (catalog_names or []) if n and n.strip()]
    if not names or not raw_name.strip():
        return None
    if not _HAS_RF:
        return None
    q = normalize_for_match(raw_name)
    if not q.strip():
        return None
    best = process.extractOne(
        q,
        names,
        scorer=fuzz.WRatio,
        processor=normalize_for_match,
    )
    if not best:
        return None
    name, score, _ = best
    if score < score_cutoff:
        return None
    return name


def attach_suggestions(
    items: list[ExtractedPurchaseItem],
    catalog_names: Iterable[str] | None = None,
) -> None:
    for i, it in enumerate(items):
        sug = suggest_ingredient(it.raw_name, catalog_names)
        if sug is not None:
            items[i] = it.model_copy(update={"suggested_ingredient_name": sug})
