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


class OcrDebugInfo(BaseModel):
    parser_used: str
    image_preprocessed: bool
    row_count: int
    block_count: int


class OcrExtractResponse(BaseModel):
    raw_text: str
    blocks: list[OCRBlock]
    reconstructed_lines: list[str]
    items: list[ExtractedPurchaseItem]
    debug: OcrDebugInfo
    # Legacy aliases for older clients
    text: str = ""
    lines: list[str] = Field(default_factory=list)
