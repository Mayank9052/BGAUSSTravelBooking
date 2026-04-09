import { Navigate } from "react-router-dom";
import { useMsalLogin } from "../auth/useMsalLogin";

export default function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isInitializing } = useMsalLogin();
  const token = localStorage.getItem("jwt_token");

  // ← WAIT: MSAL is still processing the redirect — render nothing
  if (isInitializing) return null;

  return token ? <>{children}</> : <Navigate to="/login" replace />;
}