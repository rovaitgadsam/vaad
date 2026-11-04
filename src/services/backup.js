/** Portable JSON backup helpers for local and Firestore state. */
export function createBackup(state) {
  return {
    format: "vaad-backup",
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    state: JSON.parse(JSON.stringify(state))
  };
}

export function parseBackup(value) {
  if (!value || typeof value !== "object" || value.format !== "vaad-backup" ||
      value.formatVersion !== 1 || !value.state || typeof value.state !== "object") {
    throw new Error("קובץ הגיבוי אינו בפורמט הנתמך");
  }
  const state = value.state;
  if (!Array.isArray(state.apartments) || !Array.isArray(state.transactions) ||
      !Array.isArray(state.campaigns)) {
    throw new Error("קובץ הגיבוי אינו מכיל את כל אוספי הנתונים הנדרשים");
  }
  return JSON.parse(JSON.stringify(state));
}
