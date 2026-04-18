// src/services/reportService.ts
// Updated interfaces to match the fixed ReportController responses

import { get } from "./apiClient";
import type { DashboardSummaryResponse } from "./apiClient";

export interface TransportReport {
  transport:   string;
  count:       number;
  totalAmount: number;
}

export interface EmployeeReport {
  employeeId:   number;
  displayName:  string;
  employeeCode: string;
  department:   string;   // ← now included from fixed controller
  totalAmount:  number;
  claimCount:   number;
  approved:     number;
  pending:      number;
}

export interface DepartmentReport {
  department:   string;
  requestCount: number;
  expenseTotal: number;
  approved:     number;
  pending:      number;
}

export interface StatusReport {
  requests: { status: string; count: number }[];
  expenses: { status: string; count: number; total: number }[];
}

export const reportService = {
  dashboard: (from?: string, to?: string) => {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to)   qs.set("to",   to);
    return get<DashboardSummaryResponse>(`/Report/dashboard?${qs}`);
  },

  byTransport: (from?: string, to?: string) => {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to)   qs.set("to",   to);
    return get<TransportReport[]>(`/Report/by-transport?${qs}`);
  },

  myTransport: (from?: string, to?: string) => {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to)   qs.set("to",   to);
    return get<TransportReport[]>(`/Report/my-transport?${qs}`);
  },

  byEmployee: (from?: string, to?: string) => {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to)   qs.set("to",   to);
    return get<EmployeeReport[]>(`/Report/by-employee?${qs}`);
  },

  byDepartment: (from?: string, to?: string) => {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to)   qs.set("to",   to);
    return get<DepartmentReport[]>(`/Report/by-department?${qs}`);
  },

  byStatus: () =>
    get<StatusReport>("/Report/by-status"),
};