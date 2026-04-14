// src/services/bookingService.ts
// Connects to: BookingController.cs
//   GET  /api/Booking/my
//   GET  /api/Booking          (Admin/HR — paginated)
//   GET  /api/Booking/all      (Admin/HR — flat list for dashboard)
//   GET  /api/Booking/{id}
//   POST /api/Booking
//   PUT  /api/Booking/{id}
//   DELETE /api/Booking/{id}

import { get, post, put, del } from "./apiClient";
import type { TravelRequestResponse, PagedResult } from "./apiClient";

export interface CreateBookingInput {
  employeeId:       number;
  travelPurpose:    string;
  destination:      string;
  departureDate:    string;   // "yyyy-MM-dd"
  returnDate:       string;   // "yyyy-MM-dd"
  transportType:    string;   // Flight | Train | Cab | Hotel | Multiple
  estimatedAmount?: number;
  notes?:           string;
  // Location fields (optional)
  originLatitude?:     number;
  originLongitude?:    number;
  originAddress?:      string;
  locationCapturedAt?: string;   // ISO timestamp
}

export interface UpdateBookingInput {
  travelPurpose?:   string;
  destination?:     string;
  departureDate?:   string;
  returnDate?:      string;
  transportType?:   string;
  estimatedAmount?: number;
  notes?:           string;
}

export const bookingService = {
  /** DashboardPage: employee's own trips */
  getMy: () =>
    get<TravelRequestResponse[]>("/Booking/my"),

  /**
   * Admin/HR DashboardPage — History sub-tab.
   * Returns a flat array (no pagination) filtered to Approved + Rejected.
   * Calls GET /api/Booking/my for now (reuses same endpoint scoped by role on backend).
   * If your BookingController has a dedicated /api/Booking/all, point there instead.
   */
  getAllResolved: () =>
    get<TravelRequestResponse[]>("/Booking/my")
      .then(list => list.filter(r => r.status === "Approved" || r.status === "Rejected"))
      .catch(() => [] as TravelRequestResponse[]),

  /** Admin/HR pages — paginated with filters */
  getAll: (params?: { status?: string; transport?: string; page?: number; pageSize?: number }) => {
    const qs = new URLSearchParams();
    if (params?.status)    qs.set("status",    params.status);
    if (params?.transport) qs.set("transport", params.transport);
    if (params?.page)      qs.set("page",      String(params.page));
    if (params?.pageSize)  qs.set("pageSize",  String(params.pageSize));
    return get<PagedResult<TravelRequestResponse>>(`/Booking?${qs}`);
  },

  getById: (id: number) =>
    get<TravelRequestResponse>(`/Booking/${id}`),

  create: (dto: CreateBookingInput) =>
    post<{ requestId: number; requestCode: string }>("/Booking", dto),

  update: (id: number, dto: UpdateBookingInput) =>
    put<{ requestId: number; status: string }>(`/Booking/${id}`, dto),

  delete: (id: number) =>
    del<void>(`/Booking/${id}`),
};