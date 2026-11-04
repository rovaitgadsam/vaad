/** Shared validation and integrity checks for financial records. */
import { campaignPaidForApartment, toCents } from "./finance.js";

export function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00");
  return !Number.isNaN(date.getTime()) &&
    date.getFullYear() === Number(value.slice(0, 4)) &&
    date.getMonth() + 1 === Number(value.slice(5, 7)) &&
    date.getDate() === Number(value.slice(8, 10));
}

export function validateTransaction(transaction, context = {}) {
  const errors = [];
  if (!transaction || typeof transaction !== "object") {
    return { valid: false, errors: ["פרטי התנועה אינם תקינים"] };
  }
  if (transaction.id === undefined || transaction.id === null || String(transaction.id).trim() === "") {
    errors.push("חסר מזהה לתנועה");
  }
  if (!["income", "expense"].includes(transaction.type)) errors.push("סוג התנועה אינו תקין");
  if (!isValidDate(transaction.date)) errors.push("תאריך התנועה אינו תקין");
  if (!String(transaction.description || "").trim()) errors.push("חסר תיאור לתנועה");

  const amount = Number(transaction.amount);
  if (!Number.isFinite(amount) || amount <= 0) errors.push("הסכום חייב להיות גדול מאפס");

  const hasCampaignId = transaction.campaignId !== undefined && transaction.campaignId !== null && String(transaction.campaignId) !== "";
  const hasCampaignApartmentId = transaction.campaignApartmentId !== undefined && transaction.campaignApartmentId !== null && String(transaction.campaignApartmentId) !== "";
  if (hasCampaignId !== hasCampaignApartmentId) errors.push("קישור לתקופת גבייה ולדירה חייב לכלול את שני המזהים");
  if ((hasCampaignId || hasCampaignApartmentId) && transaction.type !== "income") errors.push("תשלום גבייה חייב להיות תנועת הכנסה");

  if (hasCampaignId && Array.isArray(context.campaigns)) {
    const campaign = context.campaigns.find(item => item?.id === transaction.campaignId);
    if (!campaign) {
      errors.push("תקופת הגבייה המקושרת אינה קיימת");
    } else {
      const apartment = (Array.isArray(campaign.apartments) ? campaign.apartments : [])
        .find(item => String(item?.id) === String(transaction.campaignApartmentId));
      if (!apartment) errors.push("הדירה אינה קיימת בצילום המצב של תקופת הגבייה");
      if (transaction.apartmentId !== undefined && transaction.apartmentId !== null &&
          String(transaction.apartmentId) !== String(transaction.campaignApartmentId)) {
        errors.push("מזהה הדירה בתנועה אינו תואם לדירת הגבייה");
      }
    }
  }

  if (!hasCampaignId && transaction.apartmentId !== undefined && transaction.apartmentId !== null &&
      String(transaction.apartmentId) !== "" && Array.isArray(context.apartments) &&
      !context.apartments.some(item => String(item?.id) === String(transaction.apartmentId))) {
    errors.push("הדירה המשויכת לתנועה אינה קיימת");
  }
  if (Array.isArray(context.existingTransactions) &&
      context.existingTransactions.some(item => item?.id === transaction.id)) {
    errors.push("קיים כבר מזהה זהה ביומן התנועות");
  }
  return { valid: errors.length === 0, errors };
}

export function validateCampaign(campaign, existingCampaigns = []) {
  const errors = [];
  if (!String(campaign?.title || "").trim()) errors.push("חסר שם לתקופת הגבייה");
  if (!isValidDate(campaign?.from) || !isValidDate(campaign?.to) || campaign.from > campaign.to) {
    errors.push("טווח התאריכים של תקופת הגבייה אינו תקין");
  }
  const due = Number(campaign?.due);
  if (!Number.isFinite(due) || due <= 0) errors.push("החיוב חייב להיות גדול מאפס");
  const overlap = existingCampaigns.some(existing =>
    existing.id !== campaign?.id &&
    isValidDate(existing?.from) && isValidDate(existing?.to) &&
    isValidDate(campaign?.from) && isValidDate(campaign?.to) &&
    campaign.from <= existing.to && campaign.to >= existing.from
  );
  if (overlap) errors.push("קיימת תקופת גבייה חופפת");
  return { valid: errors.length === 0, errors };
}

/** Read-only integrity audit. It never changes or repairs the supplied state. */
export function auditFinancialState(state) {
  const errors = [];
  const warnings = [];
  const data = state && typeof state === "object" ? state : {};
  const apartments = Array.isArray(data.apartments) ? data.apartments : [];
  const transactions = Array.isArray(data.transactions) ? data.transactions : [];
  const campaigns = Array.isArray(data.campaigns) ? data.campaigns : [];

  const findDuplicates = (items, label) => {
    const seen = new Set();
    const duplicates = new Set();
    for (const item of items) {
      if (item?.id === undefined || item?.id === null || String(item.id).trim() === "") {
        errors.push(label + ": רשומה ללא מזהה");
        continue;
      }
      const id = String(item.id);
      if (seen.has(id)) duplicates.add(id);
      seen.add(id);
    }
    for (const id of duplicates) errors.push(label + ": מזהה כפול " + id);
  };

  findDuplicates(apartments, "דירות");
  findDuplicates(transactions, "תנועות");
  findDuplicates(campaigns, "תקופות גבייה");

  for (const transaction of transactions) {
    const result = validateTransaction(transaction, { campaigns, apartments });
    for (const error of result.errors) {
      errors.push("תנועה " + (transaction?.id ?? "ללא מזהה") + ": " + error);
    }
  }

  for (const campaign of campaigns) {
    if (!Array.isArray(campaign?.apartments)) {
      warnings.push("תקופת גבייה " + (campaign?.title || campaign?.id) + ": חסר צילום מצב היסטורי של הדירות");
      continue;
    }
    const seenApartmentIds = new Set();
    for (const apartment of campaign.apartments) {
      if (!apartment || apartment.id === undefined || apartment.id === null) {
        errors.push("תקופת גבייה " + (campaign.title || campaign.id) + ": רשומת דירה ללא מזהה");
        continue;
      }
      const id = String(apartment.id);
      if (seenApartmentIds.has(id)) errors.push("תקופת גבייה " + (campaign.title || campaign.id) + ": דירה כפולה בצילום המצב (" + id + ")");
      seenApartmentIds.add(id);
      if (!Number.isFinite(Number(apartment.due)) || Number(apartment.due) < 0) {
        errors.push("תקופת גבייה " + (campaign.title || campaign.id) + ": חיוב לא תקין לדירה " + id);
      }
    }
    for (const apartment of campaign.apartments) {
      const paid = toCents(campaignPaidForApartment(campaign, apartment.id, transactions));
      const due = toCents(apartment.due);
      if (paid > due) warnings.push("תקופת גבייה " + (campaign.title || campaign.id) + ", דירה " + (apartment.number || apartment.id) + ": התשלום המצטבר גבוה מהחיוב");
    }
    if (campaign.legacyApartmentsMissing) {
      warnings.push("תקופת גבייה " + (campaign.title || campaign.id) + ": חסר צילום מצב היסטורי של הדירות");
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}
