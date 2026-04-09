// src/services/approvalService.ts
// Connects to: ApprovalController.cs  (Admin/HR only)
//   GET  /api/Approval/pending
//   POST /api/Approval/request/{id}
//   GET  /api/Approval/history/{requestId}

import { get, post } from "./apiClient";
import type { TravelRequestResponse, ExpenseClaimResponse, ApprovalResponse } from "./apiClient";

export interface ApprovalInput {
  action:    string;   // "approve" | "reject"
  comments?: string;
}

export const approvalService = {
  /** Admin/HR DashboardPage "Approvals" tab */
  pending: () =>
    get<{
      pendingRequests: TravelRequestResponse[];
      pendingExpenses: ExpenseClaimResponse[];
    }>("/Approval/pending"),

  /** Approve or reject a travel request */
  actionOnRequest: (id: number, dto: ApprovalInput) =>
    post<{ requestId: number; requestCode: string; status: string }>(
      `/Approval/request/${id}`, dto
    ),

  /** Full approval trail for a request */
  history: (requestId: number) =>
    get<ApprovalResponse[]>(`/Approval/history/${requestId}`),
};