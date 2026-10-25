// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import {
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAz6RtO7v4OebbUX6RSToak7Al7RmDCzTk",
  authDomain: "groceryhauls-pro-za-app.firebaseapp.com",
  projectId: "groceryhauls-pro-za-app",
  storageBucket: "groceryhauls-pro-za-app.firebasestorage.app",
  messagingSenderId: "487592312240",
  appId: "1:487592312240:web:8700af4cd35bb46e53aa75",
  measurementId: "G-WL1MBJ7EX1"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Analytics only runs in the browser — Next.js pre-renders client components
// on the server, so we guard with isSupported() to avoid an SSR crash.
const analytics = isSupported().then((ok) => (ok ? getAnalytics(app) : null));

/**
 * Auth + Firestore are created lazily (on first use in the browser).
 * getAuth() touches browser-only APIs, so calling it at module scope would
 * crash during Next.js server-side rendering of client components.
 */
let _auth = null;
let _db = null;

export function getFirebaseAuth() {
  if (!_auth) _auth = getAuth(app);
  return _auth;
}

export function getFirebaseDb() {
  if (!_db) _db = getFirestore(app);
  return _db;
}

// Google sign-in provider — always show the account chooser
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export {
  app,
  analytics,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
};
