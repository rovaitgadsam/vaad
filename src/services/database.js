import { initializeFirebase } from "./firebase.js";

const VERSION = "13.2.0";
const FIRESTORE_URL = "https://www.gstatic.com/firebasejs/" + VERSION + "/firebase-firestore.js";
const STATE_REF = ["appData", "main"];
const clone = value => JSON.parse(JSON.stringify(value));

export class CloudConflictError extends Error {
  constructor(message = "הנתונים בענן השתנו במכשיר אחר. כדי למנוע דריסת נתונים, הסנכרון נעצר.") {
    super(message);
    this.name = "CloudConflictError";
    this.code = "cloud-conflict";
  }
}

export async function openStateSync({ uid, initialState, onRemoteState, onStatus }) {
  if (!uid) throw new Error("נדרשת התחברות לחשבון Google");
  const { db } = await initializeFirebase();
  const { doc, runTransaction, onSnapshot, serverTimestamp } = await import(FIRESTORE_URL);
  const ref = doc(db, ...STATE_REF);
  let revision = 0;
  let pendingWrite = false;
  let pendingRemote = null;
  let stopped = false;

  const initial = await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(ref);
    if (snapshot.exists()) return snapshot.data();
    const seeded = {
      schemaVersion: 2,
      revision: 1,
      state: clone(initialState),
      updatedAt: serverTimestamp(),
      updatedBy: uid
    };
    transaction.set(ref, seeded);
    return { ...seeded, updatedAt: null };
  });

  if (!initial || !initial.state || typeof initial.state !== "object") {
    throw new Error("מבנה הנתונים בענן אינו תקין. הנתונים המקומיים לא שונו.");
  }

  revision = Number(initial.revision) || 1;
  onRemoteState(clone(initial.state), { revision, source: "cloud-initial" });
  onStatus({ state: "connected", revision, uid });

  const unsubscribe = onSnapshot(ref, snapshot => {
    if (stopped || !snapshot.exists()) return;
    const remote = snapshot.data();
    const remoteRevision = Number(remote.revision) || 0;
    if (!remote.state || remoteRevision <= revision) return;
    if (pendingWrite) {
      pendingRemote = remote;
      return;
    }
    revision = remoteRevision;
    onRemoteState(clone(remote.state), { revision, source: "cloud-remote" });
    onStatus({ state: "connected", revision, uid });
  }, error => {
    onStatus({ state: "error", error, uid });
  });

  return {
    get revision() { return revision; },
    async save(nextState) {
      if (stopped) throw new Error("חיבור הענן נסגר");
      pendingWrite = true;
      try {
        const saved = await runTransaction(db, async transaction => {
          const snapshot = await transaction.get(ref);
          if (!snapshot.exists()) throw new CloudConflictError("מסמך הנתונים בענן נעלם. לא בוצעה כתיבה.");
          const remote = snapshot.data();
          const remoteRevision = Number(remote.revision) || 0;
          if (remoteRevision !== revision) throw new CloudConflictError();
          const nextRevision = revision + 1;
          transaction.set(ref, {
            schemaVersion: 2,
            revision: nextRevision,
            state: clone(nextState),
            updatedAt: serverTimestamp(),
            updatedBy: uid
          });
          return nextRevision;
        });
        revision = saved;
        onStatus({ state: "connected", revision, uid });
        return saved;
      } catch (error) {
        if (error instanceof CloudConflictError || error?.code === "cloud-conflict") {
          stopped = true;
          unsubscribe();
          onStatus({ state: "conflict", error, uid, revision });
        } else {
          onStatus({ state: "error", error, uid, revision });
        }
        throw error;
      } finally {
        pendingWrite = false;
        if (pendingRemote && !stopped) {
          const remote = pendingRemote;
          pendingRemote = null;
          const remoteRevision = Number(remote.revision) || 0;
          if (remoteRevision > revision) {
            revision = remoteRevision;
            onRemoteState(clone(remote.state), { revision, source: "cloud-remote" });
          }
        }
      }
    },
    close() {
      stopped = true;
      unsubscribe();
    }
  };
}
