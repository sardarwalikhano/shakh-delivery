# SHAKH WhatsApp receipt delivery

The Edge Function `dispatch-whatsapp-outbox` is deployed with JWT verification enabled. It sends only outbox rows created by the database receipt / cash-settlement triggers, and only to recipients who have an enabled WhatsApp preference with the same phone number.

## Configure Supabase Edge Function secrets

In Supabase Dashboard → Edge Functions → Secrets, add:

- `WHATSAPP_ACCESS_TOKEN`: Meta WhatsApp Business Platform system-user access token.
- `WHATSAPP_PHONE_NUMBER_ID`: the sender phone-number ID from the WhatsApp Business account.
- `WHATSAPP_GRAPH_API_VERSION`: optional; defaults to `v26.0`.
- `WHATSAPP_TEMPLATE_LANGUAGE_CODE`: the exact language code approved for both templates, e.g. `en_US` if that is the language used when approving the templates.
- `WHATSAPP_SALE_RECEIPT_TEMPLATE`: approved utility-template name with eleven body placeholders in this order:
  1. Receipt number
  2. Order number
  3. Buyer name
  4. Itemized products (title, variant, quantity, line total)
  5. Subtotal IQD
  6. Delivery fee IQD
  7. Platform fee IQD
  8. Total IQD
  9. Payment method and status
  10. Completion date/time
  11. Receipt URL (`https://www.daim-post.online/receipts/<receipt-id>`)
- `WHATSAPP_CASH_RETURN_TEMPLATE`: approved utility-template name with six body placeholders in this order:
  1. Captain name
  2. Settlement batch ID
  3. Amount returned in this settlement
  4. Cumulative amount returned so far
  5. Total COD cash collected
  6. COD amount still outstanding

The sender leaves messages queued unless the corresponding approved template is configured. If `WHATSAPP_ALLOW_SESSION_TEXT=true` is set, it can use free-form text instead; only use this when you know the recipient has an open 24-hour customer-service window. Meta only permits business-initiated/out-of-window delivery through approved templates. Recipients must explicitly opt in from the SHAKH receipt page. Do not put access tokens in client code or commit them to this repository.

## Operational behaviour

- Sale receipts are created once per completed sale and keyed by order type + order ID.
- Cash-return notices include current-return amount, cumulative amount returned, total cash collected and the remaining balance for the seller and Super Admin.
- Outbox keys are idempotent. Failed sends retain the provider error and a retry time.
- If API credentials are absent, the dispatcher leaves messages in the queue and returns `configured: false` rather than falsely reporting successful delivery.
- The user-facing receipt page offers an explicit retry after the WhatsApp preference has been enabled.
- Customer phone numbers are clickable and open a prefilled WhatsApp draft containing itemized receipt details and the receipt URL. The sender must press Send in WhatsApp; the page does not falsely report this draft as sent.
- If a buyer enables their own WhatsApp preference, the queue includes that buyer as well as opted-in seller and Super Admin recipients. Actual business-initiated delivery still requires valid Meta credentials and an approved template.
