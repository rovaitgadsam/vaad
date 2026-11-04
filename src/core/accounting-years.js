/**
 * Accounting-year state and safe year rollover helpers.
 * Archived snapshots are immutable copies; no legacy transaction is fabricated.
 */
import { auditFinancialState } from "./validation.js";

const clone = value => JSON.parse(JSON.stringify(value));
const cents = value => Math.round((Number(value) || 0) * 100);
const shekels = value => (Number(value) || 0) / 100;
export const DEFAULT_ACCOUNTING_YEAR = 2026;

export function ensureAccountingState(input, fallbackYear = DEFAULT_ACCOUNTING_YEAR) {
  const state = clone(input || {});
  const year = Number(state.accounting?.activeYear) || Number(fallbackYear) || DEFAULT_ACCOUNTING_YEAR;
  const existing = state.accounting && typeof state.accounting === "object" ? state.accounting : {};
  const years = existing.years && typeof existing.years === "object" ? { ...existing.years } : {};
  let changed = !state.accounting || !existing.years || !existing.activeYear;
  if (!years[String(year)]) {
    years[String(year)] = {
      year,
      status: "active",
      openingBalance: shekels(cents(state.openingBalance || 0)),
      openedAt: null
    };
    changed = true;
  }
  if (years[String(year)].status !== "active") {
    throw new Error("שנת החשבונאות המסומנת כפעילה אינה במצב פעיל");
  }
  state.accounting = {
    ...existing,
    schemaVersion: 1,
    activeYear: year,
    years
  };
  if (!Number.isFinite(Number(state.openingBalance))) {
    state.openingBalance = Number(years[String(year)].openingBalance) || 0;
    changed = true;
  }
  return { state, changed };
}

export function getActiveAccountingYear(state) {
  return Number(state?.accounting?.activeYear) || DEFAULT_ACCOUNTING_YEAR;
}

export function calculateCashPosition(state) {
  const transactions = Array.isArray(state?.transactions) ? state.transactions : [];
  let incomeCents = 0;
  let committeeExpenseCents = 0;
  let unclassifiedExpenseCents = 0;
  let unclassifiedExpenseCount = 0;
  for (const tx of transactions) {
    if (!tx || !Number.isFinite(Number(tx.amount))) continue;
    if (tx.type === "income") incomeCents += Math.max(0, cents(tx.amount));
    if (tx.type !== "expense") continue;
    if (tx.paidBy === "קופת הוועד") {
      committeeExpenseCents += Math.max(0, cents(tx.amount));
    } else if (!["זהר", "צחי", "שנינו"].includes(tx.paidBy)) {
      unclassifiedExpenseCents += Math.max(0, cents(tx.amount));
      unclassifiedExpenseCount += 1;
    }
  }
  const openingCents = cents(state?.openingBalance || 0);
  return {
    openingBalance: shekels(openingCents),
    income: shekels(incomeCents),
    committeeExpenses: shekels(committeeExpenseCents),
    unclassifiedExpenseAmount: shekels(unclassifiedExpenseCents),
    unclassifiedExpenseCount,
    estimatedBalance: shekels(openingCents + incomeCents - committeeExpenseCents)
  };
}

function yearOf(value) {
  const match = String(value || "").match(/^(\d{4})-/);
  return match ? Number(match[1]) : null;
}

export function buildAnnualReport(state, year, cashReconciliation = null, generatedAt = new Date().toISOString()) {
  const transactions = Array.isArray(state?.transactions) ? state.transactions : [];
  const campaigns = Array.isArray(state?.campaigns) ? state.campaigns : [];
  const campaignById = new Map(campaigns.map(campaign => [campaign.id, campaign]));
  const campaignYear = campaign => Number(campaign?.accountingYear) || yearOf(campaign?.from);
  const annualIncome = transactions.filter(tx => tx?.type === "income" && (
    tx.campaignId
      ? campaignYear(campaignById.get(tx.campaignId)) === Number(year)
      : (Number(tx.collectionYear) || yearOf(tx.date)) === Number(year)
  ));
  const actualCashIncome = transactions.filter(tx => tx?.type === "income" && yearOf(tx.date) === Number(year));
  const annualExpenses = transactions.filter(tx => tx?.type === "expense" && yearOf(tx.date) === Number(year));
  const lateCollectionPayments = transactions
    .filter(tx => tx?.type === "income" && yearOf(tx.date) === Number(year) &&
      Number(tx.collectionYear) && Number(tx.collectionYear) !== Number(year))
    .map(tx => ({
      date: tx.date,
      collectionYear: Number(tx.collectionYear),
      description: String(tx.description || ""),
      amount: shekels(cents(tx.amount))
    }));
  const sumCents = items => items.reduce((total, item) => total + cents(item.amount), 0);
  const incomeCents = sumCents(annualIncome);
  const expenseCents = sumCents(annualExpenses);
  const campaignSummaries = campaigns
    .filter(campaign => campaignYear(campaign) === Number(year))
    .map(campaign => ({
      id: campaign.id,
      title: String(campaign.title || "תקופת גבייה"),
      from: campaign.from || "",
      to: campaign.to || "",
      amount: shekels(sumCents(annualIncome.filter(tx => tx.campaignId === campaign.id))),
      transactionCount: annualIncome.filter(tx => tx.campaignId === campaign.id).length
    }));
  const categories = {};
  for (const tx of annualExpenses) {
    const key = String(tx.category || "ללא קטגוריה").trim() || "ללא קטגוריה";
    categories[key] = (categories[key] || 0) + cents(tx.amount);
  }
  const payers = {};
  for (const tx of annualExpenses) {
    const key = String(tx.paidBy || "לא צוין");
    payers[key] = (payers[key] || 0) + cents(tx.amount);
  }
  const months = {};
  for (const tx of annualExpenses) {
    const key = String(tx.date || "").slice(0, 7);
    if (key.length === 7) months[key] = (months[key] || 0) + cents(tx.amount);
  }
  return {
    year: Number(year),
    generatedAt,
    incomeByCollectionYear: shekels(incomeCents),
    incomeReceivedDuringYear: shekels(sumCents(actualCashIncome)),
    expensesDuringYear: shekels(expenseCents),
    netByAnnualReportingRule: shekels(incomeCents - expenseCents),
    transactionCount: annualIncome.length + annualExpenses.length,
    incomeTransactionCount: annualIncome.length,
    expenseTransactionCount: annualExpenses.length,
    campaigns: campaignSummaries,
    lateCollectionPayments,
    categories: Object.fromEntries(Object.entries(categories).map(([key, value]) => [key, shekels(value)])),
    payers: Object.fromEntries(Object.entries(payers).map(([key, value]) => [key, shekels(value)])),
    monthlyExpenses: Object.fromEntries(Object.entries(months).map(([key, value]) => [key, shekels(value)])),
    cashReconciliation: cashReconciliation ? clone(cashReconciliation) : null
  };
}

export function prepareYearClose(input, options = {}) {
  const state = clone(input || {});
  const activeYear = getActiveAccountingYear(state);
  const closingBalanceValue = Number(options.closingBalance);
  if (!Number.isFinite(closingBalanceValue)) {
    throw new Error("יש להזין יתרת קופה בפועל כמספר תקין");
  }
  const audit = auditFinancialState(state);
  if (!audit.ok) {
    throw new Error("לא ניתן לסגור שנה לפני תיקון שגיאות תקינות: " + audit.errors.slice(0, 3).join("; "));
  }
  const years = state.accounting?.years && typeof state.accounting.years === "object"
    ? { ...state.accounting.years }
    : {};
  if (years[String(activeYear)]?.status === "closed") {
    throw new Error("השנה כבר נסגרה ונמצאת בארכיון");
  }
  const nextYear = activeYear + 1;
  if (years[String(nextYear)]) {
    throw new Error(years[String(nextYear)].status === "active"
      ? "כבר קיימת שנה פעילה לאחר השנה הנוכחית"
      : "קיים כבר ארכיון לשנה הבאה. כדי למנוע דריסת נתונים, הסגירה נעצרה");
  }

  const position = calculateCashPosition(state);
  const actualBalance = shekels(cents(closingBalanceValue));
  const cashReconciliation = {
    estimatedBalance: position.estimatedBalance,
    actualBalance,
    variance: shekels(cents(actualBalance) - cents(position.estimatedBalance)),
    unclassifiedExpenseCount: position.unclassifiedExpenseCount,
    unclassifiedExpenseAmount: position.unclassifiedExpenseAmount,
    note: String(options.note || "").trim(),
    confirmedAt: options.closedAt || new Date().toISOString()
  };
  const annualReport = buildAnnualReport(state, activeYear, cashReconciliation, options.closedAt || new Date().toISOString());
  const snapshot = clone(state);
  delete snapshot.accounting;

  years[String(activeYear)] = {
    year: activeYear,
    status: "closed",
    openingBalance: shekels(cents(state.openingBalance || 0)),
    closingBalance: actualBalance,
    closedAt: options.closedAt || new Date().toISOString(),
    transactionCount: Array.isArray(state.transactions) ? state.transactions.length : 0,
    campaignCount: Array.isArray(state.campaigns) ? state.campaigns.length : 0,
    audit: clone(audit),
    cashReconciliation,
    annualReport,
    archiveSnapshot: snapshot
  };
  years[String(nextYear)] = {
    year: nextYear,
    status: "active",
    openingBalance: actualBalance,
    openedAt: options.closedAt || new Date().toISOString()
  };

  const nextState = {
    ...state,
    schemaVersion: Math.max(3, Number(state.schemaVersion) || 0),
    openingBalance: actualBalance,
    transactions: [],
    campaigns: [],
    accounting: {
      ...(state.accounting || {}),
      schemaVersion: 1,
      activeYear: nextYear,
      years
    }
  };
  return {
    state: nextState,
    closedYear: activeYear,
    nextYear,
    closingBalance: actualBalance,
    archive: years[String(activeYear)]
  };
}
