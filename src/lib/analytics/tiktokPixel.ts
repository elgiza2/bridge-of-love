const TIKTOK_PIXEL_ID = "DAKS6DRC77UES9754TBG";

type TikTokQueue = Array<unknown> & {
  load?: (pixelId: string) => void;
  page?: () => void;
  track?: (event: string, properties?: Record<string, unknown>, options?: Record<string, unknown>) => void;
  methods?: string[];
  setAndDefer?: (queue: TikTokQueue, method: string) => void;
  instance?: (pixelId: string) => TikTokQueue;
  _i?: Record<string, TikTokQueue>;
  _t?: Record<string, number>;
  _o?: Record<string, unknown>;
  _u?: string;
};

declare global {
  interface Window {
    TiktokAnalyticsObject?: string;
    ttq?: TikTokQueue;
  }
}

export function loadTikTokPixel() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.ttq?.load) return;

  const queue = (window.ttq = window.ttq || ([] as unknown as TikTokQueue));
  window.TiktokAnalyticsObject = "ttq";
  queue.methods = [
    "page",
    "track",
    "identify",
    "instances",
    "debug",
    "on",
    "off",
    "once",
    "ready",
    "alias",
    "group",
    "enableCookie",
    "disableCookie",
    "holdConsent",
    "revokeConsent",
    "grantConsent",
  ];
  queue.setAndDefer = (target, method) => {
    (target as unknown as Record<string, (...args: unknown[]) => void>)[method] = (...args) => {
      target.push([method, ...args]);
    };
  };
  for (const method of queue.methods) queue.setAndDefer(queue, method);
  queue.instance = (pixelId) => {
    const instance = queue._i?.[pixelId] || ([] as unknown as TikTokQueue);
    for (const method of queue.methods || []) queue.setAndDefer?.(instance, method);
    return instance;
  };
  queue.load = (pixelId) => {
    const src = "https://analytics.tiktok.com/i18n/pixel/events.js";
    queue._i = queue._i || {};
    queue._i[pixelId] = [] as unknown as TikTokQueue;
    queue._i[pixelId]._u = src;
    queue._t = queue._t || {};
    queue._t[pixelId] = Date.now();
    queue._o = queue._o || {};
    queue._o[pixelId] = {};
    const script = document.createElement("script");
    script.type = "text/javascript";
    script.async = true;
    script.src = `${src}?sdkid=${encodeURIComponent(pixelId)}&lib=ttq`;
    document.head.appendChild(script);
  };

  queue.load(TIKTOK_PIXEL_ID);
  queue.page?.();
}

type CompletePayment = {
  paymentId: string;
  value?: number;
  currency?: string;
  productName?: string;
};

export function trackTikTokCompletePayment({
  paymentId,
  value,
  currency,
  productName,
}: CompletePayment) {
  if (typeof window === "undefined" || !paymentId) return;

  const storageKey = `megsy_tiktok_complete_payment:${paymentId}`;
  try {
    if (window.localStorage.getItem(storageKey)) return;
  } catch {}

  loadTikTokPixel();
  const properties: Record<string, unknown> = {
    content_type: "product",
    content_id: paymentId,
    quantity: 1,
  };
  if (productName) properties.content_name = productName;
  if (typeof value === "number" && Number.isFinite(value)) properties.value = value;
  if (currency) properties.currency = currency.toUpperCase();

  window.ttq?.track?.("CompletePayment", properties, { event_id: paymentId });
  try {
    window.localStorage.setItem(storageKey, new Date().toISOString());
  } catch {}
}