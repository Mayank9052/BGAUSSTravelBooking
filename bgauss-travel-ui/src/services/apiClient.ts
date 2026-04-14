// src/services/apiClient.ts

const BASE = "/api";

function getToken(): string {
  return localStorage.getItem("jwt_token") ?? "";
}

function authHeaders(): HeadersInit {
  const token = getToken();
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: `HTTP ${res.status}` })) as { message?: string };
    throw new ApiError(body.message ?? `HTTP ${res.status}`, res.status);
  }
  return res.json() as Promise<T>;
}

export async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: "GET", headers: authHeaders() });
  return handleResponse<T>(res);
}

export async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
  return handleResponse<T>(res);
}

export async function put<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: "PUT", headers: authHeaders(), body: body !== undefined ? JSON.stringify(body) : undefined });
  return handleResponse<T>(res);
}

export async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: "DELETE", headers: authHeaders() });
  return handleResponse<T>(res);
}

export async function uploadFile<T>(path: string, file: File, fieldName = "file"): Promise<T> {
  const form = new FormData();
  form.append(fieldName, file);
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers: { Authorization: `Bearer ${getToken()}` }, body: form });
  return handleResponse<T>(res);
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TravelRequestResponse {
  requestId:        number;
  requestCode:      string;
  employeeId:       number;
  employeeName:     string;
  employeeCode:     string;
  department:       string;
  travelPurpose:    string;
  destination:      string;
  departureDate:    string;
  returnDate:       string;
  transportType:    string;
  estimatedAmount:  number | null;
  status:           string;
  submittedAt:      string | null;
  createdAt:        string;
  notes:            string | null;
  // ── Location fields (nullable) ─────────────────────────────────────────────
  originLatitude:     number | null;
  originLongitude:    number | null;
  originAddress:      string | null;
  locationCapturedAt: string | null;
  expenseClaims:    ExpenseClaimResponse[];
}

export interface ExpenseClaimResponse {
  claimId:         number;
  claimCode:       string;
  requestId:       number;
  requestCode:     string | null;
  employeeId:      number;
  employeeName:    string;
  category:        string;
  amount:          number;
  currency:        string;
  expenseDate:     string;
  description:     string | null;
  billPath:        string | null;
  billFileName:    string | null;
  status:          string;
  rejectionReason: string | null;
  approvedAt:      string | null;
  reimbursedAt:    string | null;
  createdAt:       string;
}

export interface ExpenseSummaryResponse {
  totalPending:    number;
  totalApproved:   number;
  totalReimbursed: number;
  pendingCount:    number;
  approvedCount:   number;
  rejectedCount:   number;
  reimbursedCount: number;
}

export interface NotificationResponse {
  notificationId: number;
  type:           string;
  title:          string;
  message:        string;
  isRead:         boolean;
  requestId:      number | null;
  claimId:        number | null;
  createdAt:      string;
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

export interface ApprovalResponse {
  approvalId:   number;
  requestId:    number;
  approverId:   number;
  approverName: string;
  level:        number;
  action:       string;
  comments:     string | null;
  actionAt:     string | null;
  createdAt:    string;
}

export interface PagedResult<T> {
  total:    number;
  page:     number;
  pageSize: number;
  items:    T[];
}