import { initializeApp, getApps } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth, signInAnonymously } from "firebase/auth";
// Web config is public by design. Lock access down with Realtime Database rules.
const cfg = {
  apiKey: "AIzaSyC3Sle1dclWzhoKnnXYzCS3UidxgKNjmPc",
  authDomain: "hackathon-1d30e.firebaseapp.com",
  databaseURL: "https://hackathon-1d30e-default-rtdb.firebaseio.com",
  projectId: "hackathon-1d30e",
  storageBucket: "hackathon-1d30e.firebasestorage.app",
  messagingSenderId: "887688616711",
  appId: "1:887688616711:web:a7b45c9c2781c5d86183a2",
};
export const db = () => getDatabase(getApps()[0] ?? initializeApp(cfg));

/** Every device signs in anonymously, so rules can require a signed-in user and presence has a real identity.
 *  If anonymous sign-in is switched off in the console, the app carries on without it. */
let ready: Promise<string | null> | null = null;
export const cloudReady = (): Promise<string | null> => (ready ??= (async () => {
  if (typeof window === "undefined") return null;
  try {
    const app = getApps()[0] ?? initializeApp(cfg), a = getAuth(app);
    if (a.currentUser) return a.currentUser.uid;
    const c = await Promise.race([signInAnonymously(a), new Promise<never>((_, no) => setTimeout(() => no(new Error("timeout")), 4000))]);
    return c.user.uid;
  } catch { return null; }
})());
