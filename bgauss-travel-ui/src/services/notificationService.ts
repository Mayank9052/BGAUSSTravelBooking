// src/services/notificationService.ts
// Connects to: NotificationController.cs + TravelHub.cs (SignalR)
//   GET /api/Notification
//   PUT /api/Notification/{id}/read
//   PUT /api/Notification/read-all
//   SignalR hub: /hubs/travel  → "ReceiveNotification" event

import { get, put } from "./apiClient";
import type { NotificationResponse } from "./apiClient";
import { HubConnectionBuilder, HubConnection, LogLevel } from "@microsoft/signalr";

export const notificationService = {
  /** Bell dropdown — last 50 notifications */
  getAll: (unreadOnly = false) =>
    get<{ unreadCount: number; items: NotificationResponse[] }>(
      `/Notification?unreadOnly=${unreadOnly}`
    ),

  markRead: (id: number) =>
    put<void>(`/Notification/${id}/read`),

  markAllRead: () =>
    put<void>("/Notification/read-all"),
};

// ── SignalR connection factory ─────────────────────────────────────────────────
// Usage:
//   const conn = buildNotificationConnection();
//   conn.on("ReceiveNotification", (notif) => { ... });
//   await conn.start();
//
// TravelHub groups:
//   employee_{id}  → personal notifications
//   hr_broadcast   → HR/Admin global notifications
// ─────────────────────────────────────────────────────────────────────────────

export function buildNotificationConnection(): HubConnection {
  return new HubConnectionBuilder()
    .withUrl("/hubs/travel", {
      accessTokenFactory: () => localStorage.getItem("jwt_token") ?? "",
    })
    .withAutomaticReconnect()
    .configureLogging(LogLevel.Warning)
    .build();
}