"""
Heuristic extraction of document header fields (Spanish invoices / delivery notes).
No OCR engine — works on reconstructed_lines + full text.
"""

from __future__ import annotations

import math
import re

from .models import OcrDocumentFields, ExtractedPurchaseItem
from .spanish_numbers import parse_money_token_ocr

# Lines that are not company / party names (labels, totals band, addresses with codes only)
_META_NAME_SKIP = re.compile(
    r"(?i)"
    r"(^|\s)("
    r"ALBARAN|ALBARÁN|NOALBARAN|N[º°]?\s*ALBARAN|FACTURA|FECHA|DATA|"
    r"N[\.\s]*I[\.\s]*F[\.\s]*|CIF|C\.I\.F\.|I\.F\.K|"
    r"BRUTO|BASE\s*IMPONIBLE|BASE|NETO|IMPONIBLE|SUMA|"
    r"IVA|IMPORTE|IMPARTE|DTO|TOTAL|RE\b|RECARGO|EUR|EURO|"
    r"FAX|TEL|TLF|TELF|PAGE|PAG|"
    r"HONDARRIBIA|GUIPUZ|GIPUZ|\bP\d+\b"
    r")\b"
)

# Amount labels (value often after label or on same line)
_RE_BRUTO = re.compile(
    r"(?i)(^|\s)(BRUTO|BASE\s*IMPONIBLE|BASE\s+IM|NETO|NET)\s*[:\s]*([\d.,]+)"
)
_RE_IVA = re.compile(
    r"(?i)(?:IMPARTEIVA|IMPARTE\s*I\s*V\s*A|IMPORTE\s*IVA|IMPTO\.\s*IVA|\bIVA\b)\s*[:\s]*([\d.,]+)"
)
_RE_TOTAL = re.compile(
    r"(?i)(TOTAL\s*ALBARAN|TOTALALBARAN|ALBARANGUZTIRA|TOTAL\s+ALBAR|TOTAL\s*:?)\s*([\d.,]+)"
)

_RE_TAX_ID_NEAR_CLIENT = re.compile(
    r"(?i)(CLIENTE|CLTE\.?|DESTINATARIO).{0,40}?([A-Z]\d{8}|[A-Z]\d{7}[0-9A-Z]|\d{8}[A-Z])"
)
_RE_TAX_ID_GENERIC = re.compile(r"\b([A-Z]\d{8}|[A-Z]\d{7}[0-9A-Z]|\d{8}[A-Z])\b", re.I)

_RE_DATE = re.compile(r"\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4}|\d{2})\b")
_RE_DOCNUM_NEAR_DATE = re.compile(
    r"(?i)^\s*(\d{6,9})\s+(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})\b"
)
_RE_DOCNUM_ALBARAN = re.compile(r"(?i)(ALBARAN|NO\s*ALBARAN|N[º°])\D{0,15}(\d{5,10})")
_RE_DOCNUMBER_STANDALONE = re.compile(r"\b(\d{7,9})\s+(?=\d{1,2}[/\-.])")


def _norm_company_display(s: str) -> str:
    t = " ".join(s.split())
    t = re.sub(r"\.{2,}", ".", t)
    t = re.sub(r"(?i)\bS\.L\.U\b", "S.L.U.", t)
    t = re.sub(r"(?i)\bS\.LU\b", "S.L.U.", t)
    t = re.sub(r"(?i)\bS\.?\s*L\.?\s*U\.?\b", "S.L.U.", t)
    t = re.sub(r"(?i)\bS\.?\s*L\.?\b", "S.L.", t)
    t = re.sub(r"(?i)\bS\.?\s*A\.?\b", "S.A.", t)
    return t.strip()


_RE_POSTAL_CITY = re.compile(r"\b\d{5}\s+[A-ZÁÉÍÓÚÑ]", re.I)
_RE_STREET_WORD = re.compile(
    r"(?i)\b(CALLE|AVDA|AV\.|PLAZA|PASEO|PASEOTXINGURRI|POL\.|POLIGONO|CTRA\.?|CTRA)\b"
)
_RE_EMAIL = re.compile(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}")
_RE_CITY_HINT = re.compile(
    r"(?i)\b(SAN SEBASTIAN|DONOSTIA|HONDARRIBIA|GUIPUZ|GIPUZ|IRUN|EIBAR)\b"
)

# Lines near "cliente" / NIF cliente — used to anchor customer name search
_RE_CLIENT_BLOCK_LABEL = re.compile(
    r"(?i)"
    r"(N\.?\s*l\.?\s*I\.?\s*F\.?\s*Cliente|"
    r"N\.?\s*I\.?\s*F\.?\s*Cliente|"
    r"CIF\s*Cliente|"
    r"C\.?\s*I\.?\s*F\.?\s*Cliente|"
    r"Cod\.?\s*Cliente|"
    r"Direc(ci[oó]n)?\s*(Fiscal|Entrega)|"
    r"\bCli[eé]nte\s*[:\.])"
)


def _is_probably_not_party_name(line: str) -> bool:
    s = line.strip()
    if len(s) < 3:
        return True
    if _META_NAME_SKIP.search(s):
        return True
    if re.fullmatch(r"[\d\s.,/@€$-]+", s):
        return True
    letters = sum(1 for c in s if c.isalpha())
    if letters < 3:
        return True
    return False


def _is_garbage_reference_line(s: str) -> bool:
    t = s.strip()
    if not t:
        return True
    if _RE_EMAIL.search(t):
        return True
    if re.search(r"(?i)\b(TLF|TEL|TFNO|TELÉFONO|TELEFONO|MVIL|MÓVIL|MOVIL|FAX)\b", t):
        return True
    if re.fullmatch(r"(?i)[A-Z0-9][A-Z0-9._-]{8,}", t) and sum(c.isdigit() for c in t) >= 6:
        return True
    alnum = sum(1 for c in t if c.isalnum())
    digits = sum(1 for c in t if c.isdigit())
    if alnum >= 8 and digits >= 6 and digits / max(alnum, 1) > 0.55:
        return True
    return False


def _is_address_line(s: str) -> bool:
    t = s.strip()
    if _RE_POSTAL_CITY.search(t):
        return True
    if _RE_STREET_WORD.search(t):
        return True
    if _RE_CITY_HINT.search(t) and len(t) < 55:
        return True
    # "… 15" calle sin forma jurídica
    if re.search(r"(?i)\d+\s*$", t) and not re.search(r"(?i)S\.L|S\.A|SLU|RESTAURANTE", t):
        if len(t) < 48 and re.search(r"(?i)[A-Za-zÁÉÍÓÚÑáéíóúñ]{4,}", t):
            return True
    return False


def _supplier_candidate_score(line: str) -> int:
    s = line.strip()
    u = s.upper()
    score = 0
    if re.search(r"(?i)\bS\.?\s*L\.?\s*U\.?\b|S\.L\.U\.|SLU\b", s):
        score += 14
    elif re.search(r"(?i)\bS\.L\.|(?<![A-Z])\bSL\b(?![A-Z])", s):
        score += 11
    if re.search(r"(?i)\bS\.A\.|\bSA\b", s):
        score += 11
    if re.search(r"(?i)\bC\.B\.|\bCB\b", s):
        score += 9
    if re.search(r"(?i)SOCIEDAD|COMERCIAL", s):
        score += 7
    if re.search(r"(?i)PESCADOS|MARISCOS", s):
        score += 9
    if re.search(r"(?i)\bEASO\b", s):
        score += 5
    # Logo o marca corta sin forma jurídica: peor candidato
    if score < 8 and len(s) < 22 and len(s.split()) <= 3:
        score = max(score, 1)
    return score


def _customer_candidate_score(line: str) -> int:
    s = line.strip()
    score = 0
    if re.search(r"(?i)RESTAURANTE|BAR\b|CAFÉ|CAFE", s):
        score += 16
    if re.search(r"(?i)\bS\.?\s*L\.?\s*U\.?\b|S\.L\.U\.|SLU\b|\bS\.L\.|(?<![A-Z])\bSL\b(?![A-Z])", s):
        score += 12
    if re.search(r"(?i)\bS\.A\.", s):
        score += 10
    if re.search(r"(?i)\bALAMEDA\b", s):
        score += 6
    if len(re.findall(r"[A-Za-zÁÉÍÓÚÑáéíóúñ]{3,}", s)) >= 2:
        score += 3
    return score


def _norm_name_key(name: str | None) -> str:
    if not name:
        return ""
    return re.sub(r"[^A-Z0-9]+", "", name.upper())


def _find_client_label_index(lines: list[str]) -> int | None:
    for i, ln in enumerate(lines):
        if _RE_CLIENT_BLOCK_LABEL.search(ln.strip()):
            return i
    return None


def _pick_supplier_line(lines: list[str], *, header_max: int = 18) -> tuple[str | None, int]:
    best_raw: str | None = None
    best_score = -10_000
    best_idx = -1
    limit = min(len(lines), header_max)
    for i in range(limit):
        st = lines[i].strip()
        if not st or _is_probably_not_party_name(st):
            continue
        if _is_address_line(st):
            continue
        if _is_garbage_reference_line(st):
            continue
        if re.search(r"(?i)RESTAURANTE", st) and not re.search(
            r"(?i)\bS\.L|S\.A|SLU|PESCADOS|MARISCOS", st
        ):
            continue
        sc = _supplier_candidate_score(st)
        if sc > best_score:
            best_score = sc
            best_raw = st
            best_idx = i
    if best_raw is None:
        return None, -1
    return _norm_company_display(best_raw), best_idx


def _pick_customer_name(
    lines: list[str],
    *,
    supplier_name: str | None,
    supplier_idx: int,
) -> str | None:
    sup_key = _norm_name_key(supplier_name)
    cust_idx = _find_client_label_index(lines)
    if cust_idx is not None and cust_idx > 0:
        best: str | None = None
        best_sc = -1
        for off in range(1, 8):
            j = cust_idx - off
            if j < 0:
                break
            if j <= supplier_idx:
                continue
            st = lines[j].strip()
            if not st or _is_probably_not_party_name(st):
                continue
            if _is_address_line(st):
                continue
            if _is_garbage_reference_line(st):
                continue
            disp = _norm_company_display(st)
            ck = _norm_name_key(disp)
            if sup_key and ck == sup_key:
                continue
            if sup_key and len(sup_key) > 8 and sup_key in ck and "ALAMEDA" not in disp.upper():
                continue
            if re.search(r"(?i)PESCADOS|MARISCOS|EASO", st) and "ALAMEDA" not in st.upper():
                continue
            sc = _customer_candidate_score(st)
            if sc > best_sc:
                best_sc = sc
                best = disp
        if best:
            return best

    # Fallback: tras cabecera de proveedor, primera razón social que no sea el proveedor
    customer = None
    start = max(supplier_idx + 1, 0)
    for j in range(start, len(lines)):
        if cust_idx is not None and j >= cust_idx:
            break
        st = lines[j].strip()
        if not st or _is_probably_not_party_name(st):
            continue
        if _is_address_line(st) or _is_garbage_reference_line(st):
            continue
        if re.search(r"(?i)PESCADOS|MARISCOS|EASO", st) and "ALAMEDA" not in st.upper():
            continue
        disp = _norm_company_display(st)
        ck = _norm_name_key(disp)
        if sup_key and ck == sup_key:
            continue
        if re.search(r"(?i)RESTAURANTE|S\.L\.U\.|\bS\.L\.|SLU\b|S\.A\.", st):
            customer = disp
            break
        if customer is None and re.search(r"(?i)ALAMEDA", st):
            customer = disp
    return customer


def _pick_supplier_customer(lines: list[str]) -> tuple[str | None, str | None]:
    sup, sup_i = _pick_supplier_line(lines)
    cust = _pick_customer_name(lines, supplier_name=sup, supplier_idx=sup_i)
    return sup, cust


def _date_to_iso(d: int, m: int, y: int) -> str | None:
    if y < 100:
        y += 2000 if y < 70 else 1900
    if not (1 <= m <= 12 and 1 <= d <= 31 and 1990 <= y <= 2100):
        return None
    return f"{y:04d}-{m:02d}-{d:02d}"


def extract_dates_from_text(text: str) -> list[tuple[int, int, int, str]]:
    """Return (d,m,y, raw_match) for each date found."""
    out: list[tuple[int, int, int, str]] = []
    for m in _RE_DATE.finditer(text):
        d, mo, yr = int(m.group(1)), int(m.group(2)), int(m.group(3))
        out.append((d, mo, yr, m.group(0)))
    return out


def parse_document_number_and_date(lines: list[str], full_text: str) -> tuple[str | None, str | None, bool]:
    """
    document_number, document_date (ISO), weak_number_flag.
    """
    weak_num = False
    docnum: str | None = None
    docdate: str | None = None

    for ln in lines:
        m = _RE_DOCNUM_NEAR_DATE.match(ln.strip())
        if m:
            docnum = m.group(1)
            d, mo, y = int(m.group(2)), int(m.group(3)), int(m.group(4))
            iso = _date_to_iso(d, mo, y)
            if iso:
                docdate = iso
            weak_num = False
            return docnum, docdate, weak_num

    # "1128086 19/03/2026" without strict start
    m2 = _RE_DOCNUMBER_STANDALONE.search(full_text)
    if m2:
        docnum = m2.group(1)
        weak_num = True
        tail = full_text[m2.end() :]
        dm = _RE_DATE.search(tail)
        if dm:
            docdate = _date_to_iso(int(dm.group(1)), int(dm.group(2)), int(dm.group(3)))

    if docnum is None:
        m3 = _RE_DOCNUM_ALBARAN.search(full_text)
        if m3:
            docnum = m3.group(2)
            weak_num = True

    if docdate is None:
        dates = extract_dates_from_text(full_text)
        header_dates = [t for t in dates if t[2] >= 2000]
        if header_dates:
            d, mo, y, _ = header_dates[0]
            docdate = _date_to_iso(d, mo, y)

    return docnum, docdate, weak_num


def extract_customer_tax_id(lines: list[str], full_text: str) -> str | None:
    for ln in lines:
        m = _RE_TAX_ID_NEAR_CLIENT.search(ln)
        if m:
            return m.group(2).upper()
    return None


def _money_from_token(tok: str) -> float | None:
    p = parse_money_token_ocr(tok)
    return p.value if p else None


def _money_from_match(m: re.Match[str], group_idx: int) -> float | None:
    raw = m.group(group_idx).strip()
    return _money_from_token(raw)


def extract_subtotal_and_tax(full_text: str) -> tuple[float | None, float | None]:
    sub: float | None = None
    tax: float | None = None
    for m in _RE_BRUTO.finditer(full_text):
        v = _money_from_match(m, 3)
        if v is not None:
            sub = v
            break
    for m in _RE_IVA.finditer(full_text):
        v = _money_from_match(m, 1)
        if v is not None:
            tax = v
            break
    return sub, tax


def extract_total_parsed(
    full_text: str,
    subtotal: float | None,
    tax: float | None,
) -> tuple[float | None, list[str]]:
    warn: list[str] = []
    m = _RE_TOTAL.search(full_text)
    if not m:
        return None, warn
    raw = m.group(2).strip()
    digits_only = re.sub(r"\D", "", raw)
    compact = raw.replace(" ", "")
    if len(digits_only) >= 4 and compact == digits_only and "." not in raw and "," not in raw:
        v, agg = infer_total_from_integer_string(digits_only, subtotal=subtotal, tax=tax)
        if v is not None:
            if agg:
                warn.append(
                    "El total se ha inferido desde un número OCR sin separador decimal."
                )
            return v, warn
    tv = _money_from_token(raw)
    return tv, warn


def infer_total_from_integer_string(
    raw: str,
    *,
    subtotal: float | None,
    tax: float | None,
) -> tuple[float | None, bool]:
    """
    OCR without decimal separator, e.g. 501606 near Total.
    Returns (value, aggressive).
    """
    digits = re.sub(r"\D", "", raw)
    if not digits or len(digits) < 4:
        return None, False
    n = int(digits)
    expected: float | None = None
    if subtotal is not None and tax is not None:
        expected = round(subtotal + tax, 2)

    candidates: list[tuple[float, int]] = []
    for scale in (1000, 100, 10):
        v = math.floor((n / scale) * 100 + 1e-9) / 100
        if 0 < v < 9_999_999:
            candidates.append((v, scale))

    if expected is not None:
        best: tuple[float, int] | None = None
        best_err = 1e9
        for v, scale in candidates:
            err = abs(v - expected)
            if err < best_err:
                best_err = err
                best = (v, scale)
        if best is not None and best_err <= 0.06:
            aggressive = best[1] != 100 or raw.isdigit()
            return best[0], aggressive

    v_fallback = math.floor((n / 1000.0) * 100 + 1e-9) / 100
    return v_fallback, True


def parse_document_fields(
    reconstructed_lines: list[str],
    full_text: str,
    items: list[ExtractedPurchaseItem] | None = None,
) -> tuple[OcrDocumentFields, list[str]]:
    """
    Fill OcrDocumentFields from OCR text. Never raises.
    `items` reserved for future cross-checks (FASE 6).
    """
    _ = items
    warnings: list[str] = []
    lines = [ln.strip() for ln in reconstructed_lines if ln.strip()]
    doc = OcrDocumentFields()

    sup, cust = _pick_supplier_customer(lines)
    doc.supplier_name = sup
    doc.customer_name = cust

    doc.document_number, doc.document_date, weak_docnum = parse_document_number_and_date(lines, full_text)
    if weak_docnum and doc.document_number:
        warnings.append("document_number inferred from weak OCR context; verify.")

    doc.customer_tax_id = extract_customer_tax_id(lines, full_text)
    if doc.customer_tax_id is None:
        for ln in lines:
            if re.search(r"(?i)cliente", ln):
                m = _RE_TAX_ID_GENERIC.search(ln)
                if m:
                    doc.customer_tax_id = m.group(1).upper()
                    break

    # Supplier tax id: first tax id in early lines not already customer (heuristic)
    early_text = "\n".join(lines[:12])
    for m in _RE_TAX_ID_GENERIC.finditer(early_text):
        tid = m.group(1).upper()
        if doc.customer_tax_id and tid == doc.customer_tax_id:
            continue
        ls = early_text.rfind("\n", 0, m.start()) + 1
        le = early_text.find("\n", m.start())
        line_ctx = early_text[ls : le if le != -1 else len(early_text)]
        if re.search(r"(?i)cliente", line_ctx):
            continue
        doc.supplier_tax_id = tid
        break

    sub, tax = extract_subtotal_and_tax(full_text)
    doc.subtotal = sub
    doc.tax = tax
    tot, tot_w = extract_total_parsed(full_text, sub, tax)
    warnings.extend(tot_w)
    doc.total = tot

    return doc, warnings
