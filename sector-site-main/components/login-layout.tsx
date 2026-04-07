"use client";

import React, { useEffect, useState } from "react";
import ProfileLayout from "./profile-layout";

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics, isSupported as analyticsSupported } from "firebase/analytics";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
} from "firebase/auth";

// ---- Firebase config (move to env vars in production) ----
const firebaseConfig = {
  apiKey: "AIzaSyDpJJMN5kke2PBf-TpaSvzguJVQq_JFJ6o",
  authDomain: "sectorfmuser.firebaseapp.com",
  projectId: "sectorfmuser",
  storageBucket: "sectorfmuser.firebasestorage.app",
  messagingSenderId: "403087972818",
  appId: "1:403087972818:web:ddce221525eee12eead00b",
};

// ---- Initialize once, even during hot reload ----
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

// Optional: safely init Analytics only in the browser and only if supported
if (typeof window !== "undefined") {
  analyticsSupported().then((ok) => {
    if (ok) getAnalytics(app);
  });
}

function parseAuthError(err: unknown): string {
  const code = (err as any)?.code || "";
  switch (code) {
    case "auth/invalid-email":
      return "That email address looks invalid.";
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "Email or password is incorrect.";
    case "auth/email-already-in-use":
      return "There’s already an account with that email.";
    case "auth/weak-password":
      return "Password is too weak (use 6+ chars).";
    case "auth/popup-blocked":
      return "Your browser blocked the sign-in popup.";
    case "auth/popup-closed-by-user":
      return "Popup closed before finishing sign-in.";
    default:
      return (err as any)?.message || "Something went wrong.";
  }
}

export default function LoginLayout() {
  // tri-state prevents UI flicker during the first auth check
  const [authState, setAuthState] = useState<"checking" | "authed" | "guest">("checking");

  const [tab, setTab] = useState<"login" | "signup">("login");

  // Login form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  // Signup form
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirm, setSignupConfirm] = useState("");
  const [signupError, setSignupError] = useState("");

  // Persist sessions and swap UI based on auth — no redirects
  useEffect(() => {
    setPersistence(auth, browserLocalPersistence).catch(() => {});
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthState(user ? "authed" : "guest");
    });
    return unsub;
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }
    setError("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged will flip to "authed" and render <ProfileLayout />
    } catch (err) {
      setError(parseAuthError(err));
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signupEmail || !signupPassword || !signupConfirm) {
      setSignupError("Please fill out all fields.");
      return;
    }
    if (signupPassword !== signupConfirm) {
      setSignupError("Passwords do not match.");
      return;
    }
    setSignupError("");
    try {
      await createUserWithEmailAndPassword(auth, signupEmail, signupPassword);
      // onAuthStateChanged will flip to "authed" and render <ProfileLayout />
    } catch (err) {
      setSignupError(parseAuthError(err));
    }
  };

  const handleGoogleSignIn = async () => {
    setError("");
    setSignupError("");
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      // onAuthStateChanged will flip to "authed" and render <ProfileLayout />
    } catch (err) {
      const msg = parseAuthError(err);
      if (tab === "login") setError(msg);
      else setSignupError(msg);
    }
  };

  // While checking the session, render nothing (or a tiny spinner if you prefer)
  if (authState === "checking") return null;

  // If authed, show the profile (no route change)
  if (authState === "authed") {
    return <ProfileLayout />;
  }

  // Otherwise (guest / logged-out / unauthorized), show the login/signup UI
  return (
    <div className="bg-white p-4 max-w-sm mx-auto rounded shadow border border-gray-200">
      <div className="flex mb-6">
        <button
          className={`flex-1 py-2 font-bold rounded-t ${
            tab === "login" ? "bg-gray-100 text-black" : "bg-gray-50 text-gray-600"
          }`}
          onClick={() => setTab("login")}
        >
          Login
        </button>
        <button
          className={`flex-1 py-2 font-bold rounded-t ${
            tab === "signup" ? "bg-gray-100 text-black" : "bg-gray-50 text-gray-600"
          }`}
          onClick={() => setTab("signup")}
        >
          Sign Up
        </button>
      </div>

      {tab === "login" ? (
        <>
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <input
              type="email"
              placeholder="Email"
              className="p-2 rounded bg-gray-50 text-black border border-gray-300"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <input
              type="password"
              placeholder="Password"
              className="p-2 rounded bg-gray-50 text-black border border-gray-300"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            {error && <div className="text-red-600 text-sm">{error}</div>}
            <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded">
              Login
            </button>
          </form>

          <div className="my-4 flex items-center">
            <hr className="flex-grow border-gray-300" />
            <span className="mx-2 text-gray-600">or</span>
            <hr className="flex-grow border-gray-300" />
          </div>

          <button
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-2 bg-white text-black font-bold py-2 rounded hover:bg-gray-200"
          >
            {/* Google "G" */}
            <svg width="20" height="20" viewBox="0 0 48 48" className="inline-block" aria-hidden>
              <g>
                <path fill="#4285F4" d="M44.5 20H24v8.5h11.7C34.7 33.1 29.8 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.3 6.5 29.4 4.5 24 4.5 12.7 4.5 3.5 13.7 3.5 25S12.7 45.5 24 45.5c10.5 0 19.2-7.6 19.2-19.2 0-1.3-.1-2.3-.3-3.3z"/>
                <path fill="#34A853" d="M6.3 14.7l7 5.1C15.3 17.1 19.3 14.5 24 14.5c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.3 6.5 29.4 4.5 24 4.5c-7.1 0-13.1 4.1-16.2 10.2z"/>
                <path fill="#FBBC05" d="M24 45.5c5.8 0 10.7-1.9 14.2-5.2l-6.6-5.4c-2 1.4-4.6 2.3-7.6 2.3-5.7 0-10.6-3.9-12.3-9.1l-7 5.4C7 41.1 14.1 45.5 24 45.5z"/>
                <path fill="#EA4335" d="M44.5 20H24v8.5h11.7c-1.1 3.1-4.1 5.5-7.7 5.5-2.2 0-4.2-.7-5.7-2l-7 5.4C18.1 41.1 24 45.5 24 45.5c10.5 0 19.2-7.6 19.2-19.2 0-1.3-.1-2.3-.3-3.3z"/>
              </g>
            </svg>
            Sign in with Google
          </button>
        </>
      ) : (
        <>
          <form onSubmit={handleSignup} className="flex flex-col gap-4">
            <input
              id="emailSignUpForm"
              type="email"
              placeholder="Email"
              className="p-2 rounded bg-gray-50 text-black border border-gray-300"
              value={signupEmail}
              onChange={(e) => setSignupEmail(e.target.value)}
              required
              autoComplete="email"
            />
            
            <input
              id="passwordSignUpForm"
              type="password"
              placeholder="Password"
              className="p-2 rounded bg-gray-50 text-black border border-gray-300"
              value={signupPassword}
              onChange={(e) => setSignupPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
            <input
              type="password"
              placeholder="Confirm Password"
              className="p-2 rounded bg-gray-50 text-black border border-gray-300"
              value={signupConfirm}
              onChange={(e) => setSignupConfirm(e.target.value)}
              required
              autoComplete="new-password"
            />
            {signupError && <div className="text-red-600 text-sm">{signupError}</div>}
            <button id="signUpButton" type="submit" className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 rounded">
              Sign Up
            </button>
          </form>

          <div className="my-4 flex items-center">
            <hr className="flex-grow border-gray-300" />
            <span className="mx-2 text-gray-600">or</span>
            <hr className="flex-grow border-gray-300" />
          </div>

          <button
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-2 bg-white text-black font-bold py-2 rounded hover:bg-gray-200"
          >
            {/* Same Google SVG as above */}
            <svg width="20" height="20" viewBox="0 0 48 48" className="inline-block" aria-hidden>
              <g>
                <path fill="#4285F4" d="M44.5 20H24v8.5h11.7C34.7 33.1 29.8 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.3 6.5 29.4 4.5 24 4.5c-7.1 0-13.1 4.1-16.2 10.2z"/>
                <path fill="#34A853" d="M24 45.5c5.8 0 10.7-1.9 14.2-5.2l-6.6-5.4c-2 1.4-4.6 2.3-7.6 2.3-5.7 0-10.6-3.9-12.3-9.1l-7 5.4C7 41.1 14.1 45.5 24 45.5z"/>
                <path fill="#FBBC05" d="M6.3 14.7l7 5.1C15.3 17.1 19.3 14.5 24 14.5c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.3 6.5 29.4 4.5 24 4.5c-7.1 0-13.1 4.1-16.2 10.2z"/>
                <path fill="#EA4335" d="M44.5 20H24v8.5h11.7c-1.1 3.1-4.1 5.5-7.7 5.5-2.2 0-4.2-.7-5.7-2l-7 5.4C18.1 41.1 24 45.5 24 45.5c10.5 0 19.2-7.6 19.2-19.2 0-1.3-.1-2.3-.3-3.3z"/>
              </g>
            </svg>
            Sign up with Google
          </button>
        </>
      )}
    </div>
  );
}