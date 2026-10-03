# Policies awaiting owner review

These are local drafts, not published store terms. They are not a determination of legal compliance. The owner must review return rules and retention periods against applicable requirements before setting `POLICIES_APPROVED=true`.

Support contact supplied by the owner: **hassan.mansoor96@gmail.com**.

## Proposed EFT payment deadline

Reserve unpaid EFT orders for 48 hours. Before cancelling, reconcile the bank account, including transfers awaiting identification. If payment arrives after cancellation, contact the buyer to arrange an available replacement order or a refund; do not fulfil from returned stock without a fresh availability check. Do not promise automatic expiry until its scheduled job is operating. The code remains disabled with `EFT_ORDER_EXPIRY_HOURS=0`.

Online orders follow a separate process. Provider sessions can still accept payment after abandonment. Never restock an online order merely because its browser was closed or its verify response currently says failed/abandoned. Resolve or close the provider attempt and document the decision first.

## Proposed customer refund and return wording

Contact support with your order reference and the reason for your request. For damaged, faulty or misdescribed goods, include photographs where practical. We will review the issue and explain the available remedy. These procedures do not limit applicable consumer rights.

For a change-of-mind return, contact us before sending anything back. Sealed packaging, card condition and return shipping arrangements must be assessed as part of the request. The owner still needs to choose and publish the return window, eligibility and shipping rules.

Approved refunds should go through the original payment method where available. For EFT refunds, independently verify the recipient details through the established customer contact channel. Never refund based solely on a payment screenshot. Record the provider transaction/refund identifier separately from the order; the current app does not execute refunds or automatically track provider disputes. Monitor the provider dashboard for refunds/disputes and reconcile the order manually.

## Proposed retention schedule

| Data | Draft period or treatment |
| --- | --- |
| Order contact/delivery snapshot for terminal orders | 365 days after fulfilment/cancellation, subject to accounting and legal review |
| Inactive customer account/profile | 730 days since last activity, provided no pending/paid order needs fulfilment |
| Order items, totals, dates, references and payment identifiers | Preserved by the contact-erasure tool; owner/accountant to determine financial-record retention |
| Customer sessions | 30 days; periodic cleanup removes expired records |
| Admin sessions | Eight hours; periodic cleanup |
| Account recovery links | 30 minutes, single use; new issuance/password changes invalidate older links |
| Rate-limit records and used authenticator steps | Remove after expiry through maintenance |
| Independently stored encrypted backups | Proposed 30-day rolling retention; erasure takes effect in backups as they age out |

These draft values have **not** been enabled. `npm run ops:retention` is a dry run. It does not print customer records. Applying requires explicit `--apply`, both retention periods, and `POLICIES_APPROVED=true`. It never erases the contact snapshots of pending or paid orders. It preserves order line items, totals and transaction identifiers.

Requests for data access, correction or deletion go to the support contact above. Verify ownership before disclosing or erasing data. Keep only the evidence needed to record that verification; do not ask for unnecessary identity documents. Customer deletion may need to wait for fulfilment or an applicable record-retention obligation. Automated email verification is not implemented; the account-support process must verify control of the registered contact channel.

References for owner review: [South African Consumer Protection Act](https://www.gov.za/documents/consumer-protection-act), [Protection of Personal Information Act](https://www.gov.za/documents/protection-personal-information-act). An approved final policy must specify the business/operator details and customer process; these links alone do not make the draft compliant.
