/**
 * Canonical financial calculations for the homeowners' association app.
 * The transactions ledger is the source of truth for recorded payments.
 * Unverified legacy carry-forwards are displayed separately and never become
 * fabricated transaction records.
 */
export function linkedCampaignPayments(campaign, transactions = []) {
  const totals = {};
  for (const tx of transactions) {
    if (
      tx &&
      tx.type === "income" &&
      tx.campaignId === campaign.id &&
      tx.campaignApartmentId
    ) {
      const amount = Number(tx.amount);
      if (Number.isFinite(amount) && amount > 0) {
        totals[tx.campaignApartmentId] =
          (totals[tx.campaignApartmentId] || 0) + amount;
      }
    }
  }
  return totals;
}

export function campaignPaidForApartment(campaign, apartmentId, transactions = []) {
  const ledger = linkedCampaignPayments(campaign, transactions);
  const recorded = Number(ledger[apartmentId] || 0);
  const carryForward = Number(
    campaign?.legacyReconciliation?.[apartmentId]?.unverifiedCarryForward || 0
  );
  return recorded + carryForward;
}

export function campaignPaidSummary(campaign, transactions = []) {
  const ledger = linkedCampaignPayments(campaign, transactions);
  const ids = new Set([
    ...Object.keys(ledger),
    ...Object.keys(campaign?.legacyReconciliation || {})
  ]);
  const apartments = {};
  let total = 0;

  for (const id of ids) {
    const amount = campaignPaidForApartment(campaign, id, transactions);
    apartments[id] = amount;
    total += amount;
  }

  return { total, apartments, ledger };
}

export function campaignDueTotal(campaign) {
  if (!Array.isArray(campaign?.apartments)) return 0;
  return campaign.apartments.reduce(
    (total, apartment) => total + Math.max(0, Number(apartment.due) || 0),
    0
  );
}

export function campaignRemaining(campaign, apartmentId, transactions = []) {
  const apartment = (campaign?.apartments || []).find(item => item.id === apartmentId);
  if (!apartment) return 0;
  return Math.max(
    0,
    Number(apartment.due || 0) - campaignPaidForApartment(campaign, apartmentId, transactions)
  );
}
