// src/services/expenseService.ts
// Connects to: ExpenseController.cs
//   GET  /api/Expense/summary
//   GET  /api/Expense/my
//   GET  /api/Expense            (Admin/HR)
//   GET  /api/Expense/{id}
//   POST /api/Expense
//   POST /api/Expense/{id}/upload-bill
//   PUT  /api/Expense/{id}/approve
//   PUT  /api/Expense/{id}/reimburse

import { get, post, put, uploadFile } from "./apiClient";
import type { ExpenseClaimResponse, ExpenseSummaryResponse, PagedResult } from "./apiClient";

export interface CreateExpenseInput {
  requestId:   number;
  category:    string;   // Flight | Train | Cab | Hotel | Meal | Miscellaneous
  amount:      number;
  currency:    string;   // default "INR"
  expenseDate: string;   // "yyyy-MM-dd"
  description?: string;
}

export interface ApprovalInput {
  action:    string;   // "approve" | "reject"  (lowercase — matches controller)
  comments?: string;
}

export const expenseService = {
  /** DashboardPage stat cards */
  summary: () =>
    get<ExpenseSummaryResponse>("/Expense/summary"),

  getMy: (status?: string) => {
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";
    return get<ExpenseClaimResponse[]>(`/Expense/my${qs}`);
  },

  // ── Bill Helpers ─────────────────────────────────────────────

getBillUrl: (billPath: string | null) => {
  if (!billPath) return null;
  return billPath.startsWith("http")
    ? billPath
    : `${window.location.origin}${billPath}`;
},

downloadBill: (billPath: string | null, fileName?: string) => {
  if (!billPath) return;

  const url = expenseService.getBillUrl(billPath);
  if (!url) return;

  const link = document.createElement("a");
  link.href = url;
  link.download = fileName || "bill";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
},

openBill: (billPath: string | null) => {
  const url = expenseService.getBillUrl(billPath);
  if (!url) return;

  window.open(url, "_blank");
},

isImage: (billPath: string | null) => {
  return !!billPath && /\.(jpg|jpeg|png|webp)$/i.test(billPath);
},

isPdf: (billPath: string | null) => {
  return !!billPath && /\.pdf$/i.test(billPath);
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

  /** Upload bill — multipart/form-data, max 10 MB */
  uploadBill: (claimId: number, file: File) =>
    uploadFile<{ claimId: number; billPath: string; billFileName: string }>(
      `/Expense/${claimId}/upload-bill`, file
    ),

  /** action: "approve" | "reject" */
  approve: (id: number, dto: ApprovalInput) =>
    put<{ claimId: number; status: string }>(`/Expense/${id}/approve`, dto),

  reimburse: (id: number) =>
    put<{ claimId: number; status: string; reimbursedAt: string }>(`/Expense/${id}/reimburse`),
};