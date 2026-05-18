"""Unit tests for heuristic document header extraction (no Paddle)."""

import pytest

from app.document_parser import (
    extract_customer_tax_id,
    infer_total_from_integer_string,
    parse_document_fields,
    parse_document_number_and_date,
)

# Orden tipo OCR real (logo arriba, razón social, ruido, dirección, bloque cliente)
FACTURA3_TEXT = """
RRAIn ZURRIOLA
PESCADOS Y MARISCOS EASO S.LU
1F809843434
PASEOTXINGURRI 15
20017 SAN SEBASTIAN
ALAMEDA RESTAURANTE
ALAMEDA LIZATZA.S.L
Albaran No Fecha 20280HONDARRIBIA P9
1128086 19/03/2026 GUIPUZCOA Fax
N.l.F.Cliente B20639902
Bruto 456.00
Importe DTOs 0.006
ImparteIVA 45.600
ImporteRE 0.000
Total Albaran 501606
 LUBINA 10,300 32.00€ 329.60@ 1127
""".strip()


def _lines(s: str) -> list[str]:
    return [ln.strip() for ln in s.strip().splitlines() if ln.strip()]


def test_extract_document_number_and_date_factura3_lines():
    lines = _lines(FACTURA3_TEXT)
    num, date, weak = parse_document_number_and_date(lines, FACTURA3_TEXT)
    assert weak is False
    assert num == "1128086"
    assert date == "2026-03-19"


def test_extract_customer_tax_id():
    lines = _lines(FACTURA3_TEXT)
    assert extract_customer_tax_id(lines, FACTURA3_TEXT) == "B20639902"


def test_extract_totals_with_ocr_noise():
    lines = _lines(FACTURA3_TEXT)
    doc, w = parse_document_fields(lines, FACTURA3_TEXT, None)
    assert doc.subtotal == pytest.approx(456.0)
    assert doc.tax == pytest.approx(45.6)
    assert doc.total == pytest.approx(501.6)
    assert any("inferido" in x.lower() and "ocr" in x.lower() for x in w)


def test_total_integer_without_separator_infers_when_consistent():
    v, agg = infer_total_from_integer_string("501606", subtotal=456.0, tax=45.6)
    assert v == pytest.approx(501.6)
    assert agg is True


def test_parse_document_factura3_integration():
    lines = _lines(FACTURA3_TEXT)
    doc, _w = parse_document_fields(lines, FACTURA3_TEXT, None)
    assert doc.supplier_name is not None and "EASO" in doc.supplier_name.upper()
    assert doc.customer_name is not None and "ALAMEDA" in doc.customer_name.upper()
    assert doc.customer_tax_id == "B20639902"


def test_factura3_supplier_prefers_legal_name_over_logo():
    lines = _lines(FACTURA3_TEXT)
    doc, _ = parse_document_fields(lines, FACTURA3_TEXT, None)
    assert doc.supplier_name is not None
    assert "PESCADOS" in doc.supplier_name.upper() or "EASO" in doc.supplier_name.upper()
    assert "RRAIn" not in doc.supplier_name
    assert "ZURRIOLA" not in doc.supplier_name.upper()


def test_factura3_customer_is_alameda_not_supplier():
    lines = _lines(FACTURA3_TEXT)
    doc, _ = parse_document_fields(lines, FACTURA3_TEXT, None)
    assert doc.customer_name is not None
    assert "ALAMEDA" in doc.customer_name.upper()
    assert "PESCADOS" not in doc.customer_name.upper()
    assert "EASO" not in doc.customer_name.upper()
    assert "MARISCOS" not in doc.customer_name.upper()


def test_supplier_and_customer_are_not_same():
    lines = _lines(FACTURA3_TEXT)
    doc, _ = parse_document_fields(lines, FACTURA3_TEXT, None)
    assert doc.supplier_name and doc.customer_name
    assert doc.supplier_name.strip().upper() != doc.customer_name.strip().upper()
