from typing import Literal

from pydantic import BaseModel, Field

QuantityUnit = Literal["g", "kg", "ml", "l", "ud"]
DocumentTypeHint = Literal["invoice", "delivery_note", "receipt", "order"]


class OCRBlock(BaseModel):
    text: str
    confidence: float = Field(ge=0.0, le=1.0)
    bbox: list[list[float]]  # [[x,y],...] four corners
    x_center: float
    y_center: float
    width: float
    height: float


class ExtractedPurchaseItem(BaseModel):
    raw_name: str = Field(..., min_length=1)
    quantity: float = Field(..., gt=0)
    quantity_unit: QuantityUnit
    unit_price: float = Field(..., ge=0)
    total_price: float = Field(..., ge=0)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    needs_review: bool = False
    suggested_ingredient_name: str | None = None


class OcrDocumentFields(BaseModel):
    """Header-level fields extracted from the document (optional; filled by later pipeline stages)."""

    supplier_name: str | None = None
    supplier_tax_id: str | None = None
    customer_name: str | None = None
    customer_tax_id: str | None = None
    document_number: str | None = None
    document_date: str | None = None
    subtotal: float | None = None
    tax: float | None = None
    total: float | None = None


class OcrDebugInfo(BaseModel):
    parser_used: str
    image_preprocessed: bool
    row_count: int
    block_count: int
    warnings: list[str] = Field(default_factory=list)


class OcrExtractResponse(BaseModel):
    ok: bool = True
    text: str = ""
    reconstructed_lines: list[str]
    items: list[ExtractedPurchaseItem]
    document: OcrDocumentFields = Field(default_factory=OcrDocumentFields)
    debug: OcrDebugInfo
    blocks: list[OCRBlock]
    # Legacy aliases for older clients
    raw_text: str = ""
    lines: list[str] = Field(default_factory=list)
