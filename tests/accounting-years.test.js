import test from "node:test";
import assert from "node:assert/strict";
import { validateTransaction, auditFinancialState } from "../src/core/validation.js";
import {
  ensureAccountingState,
  getActiveAccountingYear,
  calculateCashPosition,
  buildAnnualReport,
  prepareYearClose
} from "../src/core/accounting-years.js";

function baseState() {
  return {
    schemaVersion: 3,
    apartments: [{ id: "apt-1", number: "1", name: "דייר", active: true }],
    monthlyFee: 85,
    openingBalance: 250,
    transactions: [
      { id: "in-1", type: "income", date: "2026-02-01", description: "גבייה", amount: 500, campaignId: "c-1", campaignApartmentId: "apt-1" },
      { id: "in-2", type: "income", date: "2026-12-15", description: "תשלום מאוחר", amount: 90, collectionYear: 2025 },
      { id: "ex-1", type: "expense", date: "2026-03-01", description: "חשמל", amount: 70, paidBy: "קופת הוועד" },
      { id: "ex-2", type: "expense", date: "2026-03-05", description: "תיקון", amount: 40, paidBy: "צחי" },
      { id: "ex-3", type: "expense", date: "2026-04-05", description: "הוצאה ישנה", amount: 20 }
    ],
    campaigns: [{
      id: "c-1", title: "גבייה ראשונה 2026", from: "2026-01-01", to: "2026-06-30",
      accountingYear: 2026, due: 500, status: "closed",
      apartments: [{ id: "apt-1", number: "1", due: 500 }]
    }]
  };
}

test("accounting metadata initializes once and preserves opening balance", () => {
  const original = baseState();
  const first = ensureAccountingState(original);
  assert.equal(first.changed, true);
  assert.equal(first.state.accounting.activeYear, 2026);
  assert.equal(first.state.accounting.years["2026"].openingBalance, 250);
  const second = ensureAccountingState(first.state);
  assert.equal(second.changed, false);
  assert.deepEqual(second.state, first.state);
  assert.equal(getActiveAccountingYear(second.state), 2026);
});

test("cash position excludes personal and unclassified expenses from cash", () => {
  const position = calculateCashPosition(baseState());
  assert.equal(position.openingBalance, 250);
  assert.equal(position.income, 590);
  assert.equal(position.committeeExpenses, 70);
  assert.equal(position.unclassifiedExpenseCount, 1);
  assert.equal(position.unclassifiedExpenseAmount, 20);
  assert.equal(position.estimatedBalance, 770);
});

test("annual report separates collection-year income from actual receipts", () => {
  const report = buildAnnualReport(baseState(), 2026);
  assert.equal(report.incomeByCollectionYear, 500);
  assert.equal(report.incomeReceivedDuringYear, 590);
  assert.deepEqual(report.lateCollectionPayments, [{ date: "2026-12-15", collectionYear: 2025, description: "תשלום מאוחר", amount: 90 }]);
  assert.equal(report.expensesDuringYear, 130);
  assert.equal(report.campaigns.length, 1);
});

test("year close archives a full immutable snapshot and opens next year with cash only", () => {
  const original = baseState();
  const before = JSON.stringify(original);
  const result = prepareYearClose(original, {
    closingBalance: 812.34,
    note: "התאמה לדוח הבנק",
    closedAt: "2026-12-31T18:00:00.000Z"
  });
  assert.equal(JSON.stringify(original), before);
  assert.equal(result.closedYear, 2026);
  assert.equal(result.nextYear, 2027);
  assert.equal(result.closingBalance, 812.34);
  assert.equal(result.state.openingBalance, 812.34);
  assert.deepEqual(result.state.transactions, []);
  assert.deepEqual(result.state.campaigns, []);
  assert.equal(result.state.accounting.activeYear, 2027);
  assert.equal(result.state.accounting.years["2027"].openingBalance, 812.34);
  const archive = result.state.accounting.years["2026"];
  assert.equal(archive.status, "closed");
  assert.equal(archive.archiveSnapshot.transactions.length, 5);
  assert.equal(archive.archiveSnapshot.campaigns.length, 1);
  assert.equal(archive.archiveSnapshot.transactions[1].collectionYear, 2025);
  assert.equal(archive.cashReconciliation.actualBalance, 812.34);
  assert.equal(archive.cashReconciliation.unclassifiedExpenseCount, 1);
  assert.equal(archive.annualReport.incomeByCollectionYear, 500);
});

test("year close rejects invalid balances and duplicate closed years", () => {
  const state = baseState();
  assert.throws(() => prepareYearClose(state, { closingBalance: "not-money" }), /יתרת קופה בפועל/);
  const closed = prepareYearClose(state, { closingBalance: 770 }).state;
  assert.throws(() => {
    closed.accounting.activeYear = 2026;
    prepareYearClose(closed, { closingBalance: 770 });
  }, /כבר נסגרה/);
});

test("year close never overwrites an already archived next year", () => {
  const state = baseState();
  state.accounting = {
    activeYear: 2026,
    years: {
      "2026": { year: 2026, status: "active", openingBalance: 250 },
      "2027": { year: 2027, status: "closed", closingBalance: 12, archiveSnapshot: { marker: "keep" } }
    }
  };
  assert.throws(() => prepareYearClose(state, { closingBalance: 770 }), /קיים כבר ארכיון לשנה הבאה/);
  assert.equal(state.accounting.years["2027"].archiveSnapshot.marker, "keep");
});

test("late collection year is valid only for income and a valid year", () => {
  const base = { id: "late-1", type: "income", date: "2027-02-01", description: "גבייה מאוחרת", amount: 90 };
  assert.equal(validateTransaction({ ...base, collectionYear: 2026 }).valid, true);
  assert.equal(validateTransaction({ ...base, collectionYear: 1800 }).valid, false);
  assert.equal(validateTransaction({ ...base, type: "expense", collectionYear: 2026 }).valid, false);
});

test("audit warns about transaction dates outside active accounting year", () => {
  const state = {
    accounting: { activeYear: 2026 },
    apartments: [],
    campaigns: [],
    transactions: [{
      id: "tx-old-date", type: "income", date: "0003-03-04",
      description: "תאריך ישן", amount: 510
    }]
  };
  const audit = auditFinancialState(state);
  assert.equal(audit.ok, true);
  assert.ok(audit.warnings.some(message => message.includes("שנת 3")));
});
