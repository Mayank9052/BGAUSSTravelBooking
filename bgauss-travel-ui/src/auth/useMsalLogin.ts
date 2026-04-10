// src/auth/useMsalLogin.ts

import { useState, useEffect, useCallback } from "react";
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
  isInitializing: boolean;  // ✅ in interface
  error:          string | null;
  user:           MsUser | null;
}

const APP_SESSION_KEYS = [
  "jwt_token",
  "employee_id",
  "full_name",
  "email",
  "role",
  "employee_code",
  "department",
  "designation",
  "reporting_manager",
  "contact_number",
] as const;

function clearAppSession(): void {
  APP_SESSION_KEYS.forEach((key) => localStorage.removeItem(key));
}

export function useMsalLogin(
  onSuccess?: (user: MsUser) => void
): UseMsalLoginReturn {
  // ✅ ALL useState calls must be INSIDE the hook function
  const [loading,        setLoading]        = useState(false);
  const [msalReady,      setMsalReady]      = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);  // ✅ moved inside
  const [error,          setError]          = useState<string | null>(null);
  const [user,           setUser]           = useState<MsUser | null>(null);

  const completeLogin = useCallback(async (
    result: AuthenticationResult
  ): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const msToken = result.accessToken;

      const graphRes = await fetch(
        "https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName,department,employeeId,jobTitle,mobilePhone,businessPhones",
        { headers: { Authorization: `Bearer ${msToken}` } }
      );

      if (!graphRes.ok)
        throw new Error(`Microsoft Graph error: ${graphRes.status}`);

      const profile = await graphRes.json();

      const email = (profile.mail ?? profile.userPrincipalName ?? "").toLowerCase().trim();
      if (!email) throw new Error("Email not found");

      const displayName    = profile.displayName ?? email;
      const department     = profile.department ?? "";
      const employeeId     = profile.employeeId ?? "";
      const employeeCode   = (profile.employeeId ?? email.split("@")[0]).toUpperCase();
      const designation    = profile.jobTitle ?? "";
      const contactNumber  = profile.mobilePhone ?? "";

      const apiRes = await fetch("https://localhost:7136/api/Auth/ms-login", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, displayName, employeeId: employeeId, department }),
      });

      if (!apiRes.ok) {
        const err = await apiRes.json();
        throw new Error(err.message ?? "API error");
      }

      const apiData: MsLoginApiResponse = await apiRes.json();

      localStorage.setItem("jwt_token",      apiData.token);
      localStorage.setItem("employee_id",    String(apiData.employeeId));
      localStorage.setItem("full_name",      apiData.displayName);
      localStorage.setItem("email",          apiData.email);
      localStorage.setItem("role",           apiData.role);
      localStorage.setItem("employee_code",  apiData.employeeCode);
      localStorage.setItem("department",     apiData.department ?? "");

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
      onSuccess?.(msUser);

    } catch (err: any) {
      console.error("❌ Login failed", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [onSuccess]);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const result = await msalInstance.handleRedirectPromise();
        if (cancelled) return;

        if (result?.account) {
          msalInstance.setActiveAccount(result.account);
          await completeLogin(result);
        }

        setMsalReady(true);
      } catch (err: any) {
        console.error("❌ MSAL error", err);
        setError(err.message);
        setMsalReady(true);
      } finally {
        if (!cancelled) setIsInitializing(false);  // ✅ unblocks PrivateRoute
      }
    };

    void init();
    return () => { cancelled = true; };
  }, [completeLogin]);

  const signIn = useCallback(() => {
    if (!msalReady) return;
    setError(null);
    setLoading(true);
    setUser(null);
    clearAppSession();

    msalInstance.loginRedirect({
      ...graphScopes,
      prompt: "login",
    }).catch((err) => {
      console.error(err);
      setError(err.message);
      setLoading(false);
    });
  }, [msalReady]);

  const signOut = useCallback(async () => {
    clearAppSession();
    setUser(null);
    window.location.replace("/login");
  }, []);

  return { signIn, signOut, loading, msalReady, isInitializing, error, user };
}