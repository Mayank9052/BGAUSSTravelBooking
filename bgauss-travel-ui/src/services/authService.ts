// src/services/authService.ts
// Connects to: AuthController.cs  →  POST /api/Auth/ms-login, GET /api/Auth/me

import { get } from "./apiClient";

export interface MeResponse {
  employeeId:   number;
  email:        string;
  displayName:  string;
  department:   string;
  employeeCode: string;
  role:         string;
  isActive:     boolean;
}

/** GET /api/Auth/me — refresh user profile from server */
export const authService = {
  me: () => get<MeResponse>("/Auth/me"),
};