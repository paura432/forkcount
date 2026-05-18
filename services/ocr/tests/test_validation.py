"""OCR extraction consistency validation (no Paddle)."""

import pytest

from app.models import ExtractedPurchaseItem, OcrDocumentFields
from app.validation import (
    WARN_ITEMS_SUM_SUBTOTAL,
    WARN_LINES_NEED_REVIEW,
    WARN_SUBTOTAL_TAX_TOTAL,
    merge_warning_lists,
    validate_ocr_extraction,
)


def _item(
    *,
    name="LUBINA",
    qty=10.3,
    unit=32.0,
    total=329.6,
    review=False,
) -> ExtractedPurchaseItem:
    return ExtractedPurchaseItem(
        raw_name=name,
        quantity=qty,
        quantity_unit="kg",
        unit_price=unit,
        total_price=total,
        confidence=0.9,
        needs_review=review,
        suggested_ingredient_name=None,
    )


def test_items_sum_matches_subtotal_no_warning():
    doc = OcrDocumentFields(subtotal=456.0, tax=45.6, total=501.6)
    items = [_item(name="LUBINA", qty=1, unit=329.6, total=329.6), _item(name="MERO", qty=1, unit=126.4, total=126.4)]
    out, w = validate_ocr_extraction(doc, items)
    assert WARN_ITEMS_SUM_SUBTOTAL not in w
    assert len(out) == 2


def test_items_sum_mismatch_adds_warning():
    doc = OcrDocumentFields(subtotal=100.0)
    items = [_item(total=40.0), _item(name="MERO", total=30.0)]
    _, w = validate_ocr_extraction(doc, items)
    assert WARN_ITEMS_SUM_SUBTOTAL in w


def test_subtotal_tax_total_match_no_warning():
    doc = OcrDocumentFields(subtotal=456.0, tax=45.6, total=501.6)
    items = [_item(name="A", total=456.0)]
    _, w = validate_ocr_extraction(doc, items)
    assert WARN_SUBTOTAL_TAX_TOTAL not in w


def test_subtotal_tax_total_mismatch_adds_warning():
    doc = OcrDocumentFields(subtotal=100.0, tax=21.0, total=999.0)
    items = [_item(name="A", total=50.0)]
    _, w = validate_ocr_extraction(doc, items)
    assert WARN_SUBTOTAL_TAX_TOTAL in w


def test_suspicious_item_marked_needs_review():
    it = ExtractedPurchaseItem.model_construct(
        raw_name="IVA",
        quantity=1.0,
        quantity_unit="kg",
        unit_price=10.0,
        total_price=10.0,
        confidence=0.5,
        needs_review=False,
        suggested_ingredient_name=None,
    )
    doc = OcrDocumentFields()
    out, w = validate_ocr_extraction(doc, [it])
    assert out[0].needs_review is True
    assert WARN_LINES_NEED_REVIEW in w


def test_duplicate_warnings_are_deduped():
    a = [WARN_ITEMS_SUM_SUBTOTAL, WARN_SUBTOTAL_TAX_TOTAL]
    b = [WARN_ITEMS_SUM_SUBTOTAL, "other"]
    m = merge_warning_lists(a, b)
    assert m.count(WARN_ITEMS_SUM_SUBTOTAL) == 1
    assert m == [WARN_ITEMS_SUM_SUBTOTAL, WARN_SUBTOTAL_TAX_TOTAL, "other"]


def test_factura3_scenario_no_doc_warnings():
    """LUBINA + MERO = 456 vs subtotal 456; 456+45.6=501.6."""
    doc = OcrDocumentFields(subtotal=456.0, tax=45.6, total=501.6)
    items = [
        _item(name="LUBINA", qty=10.3, unit=32.0, total=329.6),
        _item(name="MERO", qty=3.2, unit=39.5, total=126.4),
    ]
    _, w = validate_ocr_extraction(doc, items)
    assert WARN_ITEMS_SUM_SUBTOTAL not in w
    assert WARN_SUBTOTAL_TAX_TOTAL not in w
