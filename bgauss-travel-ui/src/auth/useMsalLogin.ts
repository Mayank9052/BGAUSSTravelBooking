// src/auth/useMsalLogin.ts
// ADDED: 24-hour session expiry
//   On login, saves login_time to localStorage.
//   On every app load, checks if 24h have passed → auto logs out if expired.

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

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

const APP_SESSION_KEYS = [
  "jwt_token", "employee_id", "full_name", "email", "role",
  "employee_code", "department", "designation", "reporting_manager",
  "contact_number", "login_time",
] as const;

function clearAppSession(): void {
  APP_SESSION_KEYS.forEach((key) => localStorage.removeItem(key));
}

/** Returns true if the stored session is older than 24 hours */
function isSessionExpired(): boolean {
  const loginTime = localStorage.getItem("login_time");
  if (!loginTime) return false; // no session at all — let normal flow handle it
  const elapsed = Date.now() - Number(loginTime);
  return elapsed > SESSION_DURATION_MS;
}

export function useMsalLogin(onSuccess?: (user: MsUser) => void): UseMsalLoginReturn {
  const [loading,        setLoading]        = useState(false);
  const [msalReady,      setMsalReady]      = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [error,          setError]          = useState<string | null>(null);
  const [user,           setUser]           = useState<MsUser | null>(null);

  const onSuccessRef = useRef(onSuccess);
  useEffect(() => { onSuccessRef.current = onSuccess; }, [onSuccess]);

  const completeLogin = useCallback(async (result: AuthenticationResult): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const msToken = result.accessToken;

      const graphRes = await fetch(
        "https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName,department,employeeId,jobTitle,mobilePhone,businessPhones",
        { headers: { Authorization: `Bearer ${msToken}` } }
      );
      if (!graphRes.ok) throw new Error(`Microsoft Graph error: ${graphRes.status}`);

      const profile = await graphRes.json() as {
        displayName?: string; mail?: string; userPrincipalName?: string;
        department?: string; employeeId?: string; jobTitle?: string;
        mobilePhone?: string;
      };

      const email        = (profile.mail ?? profile.userPrincipalName ?? "").toLowerCase().trim();
      if (!email)        throw new Error("Email not found in Microsoft account.");

      const displayName   = profile.displayName ?? email;
      const department    = profile.department ?? "";
      const employeeCode  = (profile.employeeId ?? email.split("@")[0]).toUpperCase();
      const designation   = profile.jobTitle ?? "";
      const contactNumber = profile.mobilePhone ?? "";

      const apiRes = await fetch("/api/Auth/ms-login", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, displayName, employeeId: employeeCode, department }),
      });

      if (!apiRes.ok) {
        const errBody = await apiRes.json().catch(() => ({ message: `HTTP ${apiRes.status}` })) as { message?: string };
        throw new Error(errBody.message ?? `API error: ${apiRes.status}`);
      }

      const apiData = await apiRes.json() as MsLoginApiResponse;

      // Persist session including login timestamp for 24h expiry
      localStorage.setItem("jwt_token",      apiData.token);
      localStorage.setItem("employee_id",    String(apiData.employeeId));
      localStorage.setItem("full_name",      apiData.displayName);
      localStorage.setItem("email",          apiData.email);
      localStorage.setItem("role",           apiData.role);
      localStorage.setItem("employee_code",  apiData.employeeCode);
      localStorage.setItem("department",     apiData.department ?? "");
      localStorage.setItem("designation",    designation);
      localStorage.setItem("contact_number", contactNumber);
      localStorage.setItem("login_time",     String(Date.now())); // ← 24h expiry anchor

      const msUser: MsUser = {
        email: apiData.email, displayName: apiData.displayName,
        employeeCode: apiData.employeeCode, department: apiData.department,
        designation, contactNumber,
        role: apiData.role, employeeId: apiData.employeeId, token: apiData.token,
      };

      setUser(msUser);
      setError(null);
      onSuccessRef.current?.(msUser);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Sign-in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  // ── One-time redirect handler + session expiry check ─────────────────────
  useEffect(() => {
    let cancelled = false;

    const handleRedirect = async () => {
      try {
        // ── 24h expiry check ───────────────────────────────────────────────
        if (isSessionExpired()) {
          clearAppSession();
          msalInstance.setActiveAccount(null);
          // Don't redirect here — let PrivateRoute handle it
        }

        const result = await msalInstance.handleRedirectPromise();
        if (cancelled) return;

        if (result?.account) {
          msalInstance.setActiveAccount(result.account);
          await completeLogin(result);
        }

        if (!cancelled) setMsalReady(true);
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Auth initialization failed.");
          setMsalReady(true);
        }
      } finally {
        if (!cancelled) setIsInitializing(false);
      }
    };

    void handleRedirect();
    return () => { cancelled = true; };
  }, [completeLogin]);

  // ── Periodic 24h expiry check (runs every 5 minutes while page is open) ──
  useEffect(() => {
    const check = () => {
      if (isSessionExpired() && localStorage.getItem("jwt_token")) {
        clearAppSession();
        msalInstance.setActiveAccount(null);
        window.location.replace("/login");
      }
    };
    const interval = setInterval(check, 5 * 60 * 1000); // every 5 min
    return () => clearInterval(interval);
  }, []);

  const signIn = useCallback((): void => {
    if (!msalReady) return;
    setError(null);
    setLoading(true);
    setUser(null);
    clearAppSession();
    void msalInstance.loginRedirect({ ...graphScopes, prompt: "login" })
      .catch((e: unknown) => { setError(e instanceof Error ? e.message : "Sign-in failed."); setLoading(false); });
  }, [msalReady]);

  const signOut = useCallback(async (): Promise<void> => {
    clearAppSession();
    setUser(null);
    msalInstance.setActiveAccount(null);
    window.location.replace("/login");
  }, []);

  return { signIn, signOut, loading, msalReady, isInitializing, error, user };
}