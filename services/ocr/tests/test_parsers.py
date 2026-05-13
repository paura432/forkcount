"""Parser unit tests (no Paddle / no network)."""

import pytest

from app.delivery_note_parser import parse_delivery_note_line
from app.receipt_parser import parse_receipt_line


def test_delivery_lubina():
    it = parse_delivery_note_line("LUBINA 10,300 32,00 329,60", row=None)
    assert it is not None
    assert it.raw_name == "LUBINA"
    assert it.quantity == pytest.approx(10.3)
    assert it.quantity_unit == "kg"
    assert it.unit_price == pytest.approx(32.0)
    assert it.total_price == pytest.approx(329.6)
    assert it.needs_review is False


def test_delivery_mero():
    it = parse_delivery_note_line("MERO 3,200 39,50 126,40", row=None)
    assert it is not None
    assert it.raw_name == "MERO"
    assert it.quantity == pytest.approx(3.2)
    assert it.unit_price == pytest.approx(39.5)
    assert it.total_price == pytest.approx(126.4)
    assert it.needs_review is False


def test_receipt_zanahoria():
    it = parse_receipt_line("ZANAHORIA 500G 1,29", row=None)
    assert it is not None
    assert it.raw_name == "ZANAHORIA"
    assert it.quantity == pytest.approx(500.0)
    assert it.quantity_unit == "g"
    assert it.total_price == pytest.approx(1.29)
    assert it.needs_review is False


def test_receipt_aceite():
    it = parse_receipt_line("ACEITE OLIVA 1L 8,95", row=None)
    assert it is not None
    assert it.raw_name == "ACEITE OLIVA"
    assert it.quantity == pytest.approx(1.0)
    assert it.quantity_unit == "l"
    assert it.total_price == pytest.approx(8.95)
    assert it.needs_review is False


def test_receipt_huevos():
    it = parse_receipt_line("HUEVOS 12 UD 2,45", row=None)
    assert it is not None
    assert it.raw_name == "HUEVOS"
    assert it.quantity == pytest.approx(12.0)
    assert it.quantity_unit == "ud"
    assert it.total_price == pytest.approx(2.45)
    assert it.needs_review is False


def test_receipt_huevos_sin_espacio():
    it = parse_receipt_line("HUEVOS 12u 2,45", row=None)
    assert it is not None
    assert it.raw_name == "HUEVOS"
    assert it.quantity == pytest.approx(12.0)
    assert it.quantity_unit == "ud"
