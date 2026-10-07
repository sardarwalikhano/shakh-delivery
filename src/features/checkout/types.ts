export type PaymentMethod = 'cash_on_delivery' | 'mobile_cash';

export type CheckoutResult = {
  checkout_id: string;
  status: 'pending' | 'completed' | 'cancelled';
  payment_method: PaymentMethod;
  subtotal_iqd: number;
  delivery_fee_iqd: number;
  total_iqd: number;
  orders?: Array<{ id: string; order_number: string; store_id: string }>;
};
