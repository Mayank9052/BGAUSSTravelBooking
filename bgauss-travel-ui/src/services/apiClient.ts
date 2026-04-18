// src/services/apiClient.ts

const BASE = import.meta.env.VITE_API_BASE_URL || "/api";

// ─────────────────────────────────────────────────────────────
// Token
// ─────────────────────────────────────────────────────────────

function getToken(): string | null {
  return localStorage.getItem("jwt_token");
}

function authHeaders(): HeadersInit {
  const token = getToken();

  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// ─────────────────────────────────────────────────────────────
// Error Class
// ─────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = localStorage.getItem("jwt_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => `HTTP ${res.status}`);
    throw new ApiError(res.status, msg || `HTTP ${res.status}`);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

export async function uploadFile<T>(path: string, file: File): Promise<T> {
  const token = localStorage.getItem("jwt_token");
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => `HTTP ${res.status}`);
    throw new ApiError(res.status, msg || `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export const get  = <T>(path: string)                     => request<T>("GET",    path);
export const post = <T>(path: string, body: unknown)      => request<T>("POST",   path, body);
export const put  = <T>(path: string, body?: unknown)     => request<T>("PUT",    path, body);
export const del  = <T>(path: string)                     => request<T>("DELETE", path);

// ── Response Types ────────────────────────────────────────────────────────────

export interface TravelRequestResponse {
  requestId:      number;
  requestCode:    string;
  employeeId:     number;
  employeeName:   string;
  employeeCode?:  string;
  /** Snapshotted from TravelEmployee.Department at request creation */
  department:     string;
  transportType:  string;
  destination:    string;
  travelPurpose:  string;
  departureDate:  string;
  returnDate:     string;
  estimatedAmount?: number;
  notes?:         string;
  status:         string;
  originLatitude?:  number;
  originLongitude?: number;
  originAddress?:   string;
  locationCapturedAt?: string;
  createdAt:      string;
}

export interface ExpenseClaimResponse {
  claimId:       number;
  claimCode:     string;
  requestId:     number;
  employeeId:    number;
  employeeName:  string;
  category:      string;
  amount:        number;
  currency:      string;
  expenseDate:   string;
  description?:  string;
  billPath:     string | null;
  billFileName: string | null;
  status:        string;
  approvedBy?:   number;
  approvedAt?:   string;
  rejectionReason?: string;
  reimbursedAt?: string;
  createdAt:     string;
}

export interface ExpenseSummaryResponse {
  totalClaims:      number;
  pendingCount:     number;
  approvedCount:    number;
  rejectedCount:    number;
  reimbursedCount:  number;
  totalPending:     number;
  totalApproved:    number;
  totalReimbursed:  number;
}

export interface NotificationResponse {
  notificationId: number;
  title:          string;
  message:        string;
  type?:          string;
  requestId?:     number;
  isRead:         boolean;
  createdAt:      string;
}

export interface ApprovalResponse {
  approvalId:   number;
  requestId:    number;
  approverName: string;
  action:       string;
  comments?:    string;
  actionAt:     string;
}

export interface DashboardSummaryResponse {
  totalRequests:    number;
  pendingRequests:  number;
  approvedRequests: number;
  rejectedRequests: number;
  totalExpenses:    number;
  pendingExpenses:  number;
  approvedExpenses: number;
  totalEmployees:   number;
}

export interface PagedResult<T> {
  total: number;
  items: T[];
}