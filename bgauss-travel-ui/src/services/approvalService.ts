// src/services/approvalService.ts
// Connects to: ApprovalController.cs  (Admin/HR only)
//   GET  /api/Approval/summary
//   GET  /api/Approval/pending
//   POST /api/Approval/request/{id}
//   GET  /api/Approval/history/{requestId}

import { get, post } from "./apiClient";
import type { TravelRequestResponse, ExpenseClaimResponse, ApprovalResponse } from "./apiClient";

export interface ApprovalInput {
  action:    string;   // "approve" | "reject"
  comments?: string;
}

// Shape returned by GET /api/Approval/summary
export interface ApprovalSummary {
  pendingApprovals: number;
  approvedCount:    number;
  rejectedCount:    number;
  draftCount:       number;
  totalRequests:    number;
  expensePipeline:  number;
  resolvedRequests: TravelRequestResponse[];
}

export const approvalService = {
  /**
   * HR/Admin dashboard stat cards + History sub-tab data.
   * Single call replaces bookingService.getAllResolved() —
   * the resolvedRequests array is embedded in the response.
   */
  summary: () =>
    get<ApprovalSummary>("/Approval/summary"),

  /** Admin/HR DashboardPage "Approvals" tab — Pending sub-tab */
  pending: () =>
  get<{
    pendingRequests: TravelRequestResponse[];
    pendingExpenses: ExpenseClaimResponse[];
  }>("/Approval/pending?pageSize=20"),

  /** Approve or reject a travel request */
  actionOnRequest: (id: number, dto: ApprovalInput) =>
  post<{ requestId: number; requestCode: string; status: string }>(
    `/Approval/request/${id}`, 
    { ...dto, action: dto.action.charAt(0).toUpperCase() + dto.action.slice(1) }
  ),

  /** Full approval trail for a single request */
  history: (requestId: number) =>
    get<ApprovalResponse[]>(`/Approval/history/${requestId}`),
};