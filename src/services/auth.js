import { initializeFirebase } from "./firebase.js";

const VERSION = "13.2.0";
const AUTH_URL = "https://www.gstatic.com/firebasejs/" + VERSION + "/firebase-auth.js";

export async function observeAuth(callback) {
  const { auth } = await initializeFirebase();
  const { onAuthStateChanged } = await import(AUTH_URL);
  return onAuthStateChanged(auth, callback);
}

export async function signInWithEmail(email, password) {
  const { auth } = await initializeFirebase();
  const { signInWithEmailAndPassword } = await import(AUTH_URL);
  const result = await signInWithEmailAndPassword(auth, email.trim(), password);
  return result.user;
}

export async function signOutUser() {
  const { auth } = await initializeFirebase();
  const { signOut } = await import(AUTH_URL);
  return signOut(auth);
}
