// src/services/approvalService.ts
// FIX: actionOnRequest now capitalizes the action string ("Approve"/"Reject")
//      The backend ApprovalController likely does string comparison that is
//      case-sensitive, causing HTTP 500 when lowercase "approve" is sent.
//      Capitalizing here is safe regardless — ExpenseController uses .ToLower()
//      so it handles both cases fine.

import { get, post } from "./apiClient";
import type { TravelRequestResponse, ExpenseClaimResponse, ApprovalResponse } from "./apiClient";

export interface ApprovalInput {
  action:    string;   // "approve" | "reject"  (will be capitalized before send)
  comments?: string;
}

export interface ApprovalSummary {
  pendingApprovals: number;
  approvedCount:    number;
  rejectedCount:    number;
  draftCount:       number;
  totalRequests:    number;
  expensePipeline:  number;
  resolvedRequests: TravelRequestResponse[];
}

// Capitalize first letter — "approve" → "Approve", "reject" → "Reject"
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

export const approvalService = {
  summary: () =>
    get<ApprovalSummary>("/Approval/summary"),

  pending: () =>
    get<{
      pendingRequests: TravelRequestResponse[];
      pendingExpenses: ExpenseClaimResponse[];
    }>("/Approval/pending?pageSize=20"),

  // FIX: capitalize action so "approve" → "Approve" before sending to backend
  // This fixes HTTP 500 if ApprovalController does case-sensitive comparison
  actionOnRequest: (id: number, dto: ApprovalInput) =>
    post<{ requestId: number; requestCode: string; status: string }>(
      `/Approval/request/${id}`,
      {
        action:   capitalize(dto.action),
        comments: dto.comments,
      }
    ),

  history: (requestId: number) =>
    get<ApprovalResponse[]>(`/Approval/history/${requestId}`),
};