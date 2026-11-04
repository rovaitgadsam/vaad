import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";
import { auth } from "./firebase.js";

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

export function observeAuth(callback) {
  if (!auth) throw new Error("Firebase לא הוגדר עדיין");
  return onAuthStateChanged(auth, callback);
}

export async function signInWithGoogle() {
  if (!auth) throw new Error("Firebase לא הוגדר עדיין");
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function signOutUser() {
  if (!auth) throw new Error("Firebase לא הוגדר עדיין");
  return signOut(auth);
}
