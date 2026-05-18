"""Parser unit tests (no Paddle / no network)."""

import pytest

from app.delivery_note_parser import parse_delivery_note_line
from app.receipt_parser import parse_receipt_line
from app.spanish_numbers import parse_money_token_ocr, parse_quantity_token_ocr


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


def test_parse_lubina_noisy_line():
    it = parse_delivery_note_line("LUBINA 10,300 32.00€ 329.60@ 1127", row=None)
    assert it is not None
    assert it.raw_name == "LUBINA"
    assert it.quantity == pytest.approx(10.3)
    assert it.unit_price == pytest.approx(32.0)
    assert it.total_price == pytest.approx(329.6)
    assert it.needs_review is True


def test_parse_mero_three_decimal_money():
    it = parse_delivery_note_line("MERO 3,200 39.50€ 126.406", row=None)
    assert it is not None
    assert it.raw_name == "MERO"
    assert it.quantity == pytest.approx(3.2)
    assert it.unit_price == pytest.approx(39.5)
    assert it.total_price == pytest.approx(126.4)
    assert it.needs_review is True


def test_ignore_header_lines():
    assert parse_delivery_note_line("CODIGO 99062100410/04/26 1,00 2,00 3,00", row=None) is None
    assert parse_delivery_note_line("KILOS PRECIO IMPORTE 1,00 2,00 3,00", row=None) is None


def test_money_token_with_currency_symbol():
    m = parse_money_token_ocr("32.00€")
    assert m is not None
    assert m.value == pytest.approx(32.0)
    assert m.aggressive_truncation is False
    m2 = parse_money_token_ocr("329.60@")
    assert m2 is not None
    assert m2.value == pytest.approx(329.6)


def test_quantity_three_decimals_spanish():
    q = parse_quantity_token_ocr("10,300")
    assert q is not None
    assert q.value == pytest.approx(10.3)
    q2 = parse_quantity_token_ocr("3,200")
    assert q2 is not None
    assert q2.value == pytest.approx(3.2)


def test_money_45_600_aggressive():
    m = parse_money_token_ocr("45.600")
    assert m is not None
    assert m.value == pytest.approx(45.6)
    assert m.aggressive_truncation is True


def test_money_zero_006_tiny():
    m = parse_money_token_ocr("0.006")
    assert m is not None
    assert m.value == pytest.approx(0.0)
    assert m.tiny_or_dubious is True
