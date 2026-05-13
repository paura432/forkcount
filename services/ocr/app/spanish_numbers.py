"""Spanish-style decimal parsing for OCR tokens."""


def parse_es_float(token: str) -> float:
    s = token.strip().replace(" ", "")
    if not s:
        raise ValueError("empty")
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".")
    else:
        if s.count(".") == 1:
            intpart, frac = s.split(".")
            if len(frac) == 3 and intpart.isdigit() and frac.isdigit():
                s = intpart + frac
    return float(s)
