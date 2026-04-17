// src/services/expenseService.ts
// Added: getMy() needed by TripExpensePanel in DashboardPage
// Bill helpers use BillViewer component for actual display

import { get, post, put, uploadFile } from "./apiClient";
import type { ExpenseClaimResponse, ExpenseSummaryResponse, PagedResult } from "./apiClient";

export interface CreateExpenseInput {
  requestId:    number;
  category:     string;
  amount:       number;
  currency:     string;
  expenseDate:  string;   // "yyyy-MM-dd"
  description?: string;
}

export interface ApprovalInput {
  action:    string;   // "approve" | "reject"
  comments?: string;
}

export const expenseService = {
  summary: () =>
    get<ExpenseSummaryResponse>("/Expense/summary"),

  // ── GET /api/Expense/my — employee's own claims ──────────────────────────
  getMy: (status?: string) => {
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";
    return get<ExpenseClaimResponse[]>(`/Expense/my${qs}`);
  },

  getAll: (status?: string, page = 1, pageSize = 20) => {
    const qs = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (status) qs.set("status", status);
    return get<PagedResult<ExpenseClaimResponse>>(`/Expense?${qs}`);
  },

  getById: (id: number) =>
    get<ExpenseClaimResponse>(`/Expense/${id}`),

  create: (dto: CreateExpenseInput) =>
    post<{ claimId: number; claimCode: string }>("/Expense", dto),

  uploadBill: (claimId: number, file: File) =>
    uploadFile<{ claimId: number; billPath: string; billFileName: string }>(
      `/Expense/${claimId}/upload-bill`, file
    ),

  approve: (id: number, dto: ApprovalInput) =>
    put<{ claimId: number; status: string }>(`/Expense/${id}/approve`, dto),

  reimburse: (id: number) =>
    put<{ claimId: number; status: string; reimbursedAt: string }>(`/Expense/${id}/reimburse`),

  // ── Bill URL helpers ───────────────────────────────────────────────────────
  getBillUrl: (billPath: string | null): string | null => {
    if (!billPath) return null;
    return billPath.startsWith("http")
      ? billPath
      : `${window.location.origin}${billPath}`;
  },

  isImage: (billPath: string | null) =>
    !!billPath && /\.(jpg|jpeg|png|webp)$/i.test(billPath),

  isPdf: (billPath: string | null) =>
    !!billPath && /\.pdf$/i.test(billPath),
};