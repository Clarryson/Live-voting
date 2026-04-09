import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

let db;
try {
  // If firestore is already initialized for this app, get it
  db = getFirestore(app);
} catch (e) {
  // Otherwise initialize it with our preferred settings
  db = initializeFirestore(app, {
    experimentalForceLongPolling: true,
  });
}

export const auth = getAuth(app);
export const storage = getStorage(app);
export { db };
