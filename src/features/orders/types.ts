import type { ApiStockWarning } from "../../api";
export type OrderStatus = "draft" | "pending_payment" | "confirmed" | "kitchen_pending" | "preparing" | "prepared" | "ready" | "on_way" | "delivered" | "cancelled";
export type OrderType = "pickup" | "whatsapp" | "dine_in" | "delivery";
export type OrderFlavor = {
  id?: number;
  product_flavor_id?: number;
  ratio?: string | number;
  name?: string;
  flavor?: { id: number; name: string } | null;
};
export type OrderModifier = { id?: number; modifier_id?: number; name: string; price?: string | number };
export type OrderComponent = {
  id?: number;
  name: string;
  quantity: string | number;
  flavors?: string[];
  modifiers?: OrderModifier[];
  notes?: string | null;
};
export type OrderItem = {
  id?: number;
  name: string;
  quantity: string | number;
  notes?: string | null;
  flavors?: OrderFlavor[];
  modifiers?: OrderModifier[];
  components?: OrderComponent[];
};
export type OrderHistory = {
  id?: number;
  from_status?: OrderStatus | null;
  to_status: OrderStatus;
  comment?: string | null;
  created_at: string;
};
export type Order = {
  id: number;
  daily_number: number;
  status: OrderStatus;
  type: OrderType;
  sales_channel?: "local" | "whatsapp" | "phone" | "other";
  total: string;
  amount_paid?: string | number;
  amount_due?: string | number;
  payment_status?: "paid" | "partial" | "unpaid" | "courtesy";
  collection_required?: boolean;
  collect_on_delivery?: boolean;
  courtesy?: boolean;
  notes?: string | null;
  order_date?: string;
  created_at?: string;
  scheduled_at?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  customer?: { id: number; name: string; phone?: string | null } | null;
  delivery?: { recipient: string; phone: string; address: string; references?: string; map_url?: string; payment_received?: boolean } | null;
  payments?: { method: string; amount: string | number }[];
  stock_warnings?: ApiStockWarning[];
  histories?: OrderHistory[];
  items: OrderItem[];
};
export type PaginatedOrders = {
  data: Order[];
  current_page: number;
  last_page: number;
};
export type OrderStatusAction = (order: Order, status: OrderStatus) => Promise<boolean>;
