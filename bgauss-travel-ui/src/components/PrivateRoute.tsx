// src/components/PrivateRoute.tsx
// FIX: Do NOT call useMsalLogin() here.
// Calling useMsalLogin inside PrivateRoute creates a SECOND MSAL instance
// that runs handleRedirectPromise() again — it finds no result, sets
// isInitializing=false with no token, and redirects to /login.
//
// The correct approach: PrivateRoute only checks localStorage for the JWT.
// MSAL redirect handling is done ONCE in main.tsx (msalInstance.initialize())
// and ONCE in LoginPage (via useMsalLogin hook).

import { Navigate } from "react-router-dom";

interface PrivateRouteProps {
  children: React.ReactNode;
}

export default function PrivateRoute({ children }: PrivateRouteProps) {
  const token = localStorage.getItem("jwt_token");

  // No token → send to login
  if (!token) {
    return <Navigate to="/login" replace />;
  }

  // Token exists → render the protected page
  return <>{children}</>;
}