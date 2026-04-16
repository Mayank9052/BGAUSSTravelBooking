// src/auth/useMsalLogin.ts
// KEY FIXES:
//  1. Removed msalInstance.initialize() from useEffect — main.tsx already calls it.
//     Calling initialize() twice causes MSAL to reset state and lose the redirect result.
//  2. onSuccess wrapped in useRef so completeLogin doesn't re-create on every render,
//     preventing the useEffect from re-running and calling handleRedirectPromise() twice.
//  3. API call uses relative /api/Auth/ms-login (works in dev via Vite proxy + production IIS).

import { useState, useEffect, useCallback, useRef } from "react";
import { type AuthenticationResult } from "@azure/msal-browser";
import { msalInstance, graphScopes } from "./msalConfig";

export interface MsUser {
  email:             string;
  displayName:       string;
  employeeCode:      string;
  department:        string;
  designation?:      string;
  reportingManager?: string;
  contactNumber?:    string;
  role:              string;
  employeeId:        number;
  token:             string;
}

interface MsLoginApiResponse {
  token:        string;
  employeeId:   number;
  email:        string;
  displayName:  string;
  employeeCode: string;
  department:   string;
  role:         string;
}

export interface UseMsalLoginReturn {
  signIn:         () => void;
  signOut:        () => Promise<void>;
  loading:        boolean;
  msalReady:      boolean;
  isInitializing: boolean;
  error:          string | null;
  user:           MsUser | null;
}

const APP_SESSION_KEYS = [
  "jwt_token", "employee_id", "full_name", "email", "role",
  "employee_code", "department", "designation", "reporting_manager", "contact_number",
] as const;

function clearAppSession(): void {
  APP_SESSION_KEYS.forEach((key) => localStorage.removeItem(key));
}

export function useMsalLogin(onSuccess?: (user: MsUser) => void): UseMsalLoginReturn {
  const [loading,        setLoading]        = useState(false);
  const [msalReady,      setMsalReady]      = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [error,          setError]          = useState<string | null>(null);
  const [user,           setUser]           = useState<MsUser | null>(null);

  // Keep onSuccess in a ref so completeLogin doesn't change identity
  // when the parent re-renders (which would cause the useEffect to re-run)
  const onSuccessRef = useRef(onSuccess);
  useEffect(() => { onSuccessRef.current = onSuccess; }, [onSuccess]);

  const completeLogin = useCallback(async (result: AuthenticationResult): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const msToken = result.accessToken;

      // Fetch user profile from Microsoft Graph
      const graphRes = await fetch(
        "https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName,department,employeeId,jobTitle,mobilePhone,businessPhones",
        { headers: { Authorization: `Bearer ${msToken}` } }
      );
      if (!graphRes.ok) throw new Error(`Microsoft Graph error: ${graphRes.status}`);

      const profile = await graphRes.json() as {
        displayName?: string;
        mail?: string;
        userPrincipalName?: string;
        department?: string;
        employeeId?: string;
        jobTitle?: string;
        mobilePhone?: string;
      };

      const email        = (profile.mail ?? profile.userPrincipalName ?? "").toLowerCase().trim();
      if (!email)        throw new Error("Email not found in Microsoft account.");

      const displayName   = profile.displayName ?? email;
      const department    = profile.department ?? "";
      const employeeCode  = (profile.employeeId ?? email.split("@")[0]).toUpperCase();
      const designation   = profile.jobTitle ?? "";
      const contactNumber = profile.mobilePhone ?? "";

      // ✅ RELATIVE URL — Vite proxies /api → backend in dev
      //                   IIS serves /api directly in production
      const apiRes = await fetch("/api/Auth/ms-login", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          displayName,
          employeeId: employeeCode,
          department,
        }),
      });

      if (!apiRes.ok) {
        const errBody = await apiRes.json().catch(() => ({ message: `HTTP ${apiRes.status}` })) as { message?: string };
        throw new Error(errBody.message ?? `API error: ${apiRes.status}`);
      }

      const apiData = await apiRes.json() as MsLoginApiResponse;

      // Persist to localStorage
      localStorage.setItem("jwt_token",      apiData.token);
      localStorage.setItem("employee_id",    String(apiData.employeeId));
      localStorage.setItem("full_name",      apiData.displayName);
      localStorage.setItem("email",          apiData.email);
      localStorage.setItem("role",           apiData.role);
      localStorage.setItem("employee_code",  apiData.employeeCode);
      localStorage.setItem("department",     apiData.department ?? "");
      localStorage.setItem("designation",    designation);
      localStorage.setItem("contact_number", contactNumber);

      const msUser: MsUser = {
        email:        apiData.email,
        displayName:  apiData.displayName,
        employeeCode: apiData.employeeCode,
        department:   apiData.department,
        designation,
        contactNumber,
        role:         apiData.role,
        employeeId:   apiData.employeeId,
        token:        apiData.token,
      };

      setUser(msUser);
      setError(null);
      onSuccessRef.current?.(msUser);

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Sign-in failed. Please try again.";
      setError(msg);
      console.error("❌ Login failed:", msg);
    } finally {
      setLoading(false);
    }
  }, []); // ← no dependencies: onSuccess is via ref, msalInstance is module-level singleton

  // ── One-time MSAL redirect handler ──────────────────────────────────────────
  // main.tsx already called msalInstance.initialize() before mounting React.
  // We only need to handle the redirect result here — DO NOT call initialize() again.
  useEffect(() => {
    let cancelled = false;

    const handleRedirect = async () => {
      try {
        // Pick up the token if the user just came back from Microsoft login
        const result = await msalInstance.handleRedirectPromise();

        if (cancelled) return;

        if (result?.account) {
          msalInstance.setActiveAccount(result.account);
          await completeLogin(result);
        }

        if (!cancelled) setMsalReady(true);
      } catch (e: unknown) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : "Auth initialization failed.";
          setError(msg);
          setMsalReady(true);
          console.error("❌ MSAL redirect error:", msg);
        }
      } finally {
        if (!cancelled) setIsInitializing(false);
      }
    };

    void handleRedirect();
    return () => { cancelled = true; };
  }, [completeLogin]); // completeLogin is stable (no deps)

  const signIn = useCallback((): void => {
    if (!msalReady) return;
    setError(null);
    setLoading(true);
    setUser(null);
    clearAppSession();

    void msalInstance.loginRedirect({
      ...graphScopes,
      prompt: "login",
    }).catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : "Sign-in redirect failed.";
      setError(msg);
      setLoading(false);
    });
  }, [msalReady]);

  const signOut = useCallback(async (): Promise<void> => {
    clearAppSession();
    setUser(null);
    msalInstance.setActiveAccount(null);
    // Replace history so back button doesn't return to a protected page
    window.location.replace("/login");
  }, []);

  return { signIn, signOut, loading, msalReady, isInitializing, error, user };
}