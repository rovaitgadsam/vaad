# Financial data model, schema version 3

## Source of truth

`transactions` is the canonical ledger for recorded income and expenses.
A collection payment is one income transaction with both `campaignId` and
`campaignApartmentId`. The same payment is never written to a second
mutable aggregate.

## Collection periods

A campaign stores its title, date range, status, and an immutable apartment
snapshot with the amount due for each apartment. New payments are derived
from the ledger:

- ledger amount: sum of valid income transactions matching the campaign and apartment
- legacy carry-forward: a separately labelled, unverified amount retained
  from the old `campaigns[].paid` aggregate when no matching ledger entries
  account for it
- displayed paid amount: ledger amount plus unverified carry-forward
- remaining balance: due amount less displayed paid amount, floored at zero
- monetary comparisons and remaining balances are calculated in integer agorot
  to avoid floating-point rounding errors

## Validation and integrity audit

New transactions are validated before they are saved. Collection-linked
transactions must reference an existing campaign and an apartment in that
campaign's saved apartment snapshot. The apartment identifiers on the
transaction must agree. Duplicate transaction identifiers and broken
references are rejected.

The read-only integrity audit checks duplicate record identifiers, malformed
transactions, broken campaign/apartment links, malformed campaign snapshots,
and payments that exceed the recorded due amount. It reports historical
uncertainty and possible overpayments as warnings; it does not modify records.

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
- This phase does not change the Firestore document shape or trigger a cloud
  reset; existing synced data remains in place.

## Accounting years and annual archive, schema version 3

The active accounting year is stored in `state.accounting.activeYear`.
`state.accounting.years[year]` stores the status and opening balance for
each year. A closed-year record includes its closing balance, closing time,
read-only audit, reconciliation, annual report, and a full snapshot of the
state at closure.

When a year is closed:

- The full set of current transactions and collection campaigns is copied
  into the closed-year archive snapshot.
- The new active year starts with empty `transactions` and `campaigns`.
- Apartments, resident details, fee settings, and other building settings
  remain in the active state.
- Only the confirmed actual cash balance is carried into the next year's
  `openingBalance`. Unpaid collection amounts and personal-paid expenses
  remain in the old archive and are not carried as active balances.
- A late receipt for a prior collection year is a new income transaction
  dated in the active year, with an optional `collectionYear` tag for the
  original collection year. It affects current cash, while the annual
  collection report attributes it to the tagged year.

## Cash reconciliation

The estimated cash position is calculated in integer agorot:

- opening balance
- plus all recorded income
- less expenses explicitly marked `paidBy: "קופת הוועד"`

Expenses paid personally by a committee member do not reduce the committee's
cash balance. Expenses without a known payer are reported as unclassified
and excluded from the estimated cash position until reviewed. Transactions
whose dates do not match the active accounting year are surfaced as warnings.
The actual closing balance is entered and confirmed from the bank/cash
position at year close; the variance and explanation are retained in the
archive.

## Archive immutability and rollover safeguards

The archive snapshot is stored in the existing `appData/main` state document.
The closure operation validates the financial state, rejects an invalid
closing balance, refuses to overwrite an existing next-year archive, creates
a pre-close backup, and writes the rollover as one Firestore state transaction.
Closed-year data is presented read-only in the application. No actual-year
closure is triggered by schema migration.
