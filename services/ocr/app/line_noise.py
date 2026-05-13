"""
Detect header/footer lines (totals, tax) so they are not parsed as products — rapidfuzz.
"""

from __future__ import annotations

import re

from rapidfuzz import fuzz

_NOISE_CANON = [
    "TOTAL",
    "SUBTOTAL",
    "IVA",
    "IMPONIBLE",
    "IMPORTE",
    "SUMA",
    "CAMBIO",
    "TARJETA",
    "EFECTIVO",
    "DESCUENTO",
    "ARTICULO",
    "CANT",
    "PRECIO",
    "UNIDAD",
    "KILOS",
    "DESCRIPCION",
    "ALBARAN",
    "FACTURA",
    "FECHA",
    "CLIENTE",
    "PROVEEDOR",
    "PAGINA",
    "GRACIAS",
    "PAGO",
    "RECIBIDO",
]

_WS = re.compile(r"\s+")


def _canon(s: str) -> str:
    t = _WS.sub(" ", s.strip()).upper()
    for a, b in (
        ("Á", "A"),
        ("É", "E"),
        ("Í", "I"),
        ("Ó", "O"),
        ("Ú", "U"),
        ("Ü", "U"),
        ("Ñ", "N"),
    ):
        t = t.replace(a, b)
    return t


def _first_token_noise(first: str, *, cutoff: float = 90.0) -> bool:
    c = _canon(first)
    if not c:
        return True
    for p in _NOISE_CANON:
        if fuzz.ratio(c, p) >= cutoff:
            return True
        if len(c) <= len(p) + 2 and fuzz.partial_ratio(p, c) >= cutoff:
            return True
    return False


def is_likely_noise_line(line: str) -> bool:
    """True if the line looks like a table header or total row, not a product."""
    if not line or not line.strip():
        return True
    parts = line.split()
    if _first_token_noise(parts[0]):
        return True
    if len(parts) == 1:
        if re.fullmatch(r"[\d.,]+", parts[0] or ""):
            return True
        return False

    c = _canon(line)
    letters = sum(1 for ch in c if ch.isalpha())
    if letters < 3 and re.search(r"\d", c):
        return True

    return False
