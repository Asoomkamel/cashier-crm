export interface TenantScopedRecord {
  id: string;
  organization_id: string;
  branch_id?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  version: number;
}

export interface IdempotentCommand {
  idempotency_key: string;
  organization_id: string;
  branch_id?: string | null;
  requested_by?: string | null;
}

export type StockMovementType =
  | "PURCHASE_IN"
  | "SALE_OUT"
  | "RETURN_IN"
  | "TECHNICIAN_TRANSFER_OUT"
  | "TECHNICIAN_TRANSFER_IN"
  | "DAMAGE_OUT"
  | "LOSS_OUT"
  | "ADJUSTMENT";

export interface StockMovementRecord extends TenantScopedRecord {
  product_id: string;
  location_id?: string | null;
  technician_id?: string | null;
  movement_type: StockMovementType;
  quantity: number;
  reference_type?: string | null;
  reference_id?: string | null;
  created_by?: string | null;
  notes?: string | null;
}
