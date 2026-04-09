// src/services/reportService.ts
// Connects to: ReportController.cs  (Admin/HR only)
//   GET /api/Report/dashboard
//   GET /api/Report/by-transport
//   GET /api/Report/by-employee
//   GET /api/Report/by-status

import { get } from "./apiClient";
import type { DashboardSummaryResponse } from "./apiClient";

export interface TransportReport {
  transport:   string;
  count:       number;
  totalAmount: number;
}

export interface EmployeeReport {
  displayName:  string;
  employeeCode: string;
  totalAmount:  number;
  claimCount:   number;
  approved:     number;
  pending:      number;
}

export interface StatusReport {
  requests: { status: string; count: number }[];
  expenses: { status: string; count: number; total: number }[];
}

export const reportService = {
  /** Admin DashboardPage top stats — same shape as DashboardSummaryDto */
  dashboard: (from?: string, to?: string) => {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to)   qs.set("to",   to);
    return get<DashboardSummaryResponse>(`/Report/dashboard?${qs}`);
  },

  byTransport: () =>
    get<TransportReport[]>("/Report/by-transport"),

  byEmployee: (from?: string, to?: string) => {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to)   qs.set("to",   to);
    return get<EmployeeReport[]>(`/Report/by-employee?${qs}`);
  },

  byStatus: () =>
    get<StatusReport>("/Report/by-status"),
};