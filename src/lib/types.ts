/** Unidad de inventario/coste por ingrediente (coincide con check SQL). */
export const INGREDIENT_UNITS = ["g", "kg", "ml", "l", "ud"] as const;
export type IngredientUnit = (typeof INGREDIENT_UNITS)[number];

export const PURCHASE_DOCUMENT_TYPES = [
  "invoice",
  "delivery_note",
  "receipt",
  "order",
] as const;
export type PurchaseDocumentType = (typeof PURCHASE_DOCUMENT_TYPES)[number];

export const PURCHASE_STATUSES = ["draft", "pending_review", "confirmed"] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

export const EXTRACTION_SOURCES = ["manual", "ocr", "ocr_image"] as const;
export type ExtractionSource = (typeof EXTRACTION_SOURCES)[number];

export type Restaurant = {
  id: string;
  name: string;
  created_at: string;
};

export type Profile = {
  id: string;
  restaurant_id: string;
  role: string;
  created_at: string;
};

export type Supplier = {
  id: string;
  restaurant_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  created_at: string;
};

export type SupplierInsert = Pick<Supplier, "name" | "phone" | "email">;

export type Ingredient = {
  id: string;
  restaurant_id: string;
  name: string;
  unit: IngredientUnit;
  created_at: string;
};

export type IngredientInsert = Pick<Ingredient, "name" | "unit">;

/** Cabecera de compra / documento de proveedor (adjunto en Storage cuando exista). */
export type Purchase = {
  id: string;
  restaurant_id: string;
  supplier_id: string;
  purchase_date: string;
  document_type: PurchaseDocumentType;
  document_number: string | null;
  subtotal: number | null;
  tax_amount: number | null;
  total_amount: number | null;
  status: PurchaseStatus;
  extraction_source: ExtractionSource;
  invoice_path: string | null;
  invoice_original_name: string | null;
  notes: string | null;
  /** Extracción OCR/IA; puede faltar en selects parciales. */
  invoice_ocr_status?: string | null;
  invoice_ocr_raw?: unknown | null;
  invoice_ocr_error?: string | null;
  created_at: string;
};

export type PurchaseItem = {
  id: string;
  restaurant_id: string;
  purchase_id: string;
  ingredient_id: string | null;
  raw_name: string;
  quantity: number;
  quantity_unit: IngredientUnit;
  total_price: number;
  unit_price: number;
  normalized_quantity: number;
  normalized_unit: "g" | "ml" | "ud";
  normalized_unit_price: number;
  created_at: string;
};

/** Fila devuelta por RPC `latest_unit_prices`. */
export type LatestUnitPriceRow = {
  ingredient_id: string;
  unit_price: number;
  purchase_date: string;
};

export type Recipe = {
  id: string;
  restaurant_id: string;
  name: string;
  description: string | null;
  servings: number;
  /** Precio de venta por ración (€), opcional. */
  selling_price: number | null;
  created_at: string;
};

export type LaborRole = {
  id: string;
  restaurant_id: string;
  name: string;
  hourly_cost: number;
  created_at: string;
};

export type LaborRoleInsert = Pick<LaborRole, "name" | "hourly_cost">;

export type RecipeLaborItem = {
  id: string;
  restaurant_id: string;
  recipe_id: string;
  labor_role_id: string;
  minutes: number;
  calculated_cost: number;
  notes: string | null;
  created_at: string;
};

export type RecipeItem = {
  id: string;
  restaurant_id: string;
  recipe_id: string;
  ingredient_id: string;
  quantity: number;
  /** Porcentaje aprovechable (100 = sin merma). */
  ingredient_yield_percentage: number;
  created_at: string;
};

/** Línea de receta + unidad del ingrediente (para validar conversiones). */
export type RecipeLineForCost = {
  ingredient_id: string;
  quantity: number;
  ingredient_unit: IngredientUnit;
  /** Porcentaje aprovechable; default 100 en callers. */
  ingredient_yield_percentage: number;
};

/** Entrada de mano de obra resuelta (€/h ya conocido). */
export type RecipeLaborLineResolved = {
  minutes: number;
  hourly_cost: number;
};

export type RecipeCostLine = {
  ingredient_id: string;
  quantity: number;
  ingredient_yield_percentage: number;
  unit_price: number | null;
  line_cost_naive: number | null;
  line_cost: number | null;
};

export type RecipeCostBreakdown = {
  lines: RecipeCostLine[];
  /** Suma líneas con yield (coste real materias). */
  total: number | null;
  /** Suma sin ajuste de merma. */
  total_naive: number | null;
  missing_ingredient_ids: string[];
};

/** Resumen económico de una receta (app; coherente con RPC `recipe_total_cost`). */
export type RecipeCostSummary = {
  ingredient_cost_naive: number | null;
  ingredient_cost: number | null;
  waste_adjustment_cost: number | null;
  labor_cost: number | null;
  total_cost: number | null;
  servings: number;
  cost_per_serving: number | null;
  selling_price: number | null;
  gross_margin: number | null;
  food_cost_percentage: number | null;
  missing_ingredient_ids: string[];
};

export type WeightedLot = {
  ingredient_id: string;
  quantity: number;
  unit_price: number;
};
