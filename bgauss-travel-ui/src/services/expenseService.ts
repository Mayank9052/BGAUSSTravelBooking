// src/services/expenseService.ts
// FIX: resolveBillUrl now derives the origin from VITE_API_BASE_URL (the backend),
//      NOT from window.location.origin (which is Vite dev server on :5173).
//
//      Bills live in ASP.NET Core wwwroot/uploads/bills/ — served by the backend.
//      Dev:  VITE_API_BASE_URL = "http://localhost:5000/api"
//            → bill URL = "http://localhost:5000/uploads/bills/uuid.png"
//      Live: VITE_API_BASE_URL = "/api"  (same origin, nginx proxies everything)
//            → bill URL = "/uploads/bills/uuid.png"  (same origin = correct)
//
//      Add to vite.config.ts proxy if bills 404 on dev (see comment below).

import { get, post, put, uploadFile } from "./apiClient";
import type { ExpenseClaimResponse, ExpenseSummaryResponse, PagedResult } from "./apiClient";

export interface CreateExpenseInput {
  requestId:    number;
  category:     string;
  amount:       number;
  currency:     string;
  expenseDate:  string;
  description?: string;
}

export interface ApprovalInput {
  action:    string;
  comments?: string;
}

// ── Get the backend SERVER origin (not the Vite dev server origin) ────────────
// VITE_API_BASE_URL examples:
//   "http://localhost:5000/api"  → origin = "http://localhost:5000"
//   "https://35.171.187.211/api" → origin = "https://35.171.187.211"
//   "/api"                       → origin = ""  (relative, same host = live server)
function getApiOrigin(): string {
  const base = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api";
  if (base.startsWith("http://") || base.startsWith("https://")) {
    try { return new URL(base).origin; } catch { /* fall through */ }
  }
  // Relative "/api" means frontend and backend share the same origin (production).
  return "";
}

// ── Resolve a stored bill path to a full browser-accessible URL ───────────────
// billPath stored in DB:  "/uploads/bills/ae729443-xxxx.pdf"
// Returns full URL the browser can open/download directly.
export function resolveBillUrl(billPath: string | null): string | null {
  if (!billPath) return null;
  // Already a full URL — return as-is
  if (billPath.startsWith("http://") || billPath.startsWith("https://")) return billPath;
  const origin = getApiOrigin();
  const path   = billPath.startsWith("/") ? billPath : `/${billPath}`;
  return `${origin}${path}`;
}

export const expenseService = {
  summary: () =>
    get<ExpenseSummaryResponse>("/Expense/summary"),

  // requestId filters to claims for one specific travel request only
  getMy: (status?: string, requestId?: number) => {
    const qs = new URLSearchParams();
    if (status)    qs.set("status",    status);
    if (requestId) qs.set("requestId", String(requestId));
    const q = qs.toString();
    return get<ExpenseClaimResponse[]>(`/Expense/my${q ? `?${q}` : ""}`);
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

  // Convenience alias — same as the exported resolveBillUrl function
  getBillUrl: resolveBillUrl,

  isImage: (billPath: string | null) =>
    !!billPath && /\.(jpg|jpeg|png|webp)$/i.test(billPath),

  isPdf: (billPath: string | null) =>
    !!billPath && /\.pdf$/i.test(billPath),
};