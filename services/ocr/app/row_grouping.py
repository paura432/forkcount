"""
Group OCR text blocks into reading-order rows.
"""

from __future__ import annotations

from statistics import median
from typing import TypedDict

from .models import OCRBlock


class RowInfo(TypedDict):
    blocks: list[OCRBlock]
    line_text: str
    y_center: float


def group_blocks_into_rows(blocks: list[OCRBlock]) -> tuple[list[str], list[RowInfo]]:
    if not blocks:
        return [], []

    sorted_blocks = sorted(blocks, key=lambda b: b.y_center)
    heights = [b.height for b in sorted_blocks if b.height > 0]
    med_h = float(median(heights)) if heights else 12.0
    tol = max(0.35 * med_h, 8.0)

    row_groups: list[list[OCRBlock]] = []
    for b in sorted_blocks:
        placed = False
        for row in row_groups:
            ref_y = sum(x.y_center for x in row) / len(row)
            if abs(b.y_center - ref_y) <= tol:
                row.append(b)
                placed = True
                break
        if not placed:
            row_groups.append([b])

    rows: list[RowInfo] = []
    for row_blocks in row_groups:
        row_blocks.sort(key=lambda x: x.x_center)
        line_text = " ".join(x.text.strip() for x in row_blocks if x.text.strip())
        y_c = sum(x.y_center for x in row_blocks) / len(row_blocks)
        rows.append({"blocks": row_blocks, "line_text": line_text, "y_center": y_c})

    rows.sort(key=lambda r: r["y_center"])
    reconstructed = [r["line_text"] for r in rows]
    return reconstructed, rows
