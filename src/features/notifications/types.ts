export type NotificationType =
  | 'order_created'
  | 'order_status'
  | 'delivery_assigned'
  | 'delivery_offer'
  | 'delivery_status'
  | 'role_request'
  | 'payment_status'
  | 'system';

export type AppNotification = {
  id: string;
  user_id: string;
  type: NotificationType;
  title_ku: string;
  body_ku: string;
  title_ar: string;
  body_ar: string;
  title_en: string;
  body_en: string;
  route: string | null;
  entity_type: string | null;
  entity_id: string | null;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};
