"use client";

import { useEffect, useMemo, useState } from "react";
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, User } from "firebase/auth";
import { getFirestore, collection, onSnapshot, query, where, limit } from "firebase/firestore";

/** Optional: fallback init so it works even on pages that haven't initialized yet */
const ensureFirebase = () => {
  if (!getApps().length) {
    initializeApp({
      apiKey: "AIzaSyDpJJMN5kke2PBf-TpaSvzguJVQq_JFJ6o",
      authDomain: "sectorfmuser.firebaseapp.com",
      projectId: "sectorfmuser",
      storageBucket: "sectorfmuser.firebasestorage.app",
      messagingSenderId: "403087972818",
      appId: "1:403087972818:web:ddce221525eee12eead00b",
    });
  }
  const app = getApp();
  return { app, auth: getAuth(app), db: getFirestore(app) };
};

type Props = {
  children: React.ReactNode;
  /** What to render while checking (default: nothing) */
  whileChecking?: React.ReactNode;
  /** What to render when NOT subscribed (default: nothing) */
  fallback?: React.ReactNode;
  /** Treat these statuses as "subscribed" (default: active, trialing) */
  statuses?: string[];
};

export function IfSubscribed({
  children,
  whileChecking = null,
  fallback = null,
  statuses = ["active", "trialing"],
}: Props) {
  const { auth, db } = ensureFirebase();
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [checking, setChecking] = useState(true);
  const [isSub, setIsSub] = useState<boolean>(false);

  // track auth
  useEffect(() => onAuthStateChanged(auth, (u) => setUser(u)), [auth]);

  // watch subscription doc(s)
  useEffect(() => {
    if (!user) {
      setIsSub(false);
      setChecking(false);
      return;
    }
    const q = query(
      collection(db, "customers", user.uid, "subscriptions"),
      where("status", "in", statuses),
      limit(1)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setIsSub(!snap.empty);
        setChecking(false);
      },
      () => setChecking(false)
    );
    return unsub;
  }, [db, user, statuses.join("|")]);

  if (checking) return <>{whileChecking}</>;
  return <>{isSub ? children : fallback}</>;
}
