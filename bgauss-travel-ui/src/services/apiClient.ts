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
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// ─────────────────────────────────────────────────────────────
// Response Handler (FIXED)
// ─────────────────────────────────────────────────────────────

async function handleResponse<T>(res: Response): Promise<T> {
  // No content
  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();

  let data: any;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const message =
      data?.message || `HTTP ${res.status} - ${res.statusText}`;

    throw new ApiError(message, res.status);
  }

  return data as T;
}

// ─────────────────────────────────────────────────────────────
// API METHODS (FIXED - consistent error handling)
// ─────────────────────────────────────────────────────────────

// GET
export async function get<T>(url: string): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    method: "GET",
    headers: authHeaders(),
  });

  return handleResponse<T>(res);
}

// POST
export async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });

  return handleResponse<T>(res);
}

// PUT
export async function put<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    method: "PUT",
    headers: authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });

  return handleResponse<T>(res);
}

// DELETE
export async function del<T>(url: string): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    method: "DELETE",
    headers: authHeaders(),
  });

  return handleResponse<T>(res);
}

// ─────────────────────────────────────────────────────────────
// FILE UPLOAD (FIXED)
// ─────────────────────────────────────────────────────────────

export async function uploadFile<T>(
  url: string,
  file: File,
  fieldName = "file"
): Promise<T> {
  const token = getToken();

  const form = new FormData();
  form.append(fieldName, file);

  const res = await fetch(`${BASE}${url}`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: form,
  });

  return handleResponse<T>(res);
}

// ─────────────────────────────────────────────────────────────
// FILE DOWNLOAD (NEW)
// ─────────────────────────────────────────────────────────────

export async function downloadFile(
  url: string,
  fileName?: string
): Promise<void> {
  const token = getToken();

  const res = await fetch(`${BASE}${url}`, {
    method: "GET",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    throw new ApiError(`Download failed (${res.status})`, res.status);
  }

  const blob = await res.blob();

  // Create download link
  const link = document.createElement("a");
  const objectUrl = window.URL.createObjectURL(blob);

  link.href = objectUrl;
  link.download = fileName || "file";
  document.body.appendChild(link);
  link.click();

  // Cleanup
  link.remove();
  window.URL.revokeObjectURL(objectUrl);
}

// ─────────────────────────────────────────────────────────────
// FILE VIEW (NEW)
// ─────────────────────────────────────────────────────────────

export async function viewFile(url: string): Promise<void> {
  const token = getToken();

  const res = await fetch(`${BASE}${url}`, {
    method: "GET",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    throw new ApiError(`View failed (${res.status})`, res.status);
  }

  const blob = await res.blob();
  const objectUrl = window.URL.createObjectURL(blob);

  window.open(objectUrl, "_blank");
}

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────

export interface TravelRequestResponse {
  requestId: number;
  requestCode: string;
  employeeId: number;
  employeeName: string;
  employeeCode: string;
  department: string;
  travelPurpose: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  transportType: string;
  estimatedAmount: number | null;
  status: string;
  submittedAt: string | null;
  createdAt: string;
  notes: string | null;

  originLatitude: number | null;
  originLongitude: number | null;
  originAddress: string | null;
  locationCapturedAt: string | null;

  expenseClaims: ExpenseClaimResponse[];
}

export interface ExpenseClaimResponse {
  claimId: number;
  claimCode: string;
  requestId: number;
  requestCode: string | null;
  employeeId: number;
  employeeName: string;
  category: string;
  amount: number;
  currency: string;
  expenseDate: string;
  description: string | null;
  billPath: string | null;
  billFileName: string | null;
  status: string;
  rejectionReason: string | null;
  approvedAt: string | null;
  reimbursedAt: string | null;
  createdAt: string;
}

export interface ExpenseSummaryResponse {
  totalPending: number;
  totalApproved: number;
  totalReimbursed: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  reimbursedCount: number;
}

export interface NotificationResponse {
  notificationId: number;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  requestId: number | null;
  claimId: number | null;
  createdAt: string;
}

export interface DashboardSummaryResponse {
  totalRequests: number;
  pendingRequests: number;
  approvedRequests: number;
  rejectedRequests: number;
  totalExpenses: number;
  pendingExpenses: number;
  approvedExpenses: number;
  totalEmployees: number;
}

export interface ApprovalResponse {
  approvalId: number;
  requestId: number;
  approverId: number;
  approverName: string;
  level: number;
  action: string;
  comments: string | null;
  actionAt: string | null;
  createdAt: string;
}

export interface PagedResult<T> {
  total: number;
  page: number;
  pageSize: number;
  items: T[];
}