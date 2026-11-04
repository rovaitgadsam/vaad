import firebaseConfig from "./firebase-config.js";

const VERSION = "13.2.0";
const BASE = "https://www.gstatic.com/firebasejs/" + VERSION + "/";
export const firebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.projectId &&
  firebaseConfig.appId &&
  firebaseConfig.messagingSenderId
);

let instances = null;

export async function initializeFirebase() {
  if (!firebaseConfigured) throw new Error("חסרים פרטי Firebase Web App");
  if (!instances) {
    const [appSdk, authSdk, firestoreSdk] = await Promise.all([
      import(BASE + "firebase-app.js"),
      import(BASE + "firebase-auth.js"),
      import(BASE + "firebase-firestore.js")
    ]);
    const app = appSdk.getApps().length
      ? appSdk.getApp()
      : appSdk.initializeApp(firebaseConfig);
    instances = {
      app,
      auth: authSdk.getAuth(app),
      db: firestoreSdk.getFirestore(app)
    };
  }
  return instances;
}
