// src/services/bookingService.ts
// UPDATED: department added to CreateBookingInput
//   — When creating a booking, the employee's department (from localStorage)
//     is sent so the backend can snapshot it onto TravelRequest.Department.
//   — The backend also reads it from TravelEmployee as primary source.
//   — department now appears in TravelRequestResponse via apiClient types.

import { get, post, put, del } from "./apiClient";
import type { TravelRequestResponse, PagedResult } from "./apiClient";

export interface CreateBookingInput {
  employeeId:       number;
  department?:      string;   // ← NEW: snapshotted from TravelEmployee on backend; sent as fallback
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

  /** Admin/HR: all trips, flat list, with optional transport filter */
  getAllFlat: (transport?: string, status?: string) => {
    const qs = new URLSearchParams();
    if (transport) qs.set("transport", transport);
    if (status)    qs.set("status",    status);
    qs.set("pageSize", "500");
    return get<{ total: number; items: TravelRequestResponse[] }>(`/Booking/all?${qs}`)
      .then(r => r.items ?? r);
  },

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