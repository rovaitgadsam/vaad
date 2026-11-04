/** Shared validation rules for financial records and campaign periods. */
export function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00");
  return !Number.isNaN(date.getTime()) &&
    date.getFullYear() === Number(value.slice(0, 4)) &&
    date.getMonth() + 1 === Number(value.slice(5, 7)) &&
    date.getDate() === Number(value.slice(8, 10));
}

export function validateTransaction(transaction) {
  const errors = [];
  if (!transaction || !["income", "expense"].includes(transaction.type)) {
    errors.push("סוג התנועה אינו תקין");
  }
  if (!isValidDate(transaction?.date)) errors.push("תאריך התנועה אינו תקין");
  if (!String(transaction?.description || "").trim()) errors.push("חסר תיאור לתנועה");
  const amount = Number(transaction?.amount);
  if (!Number.isFinite(amount) || amount <= 0) errors.push("הסכום חייב להיות גדול מאפס");
  if (transaction?.campaignId && transaction.type !== "income") {
    errors.push("תשלום גבייה חייב להיות תנועת הכנסה");
  }
  if (transaction?.campaignId && !transaction?.campaignApartmentId) {
    errors.push("לתשלום גבייה חסר מזהה דירה");
  }
  return { valid: errors.length === 0, errors };
}

export function validateCampaign(campaign, existingCampaigns = []) {
  const errors = [];
  if (!String(campaign?.title || "").trim()) errors.push("חסר שם לתקופת הגבייה");
  if (!isValidDate(campaign?.from) || !isValidDate(campaign?.to) ||
      campaign.from > campaign.to) {
    errors.push("טווח התאריכים של תקופת הגבייה אינו תקין");
  }
  const due = Number(campaign?.due);
  if (!Number.isFinite(due) || due <= 0) errors.push("החיוב חייב להיות גדול מאפס");

  const overlap = existingCampaigns.some(existing =>
    existing.id !== campaign?.id &&
    existing.from && existing.to &&
    campaign?.from <= existing.to &&
    campaign?.to >= existing.from
  );
  if (overlap) errors.push("קיימת תקופת גבייה חופפת");

  return { valid: errors.length === 0, errors };
}
