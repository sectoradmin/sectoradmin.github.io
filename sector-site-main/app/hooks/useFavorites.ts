// hooks/useFavorites.ts
"use client";

import { useEffect, useMemo, useState } from "react";
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import {
  getFirestore,
  query,
  where,
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";

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

// robust: get last non-empty path segment as slug
export function slugFromMixcloudUrl(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || "";
  } catch {
    // fallback
    return url.replace(/\/+$/, "").split("/").pop() || "";
  }
}

export function useFavorites() {
  const { auth, db } = ensureFirebase();
  const [uid, setUid] = useState<string | null>(auth.currentUser?.uid ?? null);
  const [items, setItems] = useState<{ slug: string; url: string; createdAt?: any }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() =>
    onAuthStateChanged(auth, (u) => {
      setUid(u?.uid ?? null);
    }), [auth]
  );

  useEffect(() => {
    if (!uid) { setItems([]); setLoading(false); return; }
    const q = query(collection(db, "favorites"), where("user", "==", uid));
    const unsub = onSnapshot(q, (snap) => {
      setItems(snap.docs.map(d => d.data() as any).sort((a,b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)));
      setLoading(false);
    });
    return unsub;
  }, [db, uid]);

  const key = (slug: string) => (uid ? `${uid}_${slug}` : "");

  async function add(url: string) {
    if (!uid) throw new Error("Not signed in");
    const slug = slugFromMixcloudUrl(url);
    const id = key(slug);
    await setDoc(doc(db, "favorites", id), {
      user: uid,
      url,
      slug,
      createdAt: serverTimestamp(),
    }, { merge: true });

    // Kick off a best-effort Kirby ensure (non-blocking)
    fetch("/api/kirby/ensure-show", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, slug }),
    }).catch(() => {});
  }

  async function removeBySlug(slug: string) {
    if (!uid) throw new Error("Not signed in");
    await deleteDoc(doc(db, "favorites", key(slug)));
  }

  function has(slug: string) {
    return items.some(i => i.slug === slug);
  }

  return { uid, items, loading, add, removeBySlug, has, slugFromMixcloudUrl };
}
