/**
 * Canonical financial calculations for the homeowners' association app.
 * The transactions ledger is the source of truth for recorded payments.
 * Unverified legacy carry-forwards remain separate and are never fabricated
 * into transaction records.
 */
export function toCents(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round((amount + Number.EPSILON) * 100) : 0;
}
function fromCents(value) { return value / 100; }
function linkedCampaignPaymentsInCents(campaign, transactions = []) {
  const totals = {};
  if (!campaign?.id || !Array.isArray(transactions)) return totals;
  for (const tx of transactions) {
    if (!tx || tx.type !== "income" || tx.campaignId !== campaign.id ||
        tx.campaignApartmentId === undefined || tx.campaignApartmentId === null ||
        tx.campaignApartmentId === "") continue;
    const amount = toCents(tx.amount);
    if (amount <= 0) continue;
    const apartmentId = String(tx.campaignApartmentId);
    totals[apartmentId] = (totals[apartmentId] || 0) + amount;
  }
  return totals;
}
export function linkedCampaignPayments(campaign, transactions = []) {
  const cents = linkedCampaignPaymentsInCents(campaign, transactions);
  return Object.fromEntries(Object.entries(cents).map(([id, amount]) => [id, fromCents(amount)]));
}
export function campaignPaidForApartment(campaign, apartmentId, transactions = []) {
  const ledger = linkedCampaignPaymentsInCents(campaign, transactions);
  const recorded = ledger[String(apartmentId)] || 0;
  const carryForward = Math.max(0, toCents(
    campaign?.legacyReconciliation?.[apartmentId]?.unverifiedCarryForward || 0
  ));
  return fromCents(recorded + carryForward);
}
export function campaignPaidSummary(campaign, transactions = []) {
  const ledgerCents = linkedCampaignPaymentsInCents(campaign, transactions);
  const ids = new Set([...Object.keys(ledgerCents), ...Object.keys(campaign?.legacyReconciliation || {})]);
  const apartments = {};
  let totalCents = 0;
  for (const id of ids) {
    const amount = campaignPaidForApartment(campaign, id, transactions);
    apartments[id] = amount;
    totalCents += toCents(amount);
  }
  const ledger = Object.fromEntries(Object.entries(ledgerCents).map(([id, amount]) => [id, fromCents(amount)]));
  return { total: fromCents(totalCents), apartments, ledger };
}
export function campaignDueTotal(campaign) {
  if (!Array.isArray(campaign?.apartments)) return 0;
  return fromCents(campaign.apartments.reduce((total, apartment) =>
    total + Math.max(0, toCents(apartment?.due)), 0));
}
export function campaignRemaining(campaign, apartmentId, transactions = []) {
  const apartment = (campaign?.apartments || []).find(item => String(item.id) === String(apartmentId));
  if (!apartment) return 0;
  const dueCents = Math.max(0, toCents(apartment.due));
  const paidCents = toCents(campaignPaidForApartment(campaign, apartmentId, transactions));
  return fromCents(Math.max(0, dueCents - paidCents));
}
