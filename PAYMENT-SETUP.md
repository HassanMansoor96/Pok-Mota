# Payment setup

Checkout supports manual EFT plus PayFast, Paystack and Stripe hosted checkout. Only fully configured gateways appear in the selector. Existing orders default to EFT. All prices, amounts and delivery fees are set by the server in ZAR cents. Card details are entered on the provider's website.

## Enable a gateway

1. Run `npm run db:init` to add the payment columns without removing products or orders.
2. Set `PUBLIC_ORIGIN` in `.env` to the store's exact public HTTPS origin, with no trailing slash. For local development the application also accepts `http://localhost:3000`, but providers need a publicly reachable HTTPS URL to send webhooks. Use a tunnel and its HTTPS origin for full sandbox testing.
3. Enter the relevant credentials below. Never commit `.env`. Restart the server after changing configuration.
4. Register the notification endpoint in the provider dashboard where required. Test the complete flow before using live keys.

| Provider | Required environment variables | Notification endpoint |
| --- | --- | --- |
| PayFast | `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`, `PAYFAST_PASSPHRASE`; `PAYFAST_SANDBOX=true` for sandbox or `false` for live | `/api/payments/webhooks/payfast` (sent as `notify_url` automatically) |
| Paystack | `PAYSTACK_SECRET_KEY` | `/api/payments/webhooks/paystack` |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | `/api/payments/webhooks/stripe` |

PayFast's passphrase must match the value in its dashboard. Sandbox and live merchant credentials differ. PayFast also checks the notification source IP against its published hostnames; configure `TRUST_PROXY=1` only when there is exactly one trusted reverse proxy between the server and the internet.

For Stripe, subscribe to `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Use the signing secret for this specific webhook endpoint. An eligible Stripe merchant account is required: Stripe lists South Africa through its Paystack extended network, which does **not** provide Stripe API credentials. South African merchants can use the separate Paystack integration.

The gateways may offer additional payment channels according to the merchant account and currency. The store does not promise channels which the provider has not enabled.

## Order and payment behavior

Placing an order reserves stock once and saves the chosen provider. The receipt then offers **Continue / retry payment**. Returning from hosted checkout loads the saved order; it does not mark the order paid. **Check payment status** refreshes the database status. The order URL can be bookmarked and is accessible only to the customer who placed it.

Payment attempts reuse saved checkout details. Stripe uses an order-specific idempotency key; initialization recovery is limited to 23 hours to stay within its key retention window. Paystack verifies the reference before initialization and will not create another transaction when it already exists. If a Paystack initialization succeeded but its URL was lost, store assistance is required to recover it. Expired hosted links also need store assistance; automatic session renewal is not implemented.

Notifications validate signature, provider, reference, currency, total and checkout identity. PayFast additionally validates source IP and confirms the notification with PayFast's server. Duplicate notifications for the same transaction do not repeat the paid transition.

Admin can confirm EFT receipt and cancel/restock unpaid EFT orders. Online payment confirmation is automatic. Pending online orders cannot currently be cancelled through admin, since a still-active checkout could accept payment after stock was returned. Reconcile or close payment attempts with the provider before making an operational adjustment. Refunds, automatic expiry/restocking, disputed payments and automated reconciliation are not implemented. Unexpected second transactions are rejected for manual investigation/refund rather than silently associated with an already-paid order.

## Validation before live use

Run `npm test`. With provider test credentials and a public HTTPS callback address, place a test order, complete hosted payment, verify the order changes to paid, retry/replay its notification, and confirm stock was reserved once. Also test declined and abandoned payments, expired links, signed notifications with incorrect amounts, and returning while signed out. Automated tests use mock provider responses; they do not certify live merchant account setup.

Provider references: [PayFast integration](https://developers.payfast.co.za/docs), [Paystack transactions](https://paystack.com/docs/api/transaction/), [Paystack webhooks](https://paystack.com/docs/payments/webhooks/), [Stripe Checkout](https://docs.stripe.com/api/checkout/sessions/create), [Stripe signature verification](https://docs.stripe.com/webhooks/signature), and [Stripe country availability](https://stripe.com/global).

Yoco has not been added: its primary API/webhook documentation was inaccessible during this implementation. Additional providers should be added only with verified request and notification contracts.


## Current launch preparation

EFT plus Paystack is the selected launch direction. Local Paystack remains in explicit sandbox mode with test keys and TEST MODE labels. Production order creation requires `CHECKOUT_ENABLED=true` and reviewed `POLICIES_APPROVED=true`. Live Paystack requires matching live keys/mode and sandbox sign-off via `PAYSTACK_LIVE_READY=true`.

Admin CHECK PAYSTACK PAYMENT verifies the saved order with the provider and uses the same locked confirmation as signed webhooks. Pending, failed, abandoned or reversed verification does not automatically return stock. MFA, maintenance, late EFT, refund/dispute and recovery procedures are documented in [OPERATIONS.md](OPERATIONS.md). EFT expiry remains disabled until its deadline is approved. Follow [PAYSTACK-SANDBOX-CHECKLIST.md](PAYSTACK-SANDBOX-CHECKLIST.md); public callback testing is deferred under the no-public-deployment instruction.
