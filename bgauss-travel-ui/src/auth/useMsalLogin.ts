// src/auth/useMsalLogin.ts
// Uses loginRedirect (not loginPopup) — required for SPA redirect flow
// Handles the redirect result on page load via handleRedirectPromise()

import { useState, useEffect, useCallback } from "react";
import {
  type AuthenticationResult,
  type AccountInfo,
  InteractionRequiredAuthError,
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
          // Check if user was already logged in from a previous session
          const accounts = msalInstance.getAllAccounts();
          if (accounts.length > 0) {
            msalInstance.setActiveAccount(accounts[0]);

            // Try to restore session from localStorage
            const savedToken = localStorage.getItem("jwt_token");
            if (savedToken) {
              const savedUser: MsUser = {
                email:        localStorage.getItem("email")         ?? "",
                displayName:  localStorage.getItem("full_name")     ?? "",
                employeeCode: localStorage.getItem("employee_code") ?? "",
                department:   localStorage.getItem("department")    ?? "",
                role:         localStorage.getItem("role")          ?? "Employee",
                employeeId:   Number(localStorage.getItem("employee_id") ?? 0),
                token:        savedToken,
              };
              setUser(savedUser);
              onSuccess?.(savedUser);
            }
          }
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

    const account: AccountInfo | null =
      msalInstance.getActiveAccount() ??
      (msalInstance.getAllAccounts()[0] ?? null);

    if (account) {
      // Already has an account — try silent token first
      setLoading(true);
      msalInstance
        .acquireTokenSilent({ ...graphScopes, account })
        .then((r) => completeLogin(r))
        .catch((e: unknown) => {
          if (e instanceof InteractionRequiredAuthError) {
            // Silent failed — need interactive redirect
            void msalInstance.loginRedirect(graphScopes);
          } else {
            const err = e as Error;
            setError(err.message ?? "Sign-in failed.");
            setLoading(false);
          }
        });
    } else {
      // No account — start fresh redirect login
      void msalInstance.loginRedirect(graphScopes);
    }
  }, [msalReady, completeLogin]);

  // ── Sign out ───────────────────────────────────────────────
  // const signOut = useCallback(async (): Promise<void> => {
  //   const account = msalInstance.getActiveAccount();
  //   localStorage.clear();
  //   sessionStorage.clear();
  //   setUser(null);
  //   setError(null);
  //   if (account) {
  //     await msalInstance.logoutRedirect({
  //       account,
  //       postLogoutRedirectUri: window.location.origin + "/login",
  //     });
  //   } else {
  //     window.location.href = "/login";
  //   }
  // }, []);

  const signOut = useCallback(async (): Promise<void> => {
  try {
    // Get active account
    const account = msalInstance.getActiveAccount();

    // Clear app session
    localStorage.clear();
    sessionStorage.clear();
    setUser(null);
    setError(null);

    // Clear MSAL active account
    if (account) msalInstance.setActiveAccount(null);

    // Redirect logout to Microsoft and back to login page
    if (account) {
      await msalInstance.logoutRedirect({
        account,
        postLogoutRedirectUri: window.location.origin + "/login",
      });
    } else {
      // fallback if no active account
      window.location.href = "/login";
    }
  } catch (e: unknown) {
    console.error("Sign-out failed", e);
    window.location.href = "/login"; // always redirect
  }
}, []);

  return { signIn, signOut, loading, msalReady, error, user };
}