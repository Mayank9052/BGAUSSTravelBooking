import { Navigate } from "react-router-dom";

export default function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem("jwt_token");
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}