/// <reference types="vite/client" />
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';

// Handle firebase config from environment variables or local fallback file
const configs = import.meta.glob('../../firebase-applet-config.json', { eager: true });
const localConfig = (configs['../../firebase-applet-config.json'] as any)?.default;

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || localConfig?.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || localConfig?.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || localConfig?.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || localConfig?.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || localConfig?.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || localConfig?.appId,
  databaseId: import.meta.env.VITE_FIREBASE_DATABASE_ID || localConfig?.firestoreDatabaseId,
};

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  // Disable persistence for sandbox environments to avoid IndexedDB errors
  localCache: {
    kind: 'memory'
  }
});
export const auth = getAuth(app);

/**
 * Standardized Firestore error handler for AI Studio apps.
 * Catches FirebaseErrors and re-throws them as a JSON string with metadata.
 */
export function handleFirestoreError(error: any, context: string): never {
  if (error && typeof error === 'object' && 'code' in error) {
    const firestoreError = {
      message: error.message || 'Unknown Firestore error',
      code: error.code,
      context,
      timestamp: new Date().toISOString(),
    };
    throw new Error(JSON.stringify(firestoreError));
  }
  throw error;
}
