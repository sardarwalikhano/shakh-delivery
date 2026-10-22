import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type DispatchBody =
  | { event_type: "sale_receipt"; order_type: string; order_id: string }
  | { event_type: "cash_return"; settlement_batch_id: string };

type OutboxRow = {
  id: string;
  event_type: "sale_receipt" | "cash_return";
  recipient_user_id: string | null;
  recipient_phone: string;
  receipt_id: string | null;
  settlement_batch_id: string | null;
  message_body: string;
  metadata: Record<string, unknown>;
  status: string;
  attempt_count: number;
  next_attempt_at: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

const money = (value: unknown) =>
  Math.round(Number(value ?? 0)).toLocaleString("en-US");

async function getPermissions(admin: ReturnType<typeof createClient>, userId: string) {
  const { data: roleRows, error: roleError } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (roleError) throw roleError;
  const roles = [...new Set((roleRows ?? []).map((row: { role: string }) => row.role))];
  if (!roles.length) return new Set<string>();
  const { data, error } = await admin
    .from("role_permissions")
    .select("permission_code")
    .in("role", roles)
    .in("permission_code", ["wallets.manage", "orders.view_all"]);
  if (error) throw error;
  return new Set((data ?? []).map((row: { permission_code: string }) => row.permission_code));
}

function saleTemplateParameters(receipt: Record<string, unknown>) {
  const lines = Array.isArray(receipt.item_lines)
    ? (receipt.item_lines as Array<Record<string, unknown>>)
    : [];
  const items = lines.map((item) => {
    const title = String(item.title ?? item.name ?? "بەرهەم");
    const quantity = String(item.quantity ?? 1);
    const variant = item.variant ? ` (${String(item.variant)})` : "";
    return `${title}${variant} × ${quantity}: ${money(item.line_total_iqd)} د.ع`;
  }).join("\n");
  const payment = String(receipt.payment_method ?? "—");
  const status = String(receipt.payment_status ?? "pending");
  const completed = receipt.completed_at
    ? new Date(String(receipt.completed_at)).toLocaleString("en-GB", { timeZone: "Asia/Baghdad" })
    : "—";
  return [
    String(receipt.receipt_number ?? "—"),
    String(receipt.order_number ?? "—"),
    String(receipt.buyer_name ?? "—"),
    (items || "—").slice(0, 900),
    money(receipt.subtotal_iqd),
    money(receipt.delivery_fee_iqd),
    money(receipt.platform_fee_iqd),
    money(receipt.total_iqd),
    `${payment} / ${status}`,
    completed,
  ];
}

function cashTemplateParameters(body: Record<string, unknown>, captainName: string, batchId: string) {
  return [
    captainName || "Captain",
    batchId,
    money(body.current_return_iqd),
    money(body.cumulative_returned_iqd),
    money(body.collected_iqd),
    money(body.remaining_iqd),
  ];
}

async function sendWhatsApp(
  phone: string,
  messageBody: string,
  row: OutboxRow,
  admin: ReturnType<typeof createClient>,
) {
  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const apiVersion = (Deno.env.get("WHATSAPP_GRAPH_API_VERSION") || "v26.0").replace(/^\/?/, "");
  if (!token || !phoneNumberId) throw new Error("WhatsApp Cloud API is not configured: set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.");

  const isSale = row.event_type === "sale_receipt";
  const templateName = Deno.env.get(isSale ? "WHATSAPP_SALE_RECEIPT_TEMPLATE" : "WHATSAPP_CASH_RETURN_TEMPLATE")?.trim();
  const languageCode = Deno.env.get("WHATSAPP_TEMPLATE_LANGUAGE_CODE")?.trim() || "en_US";
  let payload: Record<string, unknown>;

  if (templateName) {
    let parameters: string[];
    if (isSale) {
      const { data: receipt, error } = await admin
        .from("order_receipts").select("*").eq("id", row.receipt_id).single();
      if (error) throw error;
      parameters = saleTemplateParameters(receipt as Record<string, unknown>);
    } else {
      const metadata = row.metadata ?? {};
      const captainId = String(metadata.captain_id ?? "");
      const { data: profile } = await admin.from("profiles").select("full_name")
        .eq("id", captainId).maybeSingle();
      parameters = cashTemplateParameters(metadata, String(profile?.full_name ?? ""), String(row.settlement_batch_id ?? ""));
    }

    payload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        components: [{
          type: "body",
          parameters: parameters.map((text) => ({ type: "text", text: text || "—" })),
        }],
      },
    };
  } else {
    // Plain text is supported only while a WhatsApp customer-service window is
    // open. Outside the 24-hour window Meta requires an approved template.
    payload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "text",
      text: { body: messageBody.slice(0, 4096), preview_url: false },
    };
  }

  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({})) as {
    messages?: Array<{ id?: string }>;
    error?: { message?: string; code?: number; error_subcode?: number };
  };
  if (!response.ok) {
    const description = result.error?.message ?? `WhatsApp API returned HTTP ${response.status}`;
    const suffix = result.error?.code ? ` (code ${result.error.code})` : "";
    throw new Error((description + suffix).slice(0, 1200));
  }
  return result.messages?.[0]?.id ?? null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond(405, { error: "POST required" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return respond(500, { error: "Supabase service configuration is missing." });

  const authorization = req.headers.get("Authorization") ?? "";
  const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) return respond(401, { error: "Authentication required." });

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await admin.auth.getUser(tokenMatch[1]);
  const user = authData.user;
  if (authError || !user) return respond(401, { error: "Invalid access token." });

  let body: DispatchBody;
  try {
    body = await req.json() as DispatchBody;
  } catch {
    return respond(400, { error: "A valid JSON body is required." });
  }

  if (!body || !["sale_receipt", "cash_return"].includes(body.event_type)) {
    return respond(400, { error: "Unsupported WhatsApp event." });
  }

  let receiptId: string | null = null;
  let settlementBatchId: string | null = null;
  const permissions = await getPermissions(admin, user.id).catch(() => new Set<string>());

  if (body.event_type === "sale_receipt") {
    if (!body.order_type || !body.order_id) return respond(400, { error: "Order type and order id are required." });
    const { data: receipt, error } = await admin.from("order_receipts").select("*")
      .eq("order_type", body.order_type).eq("order_id", body.order_id).maybeSingle();
    if (error) return respond(500, { error: "Unable to load the sale receipt." });
    if (!receipt) return respond(200, { configured: true, queued: 0, sent: 0, pending: 0, message: "No completed-sale receipt exists yet." });
    const participant = [receipt.buyer_id, receipt.seller_id, receipt.captain_id].includes(user.id);
    if (!participant && !permissions.has("orders.view_all") && !permissions.has("wallets.manage")) {
      return respond(403, { error: "You are not authorized to dispatch this receipt." });
    }
    receiptId = receipt.id as string;
  } else {
    if (!body.settlement_batch_id) return respond(400, { error: "Settlement batch id is required." });
    if (!permissions.has("wallets.manage")) return respond(403, { error: "Only finance reviewers can dispatch cash-return notices." });
    const { data: batch, error } = await admin.from("captain_cash_settlement_batches").select("id")
      .eq("id", body.settlement_batch_id).maybeSingle();
    if (error) return respond(500, { error: "Unable to load the cash settlement." });
    if (!batch) return respond(404, { error: "Settlement batch was not found." });
    settlementBatchId = batch.id as string;
  }

  const configured = Boolean(Deno.env.get("WHATSAPP_ACCESS_TOKEN") && Deno.env.get("WHATSAPP_PHONE_NUMBER_ID"));
  const templateConfigured = body.event_type === "sale_receipt"
    ? Boolean(Deno.env.get("WHATSAPP_SALE_RECEIPT_TEMPLATE"))
    : Boolean(Deno.env.get("WHATSAPP_CASH_RETURN_TEMPLATE"));

  // An explicit dispatch attempt is also the supported manual retry path.
  // Only opted-in recipients with the unchanged number may be reset from failed/blocked.
  const eligibleRetryRows = admin.from("whatsapp_delivery_preferences").select("user_id,phone_e164")
    .eq("enabled", true);
  const { data: eligibleRecipients } = await eligibleRetryRows;
  const eligibleByUser = new Map((eligibleRecipients ?? []).map((pref: {user_id:string;phone_e164:string}) => [pref.user_id,pref.phone_e164]));
  for (const [recipientId, phone] of eligibleByUser.entries()) {
    let retryQuery = admin.from("whatsapp_message_outbox").update({
      status: "pending", last_error: null, next_attempt_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq("recipient_user_id", recipientId).eq("recipient_phone", phone).in("status", ["failed", "blocked"]);
    retryQuery = receiptId ? retryQuery.eq("receipt_id", receiptId) : retryQuery.eq("settlement_batch_id", settlementBatchId);
    await retryQuery;
  }

  let query = admin.from("whatsapp_message_outbox").select("*")
    .in("status", ["pending", "failed"])
    .lte("next_attempt_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(20);
  query = receiptId ? query.eq("receipt_id", receiptId) : query.eq("settlement_batch_id", settlementBatchId);
  const { data: queued, error: queueError } = await query;
  if (queueError) return respond(500, { error: "Unable to load WhatsApp outbox." });
  const rows = (queued ?? []) as OutboxRow[];

  if (!configured) {
    return respond(200, {
      configured: false,
      template_configured: templateConfigured,
      queued: rows.length,
      sent: 0,
      pending: rows.length,
      message: "WhatsApp credentials are missing; messages remain safely queued.",
    });
  }
  if (!rows.length) {
    return respond(200, {
      configured: true, template_configured: templateConfigured,
      queued: 0, sent: 0, pending: 0,
      message: "No eligible WhatsApp messages are queued for this event.",
    });
  }

  let sent = 0;
  let failed = 0;
  let blocked = 0;
  for (const candidate of rows) {
    // Respect opt-out that happened after the event was queued.
    const { data: preference } = await admin.from("whatsapp_delivery_preferences")
      .select("enabled,phone_e164").eq("user_id", candidate.recipient_user_id).maybeSingle();
    if (!preference?.enabled || preference.phone_e164 !== candidate.recipient_phone) {
      await admin.from("whatsapp_message_outbox").update({
        status: "blocked", last_error: "Recipient disabled WhatsApp receipts or changed their number.",
        updated_at: new Date().toISOString(),
      }).eq("id", candidate.id).in("status", ["pending", "failed"]);
      blocked += 1;
      continue;
    }

    const { data: claimed } = await admin.from("whatsapp_message_outbox").update({
      status: "sending",
      attempt_count: candidate.attempt_count + 1,
      last_error: null,
      updated_at: new Date().toISOString(),
    }).eq("id", candidate.id).in("status", ["pending", "failed"])
      .select("*").maybeSingle();
    if (!claimed) continue;

    try {
      const providerId = await sendWhatsApp(
        candidate.recipient_phone,
        candidate.message_body,
        candidate,
        admin,
      );
      await admin.from("whatsapp_message_outbox").update({
        status: "sent",
        provider_message_id: providerId,
        sent_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      }).eq("id", candidate.id);
      sent += 1;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown WhatsApp provider error";
      const retryMinutes = Math.min(240, 2 ** Math.min(candidate.attempt_count + 1, 8));
      await admin.from("whatsapp_message_outbox").update({
        status: "failed",
        last_error: detail.slice(0, 1200),
        next_attempt_at: new Date(Date.now() + retryMinutes * 60_000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", candidate.id);
      failed += 1;
    }
  }

  return respond(200, {
    configured: true,
    template_configured: templateConfigured,
    queued: rows.length,
    sent,
    failed,
    blocked,
    message: failed
      ? "Some messages failed; the error and retry schedule were saved."
      : "WhatsApp queue processing completed.",
  });
});
