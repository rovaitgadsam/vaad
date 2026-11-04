/**
 * Non-destructive state migrations.
 * No legacy payment is converted into a transaction unless an actual
 * transaction record already exists in the source data.
 */
import { linkedCampaignPayments } from "./finance.js";
import { ensureAccountingState } from "./accounting-years.js";

const CURRENT_SCHEMA_VERSION = 3;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function migrateState(input) {
  const state = clone(input || {});
  let changed = false;

  if (!Array.isArray(state.apartments)) state.apartments = [];
  if (!Array.isArray(state.transactions)) state.transactions = [];
  if (!Array.isArray(state.campaigns)) state.campaigns = [];

  for (const campaign of state.campaigns) {
    if (!campaign || typeof campaign !== "object") continue;

    // Preserve the old aggregate exactly as an audit snapshot.
    if (!campaign.legacyPaidSnapshot && campaign.paid &&
        typeof campaign.paid === "object") {
      campaign.legacyPaidSnapshot = { ...campaign.paid };
      changed = true;
    }

    // Do not guess which apartments belonged to an old campaign.
    // Missing snapshots are explicitly flagged for human review.
    if (!Array.isArray(campaign.apartments) && campaign.legacyApartmentsMissing !== true) {
      campaign.legacyApartmentsMissing = true;
      changed = true;
    }

    if (!campaign.legacyReconciliation) {
      const ledger = linkedCampaignPayments(campaign, state.transactions);
      const legacy = campaign.legacyPaidSnapshot || campaign.paid || {};
      const reconciliation = {};

      const apartmentIds = new Set([
        ...Object.keys(legacy),
        ...Object.keys(ledger),
        ...(Array.isArray(campaign.apartments)
          ? campaign.apartments.map(apartment => apartment.id)
          : [])
      ]);

      for (const apartmentId of apartmentIds) {
        const legacyReportedPaid = Math.max(0, Number(legacy[apartmentId] || 0));
        const linkedTransactionPaid = Math.max(0, Number(ledger[apartmentId] || 0));
        const unverifiedCarryForward = Math.max(
          0,
          legacyReportedPaid - linkedTransactionPaid
        );
        const difference = linkedTransactionPaid - legacyReportedPaid;

        reconciliation[apartmentId] = {
          legacyReportedPaid,
          linkedTransactionPaid,
          unverifiedCarryForward,
          difference,
          status: difference > 0
            ? "ledger-exceeds-legacy"
            : unverifiedCarryForward > 0
              ? "unverified-legacy-balance"
              : "matched"
        };
      }

      campaign.legacyReconciliation = reconciliation;
      changed = true;
    }
  }

  const accountingMigration = ensureAccountingState(state);
  if (accountingMigration.changed) changed = true;
  const migratedState = accountingMigration.state;

  if (Number(migratedState.schemaVersion || 0) < CURRENT_SCHEMA_VERSION) {
    migratedState.schemaVersion = CURRENT_SCHEMA_VERSION;
    migratedState.migrationLog = Array.isArray(migratedState.migrationLog) ? migratedState.migrationLog : [];
    migratedState.migrationLog.push({
      version: CURRENT_SCHEMA_VERSION,
      migratedAt: new Date().toISOString(),
      description: "Non-destructive campaign reconciliation and accounting-year initialization"
    });
    changed = true;
  }

  return { state: migratedState, changed, schemaVersion: CURRENT_SCHEMA_VERSION };
}
