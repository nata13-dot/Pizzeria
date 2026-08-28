export type NumericValue = string | number;

export type Paginated<T> = {
  data: T[];
  current_page: number;
  last_page: number;
};

export type UnitDimension = "mass" | "volume" | "count";

export type Unit = {
  id: number;
  name: string;
  symbol: string;
  dimension: UnitDimension;
  base_factor: NumericValue;
  active: boolean;
};

export type IngredientType = {
  id: number;
  name: string;
  suggested_shelf_life_days?: number | null;
  expiry_alert_days: number;
  active: boolean;
};

export type IngredientPresentation = {
  id: number;
  ingredient_id: number;
  name: string;
  quantity: NumericValue;
  equivalent_unit_id: number;
  base_quantity: NumericValue;
  supplier_sku?: string | null;
  active: boolean;
  equivalent_unit?: Unit | null;
};

export type Ingredient = {
  id: number;
  branch_id: number;
  ingredient_type_id?: number | null;
  base_unit_id: number;
  name: string;
  sku?: string | null;
  minimum_stock: NumericValue;
  critical_stock: NumericValue;
  shelf_life_days?: number | null;
  expiry_alert_days: number;
  active: boolean;
  current_stock: NumericValue;
  base_unit?: Unit | null;
  type?: IngredientType | null;
  presentations?: IngredientPresentation[];
};

export type InventoryBatch = {
  id: number;
  branch_id: number;
  ingredient_id: number;
  purchase_item_id?: number | null;
  lot_code?: string | null;
  received_at: string;
  expires_at?: string | null;
  initial_quantity: NumericValue;
  available_quantity: NumericValue;
  unit_cost: NumericValue;
  ingredient?: Ingredient | null;
};

export type InventoryMovement = {
  id: number;
  ingredient_id: number;
  inventory_batch_id: number;
  type: string;
  quantity: NumericValue;
  quantity_before: NumericValue;
  quantity_after: NumericValue;
  reason?: string | null;
  comment?: string | null;
  created_at: string;
  ingredient?: Ingredient | null;
  batch?: InventoryBatch | null;
};

export type InventoryAlert = {
  id: number;
  ingredient_id?: number | null;
  inventory_batch_id?: number | null;
  type: string;
  severity: string;
  message: string;
  created_at: string;
  ingredient?: Ingredient | null;
  batch?: InventoryBatch | null;
};

export type Supplier = {
  id: number;
  name: string;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  active: boolean;
};

export type PaymentSource = "cash" | "owner" | "bank" | "credit" | "other";

export type PurchaseItem = {
  id: number;
  ingredient_id: number;
  ingredient_presentation_id: number;
  presentations_quantity: NumericValue;
  base_quantity: NumericValue;
  total_cost: NumericValue;
  base_unit_cost: NumericValue;
  expires_at?: string | null;
  lot_code?: string | null;
  ingredient?: Ingredient | null;
};

export type Purchase = {
  id: number;
  supplier_id?: number | null;
  purchased_at: string;
  payment_source: PaymentSource;
  total: NumericValue;
  notes?: string | null;
  created_at: string;
  supplier?: Supplier | null;
  items: PurchaseItem[];
};

export type ProductionRecipeItem = {
  id?: number;
  ingredient_id: number;
  quantity: NumericValue;
  ingredient?: Ingredient | null;
};

export type ProductionRecipe = {
  id: number;
  name: string;
  output_ingredient_id: number;
  yield_quantity: NumericValue;
  yield_unit_id: number;
  shelf_life_days: number;
  active: boolean;
  items: ProductionRecipeItem[];
  output_ingredient?: Ingredient | null;
  yield_unit?: Unit | null;
};

export type ProductionBatchOutput = {
  id: number;
  ingredient_id: number;
  inventory_batch_id: number;
  quantity: NumericValue;
  portion_name?: string | null;
  grams_per_portion?: NumericValue | null;
  inventory_batch?: InventoryBatch | null;
};

export type ProductionBatch = {
  id: number;
  production_recipe_id: number;
  multiplier: NumericValue;
  produced_at: string;
  expires_at: string;
  notes?: string | null;
  created_at: string;
  recipe?: ProductionRecipe | null;
  outputs: ProductionBatchOutput[];
};
