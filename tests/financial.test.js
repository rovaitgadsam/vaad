import test from "node:test";
import assert from "node:assert/strict";
import {
  campaignPaidForApartment,
  campaignPaidSummary,
  campaignRemaining,
  linkedCampaignPayments
} from "../src/core/finance.js";
import { migrateState } from "../src/core/migrations.js";
import { auditFinancialState, validateTransaction } from "../src/core/validation.js";

const campaign = {
  id: "campaign-1",
  title: "גבייה ראשונה",
  from: "2026-01-01",
  to: "2026-06-30",
  due: 100,
  apartments: [{ id: "apt-1", number: "1", due: 100 }]
};

test("ledger totals use income only and calculate money in agorot", () => {
  const transactions = [
    { type: "income", campaignId: "campaign-1", campaignApartmentId: "apt-1", amount: 0.1 },
    { type: "income", campaignId: "campaign-1", campaignApartmentId: "apt-1", amount: 0.2 },
    { type: "expense", campaignId: "campaign-1", campaignApartmentId: "apt-1", amount: 50 },
    { type: "income", campaignId: "other", campaignApartmentId: "apt-1", amount: 50 },
    { type: "income", campaignId: "campaign-1", amount: 50 }
  ];
  assert.equal(linkedCampaignPayments(campaign, transactions)["apt-1"], 0.3);
  assert.equal(campaignPaidForApartment(campaign, "apt-1", transactions), 0.3);
});

test("legacy carry-forward remains separate and combines with recorded payments", () => {
  const reconciled = {
    ...campaign,
    legacyReconciliation: {
      "apt-1": { unverifiedCarryForward: 20 }
    }
  };
  const transactions = [
    { type: "income", campaignId: "campaign-1", campaignApartmentId: "apt-1", amount: 10 }
  ];
  const summary = campaignPaidSummary(reconciled, transactions);
  assert.equal(summary.total, 30);
  assert.equal(summary.apartments["apt-1"], 30);
  assert.equal(summary.ledger["apt-1"], 10);
});

test("remaining balance never becomes negative", () => {
  const transactions = [
    { type: "income", campaignId: "campaign-1", campaignApartmentId: "apt-1", amount: 120 }
  ];
  assert.equal(campaignRemaining(campaign, "apt-1", transactions), 0);
});

test("validation rejects missing campaign and apartment references", () => {
  const tx = {
    id: "tx-1", type: "income", date: "2026-02-01",
    description: "תשלום", amount: 10, campaignId: "missing",
    campaignApartmentId: "apt-1", apartmentId: "apt-1"
  };
  const result = validateTransaction(tx, { campaigns: [campaign], apartments: [] });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(message => message.includes("תקופת הגבייה המקושרת אינה קיימת")));
});

test("validation accepts a valid campaign payment and rejects duplicate IDs", () => {
  const tx = {
    id: "tx-1", type: "income", date: "2026-02-01",
    description: "תשלום", amount: 10, campaignId: "campaign-1",
    campaignApartmentId: "apt-1", apartmentId: "apt-1"
  };
  assert.equal(validateTransaction(tx, {
    campaigns: [campaign], apartments: [], existingTransactions: []
  }).valid, true);
  const duplicate = validateTransaction(tx, {
    campaigns: [campaign], apartments: [], existingTransactions: [tx]
  });
  assert.ok(duplicate.errors.some(message => message.includes("מזהה זהה")));
});

test("integrity audit reports overpayments without changing data", () => {
  const state = {
    apartments: [{ id: "apt-1", number: "1", active: true }],
    transactions: [{
      id: "tx-1", type: "income", date: "2026-02-01",
      description: "תשלום", amount: 120, campaignId: "campaign-1",
      campaignApartmentId: "apt-1", apartmentId: "apt-1"
    }],
    campaigns: [campaign]
  };
  const before = JSON.stringify(state);
  const audit = auditFinancialState(state);
  assert.equal(audit.ok, true);
  assert.ok(audit.warnings.some(message => message.includes("גבוה מהחיוב")));
  assert.equal(JSON.stringify(state), before);
});

test("migration preserves old paid totals and is idempotent", () => {
  const input = {
    schemaVersion: 2,
    apartments: [{ id: "apt-1", number: "1", active: true }],
    transactions: [{
      id: "tx-1", type: "income", date: "2026-02-01",
      description: "תשלום", amount: 10, campaignId: "campaign-1",
      campaignApartmentId: "apt-1", apartmentId: "apt-1"
    }],
    campaigns: [{ ...campaign, paid: { "apt-1": 30 } }]
  };
  const first = migrateState(input);
  assert.equal(first.state.campaigns[0].legacyPaidSnapshot["apt-1"], 30);
  assert.equal(first.state.campaigns[0].legacyReconciliation["apt-1"].unverifiedCarryForward, 20);
  const second = migrateState(first.state);
  assert.equal(second.changed, false);
  assert.deepEqual(second.state, first.state);
});

import { readFileSync } from "node:fs";
import vm from "node:vm";

test("application inline module has valid JavaScript syntax", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const match = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(match, "module script exists");
  const sourceWithoutImports = match[1].replace(/^\s*import\s+.*?;\s*$/gm, "");
  assert.doesNotThrow(() => new vm.Script(sourceWithoutImports));
});
