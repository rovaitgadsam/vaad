# Financial data model, schema version 2

## Source of truth

`transactions` is the canonical ledger for recorded income and expenses.
A collection payment is one income transaction with both `campaignId` and
`campaignApartmentId`. The same payment is never written to a second
mutable aggregate.

## Collection periods

A campaign stores its title, date range, status, and an immutable apartment
snapshot with the amount due for each apartment. New payments are derived
from the ledger:

- ledger amount: sum of income transactions matching the campaign and apartment
- legacy carry-forward: a separately labelled, unverified amount retained
  from the old `campaigns[].paid` aggregate when no matching ledger entries
  account for it
- displayed paid amount: ledger amount plus unverified carry-forward
- remaining balance: due amount less displayed paid amount, floored at zero

## Non-destructive migration

Schema version 2 preserves the old `campaigns[].paid` object and copies it
to `legacyPaidSnapshot`. It does not create, alter, or delete transactions.
For each campaign/apartment it records:

- `legacyReportedPaid`
- `linkedTransactionPaid`
- `unverifiedCarryForward`
- `difference`
- `status`: `matched`, `unverified-legacy-balance`, or
  `ledger-exceeds-legacy`

When an old campaign has no apartment snapshot, it is flagged with
`legacyApartmentsMissing`. Current apartments are not substituted, because
that would invent historical membership or charges.

## Important safeguards

- Historical archive content remains read-only and unchanged.
- Existing transaction IDs and contents are preserved.
- No unmatched legacy amount is fabricated into an income transaction.
- Reconciliation metadata records uncertainty rather than silently resolving it.
- The old `paid` property remains as an audit snapshot during this transition.
