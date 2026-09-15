# TikTok purchase tracking and mobile auth spacing

## Changes
- Load TikTok Pixel `DAKS6DRC77UES9754TBG` once for site-wide attribution and page tracking.
- Fire TikTok's `CompletePayment` event only after the payment-success page has verified a successful paid order or subscription.
- Include the confirmed amount, currency, product name, and payment identifier when available.
- Prevent duplicate conversion events if the success page rerenders, polls again, or is refreshed.
- Increase the visible vertical gap between Google and email registration buttons on phones.

## Verification
- Check types and production build.
- Verify the mobile registration spacing and successful-payment event wiring without triggering a real charge.
