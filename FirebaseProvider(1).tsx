import React, { createContext, useContext, useEffect, useState } from 'react';
import { 
  onAuthStateChanged, 
  User, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut as firebaseSignOut 
} from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

interface UserPreferences {
  persona: string;
  length: string;
  microStepType: string;
  email: string;
}

interface AuthContextType {
  currentUser: User | null;
  loading: boolean;
  preferences: UserPreferences | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  updatePreferences: (prefs: Partial<UserPreferences>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within a FirebaseProvider');
  return context;
};

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          // Fetch or create user preferences
          const userDocRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (!userDoc.exists()) {
            const defaultPrefs: UserPreferences = {
              persona: "Supportive Peer",
              length: "Ultra-short (<50 words)",
              microStepType: "Digital",
              email: user.email || ""
            };
            await setDoc(userDocRef, defaultPrefs);
            setPreferences(defaultPrefs);
          } else {
            setPreferences(userDoc.data() as UserPreferences);
          }

          // Real-time listener for preferences
          const unsubPrefs = onSnapshot(userDocRef, (doc) => {
            if (doc.exists()) {
              setPreferences(doc.data() as UserPreferences);
            }
          }, (err) => {
            console.warn("Firestore snapshot listener error (likely offline):", err);
          });
          
          return () => unsubPrefs();
        } catch (error: any) {
          if (error?.code === 'unavailable' || error?.message?.includes('offline')) {
            console.warn("Firestore is offline, using default preferences.");
          } else {
            console.error("Firestore preferences fetch failed:", error);
          }
          // Set fallback preferences if offline
          setPreferences({
            persona: "Supportive Peer",
            length: "Ultra-short (<50 words)",
            microStepType: "Digital",
            email: user.email || ""
          });
        }
      } else {
        setPreferences(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
  };

  const updatePreferences = async (prefs: Partial<UserPreferences>) => {
    if (!currentUser) return;
    const userDocRef = doc(db, 'users', currentUser.uid);
    await setDoc(userDocRef, { ...preferences, ...prefs }, { merge: true });
  };

  const value = {
    currentUser,
    loading,
    preferences,
    signInWithGoogle,
    signOut,
    updatePreferences
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
