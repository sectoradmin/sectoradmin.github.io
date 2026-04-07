"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, User, signOut } from "firebase/auth";
import { getFirestore, collection, query, where, limit, onSnapshot, addDoc } from "firebase/firestore"
import { getFunctions, httpsCallable } from "firebase/functions"
import FavoritesSection from "@/components/FavoritesSection";

// ⬇️ NEW: render login UI instead of redirecting
import LoginLayout from "./login-layout"; // <-- adjust if your path differs
import { IfSubscribed } from "./if-subscribed";

const firebaseConfig = {
  apiKey: "AIzaSyDpJJMN5kke2PBf-TpaSvzguJVQq_JFJ6o",
  authDomain: "sectorfmuser.firebaseapp.com",
  projectId: "sectorfmuser",
  storageBucket: "sectorfmuser.firebasestorage.app",
  messagingSenderId: "403087972818",
  appId: "1:403087972818:web:ddce221525eee12eead00b"
};
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Your Stripe Price ID:
// Optional portal defaults
const PORTAL_CONFIGURATION_ID = undefined; // e.g. "bpc_123..." if you have a custom config
const PORTAL_LOCALE = "auto";              // "auto" | "en" | "es" | ...
const PRICE_ID = "price_1SDH6P2dbL0S41mK0as9z1Uz";

// ----- Added: Manage Subscription (small self-contained block) -----
function ManageSubscription() {
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  // Ensure Stripe customer exists once after sign-in (safe to repeat)
  useEffect(() => {
    (async () => {
      try {
        if (!user) return;
        const token = await user.getIdToken();
        await fetch("/api/stripe/create-customer", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch { /* ignore if already created */ }
    })();
  }, [user]);

  // Watch for active/trialing subscription
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "customers", user.uid, "subscriptions"),
      where("status", "in", ["active", "trialing"]),
      limit(1)
    );
    return onSnapshot(q, (snap) => setSubscribed(!snap.empty), (e) => setErr(e.message));
  }, [user]);

  async function idTokenRequired() {
    const u = auth.currentUser;
    if (!u) throw new Error("Not signed in");
    return u.getIdToken();
  }

  async function startCheckout() {
    try {
      setBusy(true); setErr(null);
      const u = auth.currentUser;
      if (!u) throw new Error("Not signed in");

      // Create a checkout session doc the extension will process
      const ref = await addDoc(
        collection(db, "customers", u.uid, "checkout_sessions"),
        {
          mode: "subscription",
          price: PRICE_ID,          // your fixed price id
          quantity: 1,
          success_url: `${window.location.origin}/?checkout=success`,
          cancel_url: `${window.location.origin}/?checkout=cancelled`,
        }
      );

      // Wait for the extension to add {url} or {error} to this doc, then act
      const unsub = onSnapshot(ref, (snap) => {
        const data = snap.data();
        if (!data) return;
        if (data.error) {
          setErr(typeof data.error === "string" ? data.error : data.error.message || "Checkout failed.");
          setBusy(false);
          unsub();
          return;
        }
        if (data.url) {
          unsub();
          window.location.assign(data.url);
        }
      });
    } catch (e: any) {
      setErr(e?.message ?? String(e));
      setBusy(false);
    }
  }

  async function openBillingPortal() {
    try {
      setBusy(true); setErr(null);
      const functions = getFunctions(app, "us-central1");
      const createPortalLink = httpsCallable(
        functions,
        "ext-firestore-stripe-payments-createPortalLink"
      );

      const res = await createPortalLink({
        returnUrl: `${window.location.origin}/`,
      });

      // @ts-ignore
      const url = res?.data?.url;
      if (!url) throw new Error("No portal URL returned.");
      window.location.assign(url);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  const body = useMemo(() => {
    if (subscribed === null) return <div className="text-gray-600">Checking subscription…</div>;
    if (subscribed) {
      return (
        <>
          <p className="text-sm text-green-600 mb-2 font-akzid">Your subscription is active. Thank you for supporting Sector!</p>
          <button
            onClick={openBillingPortal}
            disabled={busy}
            className="bg-black text-white font-akzid px-4 py-2 rounded hover:bg-gray-800 disabled:opacity-60"
          >
            {busy ? "Opening…" : "Manage subscription"}
          </button>
        </>
      );
    }
    return (
      <>
        <p className="text-sm text-gray-600 mb-2 font-akzid">Become a Sector Supporter to access Live and Archived Tracklists, as well as the Sector Newsletter!
          If you aren't interested in supporting monthly, consider making a one-time <a href="https://donate.stripe.com/14A00cdV18Sx2r526b0oM00" target="_blank" rel="noreferrer" className="text-gray-600 underline">Donation.</a>
        </p>
        <button
          onClick={startCheckout}
          disabled={busy}
          className="bg-gray-600 hover:bg-blue-700 text-white font-semibold px-2 py-1 rounded disabled:opacity-60"
        >
          {busy ? "Starting checkout…" : "Subscribe"}
        </button>
      </>
    );
  }, [subscribed, busy]);

  return (
    <div className="mt-6 p-4 rounded bg-gray-100 border border-gray-300">
      <h3 className="text-lg font-semibold mb-3 text-black">Manage subscription</h3>
      {body}
      {err && <div className="mt-3 text-red-600 text-sm">{err}</div>}
    </div>
  );
}
// ----- end of small addition -----

/** Small guard component you can reuse on any protected page */
function RequireAuth({ children }: { children: React.ReactNode }) {
  // ⬇️ CHANGED: no redirect; render login inline when logged out
  const [status, setStatus] = useState<"checking" | "authed" | "guest">("checking");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setStatus(u ? "authed" : "guest");
    });
    return unsub;
  }, []);

  if (status === "checking") {
    return <div className="p-6 text-gray-600">Checking your session…</div>;
  }

  if (status === "guest") {
    return <LoginLayout />; // <-- render login component instead of redirect
  }

  return <>{children}</>;
}

export default function ProfileLayout() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");

  const handleLogout = async () => {
    setError("");
    setLoggingOut(true);
    try {
      await signOut(auth);
      // ⬇️ CHANGED: no redirect — auth listener will flip RequireAuth to show <LoginLayout/>
      // router.replace("/login");
    } catch (e: any) {
      setError(e?.message || "Failed to sign out.");
      setLoggingOut(false);
    }
  };

  return (
    <RequireAuth>
      <div className="max-w-2xl mx-auto p-4 text-black bg-white">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Your Profile</h1>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className={`px-4 py-2 rounded font-semibold ${
              loggingOut ? "bg-gray-700 cursor-not-allowed" : "bg-red-600 hover:bg-red-700"
            }`}
          >
            {loggingOut ? "Signing out…" : "Log out"}
          </button>
        </div>

        {error && <div className="text-red-600 text-sm mb-3">{error}</div>}

        <p className="pb-3 text-gray-600 font-akzid">Welcome Back! <IfSubscribed>As a Sector Supporter, you have access to Live and Archived Tracklists, as well as our newsletter. Thank you for your support!</IfSubscribed></p>

        {/* Added subscription section */}
        <FavoritesSection />
        <ManageSubscription />
      </div>
    </RequireAuth>
  );
}
