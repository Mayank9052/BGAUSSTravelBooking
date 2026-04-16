// src/auth/msalConfig.ts
// FIXED: removed navigateToLoginRequestUrl (not a valid MSAL browser property)
// FIXED: redirectUri matches the SPA platform URI in Azure portal

import type { Configuration } from "@azure/msal-browser";
import {
  LogLevel,
  PublicClientApplication,
  BrowserCacheLocation,
} from "@azure/msal-browser";

export const TRAVEL_CLIENT_ID = "e4297c31-b71a-40af-bb82-0385bcc67701";
export const TENANT_ID        = "a265301a-63b1-4aec-9d47-273b49c178b4";

export const msalConfig: Configuration = {
  auth: {
    clientId:              TRAVEL_CLIENT_ID,
    authority:             `https://login.microsoftonline.com/${TENANT_ID}`,
    // ✅ This MUST be registered under "Single-Page Application" platform
    // in Azure Portal → Authentication, NOT under "Web" platform
    //redirectUri:           "http://localhost:5173",
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
    //postLogoutRedirectUri: "http://localhost:5173/login",
  },
  cache: {
    // SessionStorage is correct for SPA
    cacheLocation: BrowserCacheLocation.SessionStorage,
    //storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return;
        if (level === LogLevel.Error)   console.error("[MSAL]", message);
        if (level === LogLevel.Warning) console.warn("[MSAL]", message);
      },
      logLevel: LogLevel.Warning,
    },
  },
};

// Graph API scopes — only what we actually need
export const graphScopes = {
  scopes: ["User.Read", "profile", "openid", "email"],
};

// ✅ Single shared instance — created once, used everywhere
export const msalInstance = new PublicClientApplication(msalConfig);