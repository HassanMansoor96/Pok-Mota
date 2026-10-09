# Paystack sandbox verification

Prepared locally. Current keys are test keys; no provider transaction was created in this work. Browser redirects never mark orders paid. Final public callback verification remains pending because public deployment is on hold.

## Local checks completed

Mock-provider tests cover order/reference, amount, ZAR currency, test/live domain, transaction ID, raw-body signatures, incorrect signatures, duplicate confirmation and reconciliation. Live keys require matching `PAYMENT_MODE=live` and explicit `PAYSTACK_LIVE_READY=true` sign-off. The configured local environment remains `sandbox`, and checkout labels the gateway TEST MODE.

Admin **CHECK PAYSTACK PAYMENT** calls the provider verify endpoint using the persisted reference. A verified success uses the same locked, idempotent paid transition as webhooks. Pending/failed/abandoned/reversed responses do not return stock or claim payment success. Reversed/disputed/refunded transactions need human investigation.

## Complete in isolated staging after deployment authorization

1. Confirm merchant account, South African/ZAR capability and provider test mode. Store keys as secrets. Use test fixtures with email addresses you control; use no live customer data.
2. Configure the exact HTTPS staging `PUBLIC_ORIGIN`; register `/api/payments/webhooks/paystack` in the Paystack **test** dashboard. Never publish the key. Verify HTTPS, proxy source handling and cookie behavior before opening checkout.
3. Publish only reviewed policy text; set staging `POLICIES_APPROVED=true` and `CHECKOUT_ENABLED=true` for the test window. Keep `PAYMENT_MODE=sandbox`, test keys and `PAYSTACK_LIVE_READY=false`.
4. Place an isolated Paystack order and use the provider's current [test payment details](https://paystack.com/docs/payments/test-payments/). Verify success changes the saved order to paid with matching reference, ZAR total and transaction ID. Verify one stock reservation.
5. Retry the same order submission and checkout initialization. Replay the provider notification. Confirm the same order/checkout/transaction is reused and no extra stock is reserved.
6. Test decline, abandonment and return before webhook arrival. Confirm status stays unpaid until verified. Sign out before returning and confirm order access requires its owning customer.
7. Inject correctly signed fixture notifications with wrong amount/currency/reference/environment and altered signatures using isolated test keys/data. Confirm no paid transition. Do not point these fixture tests at live customer orders.
8. Withhold a success webhook; use admin reconciliation. Verify it confirms the provider result once. Confirm an unrelated customer cannot read or initialize the saved order, and admin reconciliation rejects missing auth/Origin/CSRF token.
9. Test outage, timeout, expired checkout link and initialization recovery. Document support procedure for links that cannot be safely recovered; do not silently create another transaction.
10. Record dates, fixture references, outcomes and who reviewed them without recording keys, customer profiles or card details. Keep production checkout closed until successful sign-off.

Switching to live is a separate owner decision, not the completion of these mocked/local checks. Change credentials/mode only after the above passes, then run a controlled live acceptance procedure authorized separately.

Provider sources: [verify payments](https://paystack.com/docs/payments/verify-payments/), [webhook validation](https://paystack.com/docs/payments/webhooks/), [transaction API](https://paystack.com/docs/api/transaction/).
