export interface AgentConfig {
  apiUrl: string;
  agentKey: string;
  agentId: string;
}

export type PrintJobType = 'KITCHEN_TICKET' | 'EXPEDITION_TICKET' | 'RECEIPT';
export type PrintJobStatus = 'PENDING' | 'PRINTING' | 'COMPLETED' | 'FAILED';
export type OrderType = 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';

export interface PrintJob {
  id: string;
  unitId: string;
  orderId: string;
  printerId: string;
  type: PrintJobType;
  status: PrintJobStatus;
  payload: PrintPayload;
  copies: number;
  attempts: number;
  lastError: string | null;
  printedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PrintPayload {
  orderCode: number;
  orderType: OrderType;
  orderChannel: string;
  tableName: string | null;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: DeliveryAddress | null;
  courierName: string | null;
  createdAt: string;
  items: PrintPayloadItem[];
  generalNotes: string | null;
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  payments: PaymentInfo[];
  changeFor: number | null;
  sourceReference: string | null;
  unitName: string;
  unitAddress: string | null;
  unitCnpj: string | null;
}

export interface DeliveryAddress {
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  reference: string | null;
}

export interface PrintPayloadItem {
  name: string;
  variantName: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  notes: string | null;
  options: { name: string; price: number }[];
  categoryName: string | null;
}

export interface PaymentInfo {
  method: string;
  amount: number;
}

export interface DiscoveredPrinter {
  deviceName: string;
  paperWidth: number;
}

export interface RegisteredPrinter {
  id: string;
  unitId: string;
  name: string;
  deviceName: string;
  agentId: string;
  paperWidth: number;
  isOnline: boolean;
  lastSeenAt: string | null;
}

export interface PrinterStatusReport {
  deviceName: string;
  isOnline: boolean;
}

export interface PrintJobCreatedEvent {
  jobId: string;
  printerId: string;
  type: PrintJobType;
  unitId: string;
}
