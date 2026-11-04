import { initializeFirebase } from "./firebase.js";

const VERSION = "13.2.0";
const AUTH_URL = "https://www.gstatic.com/firebasejs/" + VERSION + "/firebase-auth.js";

export async function observeAuth(callback) {
  const { auth } = await initializeFirebase();
  const { onAuthStateChanged } = await import(AUTH_URL);
  return onAuthStateChanged(auth, callback);
}

export async function signInWithGoogle() {
  const { auth } = await initializeFirebase();
  const { GoogleAuthProvider, signInWithPopup } = await import(AUTH_URL);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function signOutUser() {
  const { auth } = await initializeFirebase();
  const { signOut } = await import(AUTH_URL);
  return signOut(auth);
}
