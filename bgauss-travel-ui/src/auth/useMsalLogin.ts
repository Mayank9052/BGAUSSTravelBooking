// src/auth/useMsalLogin.ts
// Uses loginRedirect (not loginPopup) — required for SPA redirect flow
// Handles the redirect result on page load via handleRedirectPromise()

import { useState, useEffect, useCallback } from "react";
import {
  type AuthenticationResult,
} from "@azure/msal-browser";
import { msalInstance, graphScopes } from "./msalConfig";

export interface MsUser {
  email:        string;
  displayName:  string;
  employeeCode: string;
  department:   string;
  role:         string;
  employeeId:   number;
  token:        string;
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
  signIn:    () => void;
  signOut:   () => Promise<void>;
  loading:   boolean;
  msalReady: boolean;
  error:     string | null;
  user:      MsUser | null;
}

const APP_SESSION_KEYS = [
  "jwt_token",
  "employee_id",
  "full_name",
  "email",
  "role",
  "employee_code",
  "department",
] as const;

function clearAppSession(): void {
  APP_SESSION_KEYS.forEach((key) => localStorage.removeItem(key));
}

export function useMsalLogin(
  onSuccess?: (user: MsUser) => void
): UseMsalLoginReturn {
  const [loading,   setLoading]   = useState(false);
  const [msalReady, setMsalReady] = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [user,      setUser]      = useState<MsUser | null>(null);

  // Called after MSAL redirect returns with a token
  const completeLogin = useCallback(async (
    result: AuthenticationResult
  ): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const msToken = result.accessToken;

      // Fetch full profile from Microsoft Graph
      const graphRes = await fetch(
        "https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName,department,employeeId",
        { headers: { Authorization: `Bearer ${msToken}` } }
      );

      if (!graphRes.ok)
        throw new Error(`Microsoft Graph error: ${graphRes.status}`);

      const profile = await graphRes.json() as Record<string, string | null | undefined>;

      const email       = (profile["mail"] ?? profile["userPrincipalName"] ?? "").toLowerCase().trim();
      const displayName = profile["displayName"] ?? email;
      const department  = profile["department"]  ?? "";
      const employeeCode= (profile["employeeId"] ?? email.split("@")[0]).toUpperCase();

      if (!email) throw new Error("Could not read email from Microsoft account.");

      // Exchange with BGauss Travel API for our own JWT
      const apiRes = await fetch("/api/Auth/ms-login", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          displayName,
          employeeId: employeeCode,
          department,
          msToken,
        }),
      });

      if (!apiRes.ok) {
        const errBody = await apiRes.json() as { message?: string };
        throw new Error(errBody.message ?? `API error: ${apiRes.status}`);
      }

      const apiData = await apiRes.json() as MsLoginApiResponse;

      // Persist session
      localStorage.setItem("jwt_token",     apiData.token);
      localStorage.setItem("employee_id",   String(apiData.employeeId));
      localStorage.setItem("full_name",     apiData.displayName);
      localStorage.setItem("email",         apiData.email);
      localStorage.setItem("role",          apiData.role);
      localStorage.setItem("employee_code", apiData.employeeCode);
      localStorage.setItem("department",    apiData.department ?? "");

      const msUser: MsUser = {
        email:        apiData.email,
        displayName:  apiData.displayName,
        employeeCode: apiData.employeeCode,
        department:   apiData.department,
        role:         apiData.role,
        employeeId:   apiData.employeeId,
        token:        apiData.token,
      };

      setUser(msUser);
      setError(null);
      onSuccess?.(msUser);

    } catch (e: unknown) {
      const err = e as Error;
      setError(err.message ?? "Sign-in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [onSuccess]);

  // ── Initialize MSAL and handle redirect on page load ──────
  useEffect(() => {
    let cancelled = false;

    const init = async (): Promise<void> => {
      try {
        // MUST initialize before any other MSAL call
        await msalInstance.initialize();

        // Handle the redirect result (fires after MS redirects back to app)
        const result: AuthenticationResult | null =
          await msalInstance.handleRedirectPromise();

        if (cancelled) return;

        if (result?.account) {
          // We just came back from a successful redirect login
          msalInstance.setActiveAccount(result.account);
          await completeLogin(result);
        } else {
          // Keep the login page visible until the user explicitly signs in.
          setUser(null);
        }

        if (!cancelled) setMsalReady(true);

      } catch (e: unknown) {
        if (!cancelled) {
          const err = e as Error;
          // Show a friendlier message — the raw MSAL error is too technical
          const msg = err.message ?? "";
          if (msg.includes("AADSTS9002326")) {
            setError(
              "Azure app configuration error: the redirect URI must be registered " +
              "under 'Single-Page Application' platform in Azure Portal → " +
              "App registrations → Authentication. It is currently registered " +
              "under 'Web'. Please fix this in Azure Portal and try again."
            );
          } else {
            setError("Auth initialisation failed: " + msg);
          }
          setMsalReady(true); // allow button to show even if init failed
        }
      }
    };

    void init();
    return () => { cancelled = true; };
  }, [completeLogin, onSuccess]);

  // ── Sign in ────────────────────────────────────────────────
  // Uses loginRedirect — the SPA flow. After Microsoft authenticates the user,
  // they are redirected back to redirectUri and handleRedirectPromise() fires.
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
      const err = e as Error;
      setError(err.message ?? "Sign-in failed.");
      setLoading(false);
    });
  }, [msalReady]);

  const signOut = useCallback(async (): Promise<void> => {
    try {
      clearAppSession();
      setUser(null);
      setError(null);
      msalInstance.setActiveAccount(null);
    } catch (e: unknown) {
      console.error("Sign-out failed", e);
    } finally {
      window.location.replace("/login");
    }
  }, []);

  return { signIn, signOut, loading, msalReady, error, user };
}
