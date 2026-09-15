/**
 * @doc Server-side TikTok Events API (v1.3) bridge.
 * Sends the same conversion the browser pixel sends, from the server, so the
 * event still lands when the pixel is blocked. Dedup happens on TikTok's side
 * via a shared `event_id`.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const TIKTOK_PIXEL_ID = "DAKS6DRC77UES9754TBG";
const ENDPOINT = "https://business-api.tiktok.com/open_api/v1.3/event/track/";

const payloadSchema = z.object({
  event: z.string().min(1).max(64).default("CompletePayment"),
  eventId: z.string().min(1).max(200),
  value: z.number().finite().nonnegative().optional(),
  currency: z.string().min(3).max(8).optional(),
  productName: z.string().max(200).optional(),
  url: z.string().url().optional(),
  referrer: z.string().max(500).optional(),
  userAgent: z.string().max(500).optional(),
  ttclid: z.string().max(500).optional(),
  ttp: z.string().max(500).optional(),
  email: z.string().max(320).optional(),
  externalId: z.string().max(200).optional(),
});

async function sha256(input: string) {
  const bytes = new TextEncoder().encode(input.trim().toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const sendTikTokEvent = createServerFn({ method: "POST" })
  .inputValidator((data) => payloadSchema.parse(data))
  .handler(async ({ data }) => {
    const token = process.env["TIKTOK_EVENTS_ACCESS_TOKEN"];
    if (!token) return { ok: false as const, reason: "missing_token" };

    const user: Record<string, unknown> = {};
    if (data.userAgent) user.user_agent = data.userAgent;
    if (data.ttclid) user.ttclid = data.ttclid;
    if (data.ttp) user.ttp = data.ttp;
    if (data.email) user.email = await sha256(data.email);
    if (data.externalId) user.external_id = await sha256(data.externalId);

    const properties: Record<string, unknown> = {
      content_type: "product",
      contents: [
        {
          content_id: data.eventId,
          content_name: data.productName,
          quantity: 1,
          price: data.value,
        },
      ],
    };
    if (typeof data.value === "number") properties.value = data.value;
    if (data.currency) properties.currency = data.currency.toUpperCase();

    const body = {
      event_source: "web",
      event_source_id: TIKTOK_PIXEL_ID,
      data: [
        {
          event: data.event,
          event_time: Math.floor(Date.now() / 1000),
          event_id: data.eventId,
          user,
          properties,
          page: data.url ? { url: data.url, referrer: data.referrer } : undefined,
        },
      ],
    };

    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Access-Token": token },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    if (!response.ok) {
      console.error(`TikTok Events API failed [${response.status}]: ${text}`);
      return { ok: false as const, reason: "http_error", status: response.status };
    }

    let parsed: { code?: number; message?: string } = {};
    try {
      parsed = JSON.parse(text);
    } catch {}
    if (parsed.code && parsed.code !== 0) {
      console.error(`TikTok Events API rejected event: ${text}`);
      return { ok: false as const, reason: parsed.message ?? "rejected" };
    }
    return { ok: true as const };
  });
