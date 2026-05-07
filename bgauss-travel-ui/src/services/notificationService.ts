// src/services/notificationService.ts
import { get, put } from "./apiClient";
import type { NotificationResponse } from "./apiClient";
import { HubConnectionBuilder, HubConnection, LogLevel } from "@microsoft/signalr";

export const notificationService = {
  /** Bell dropdown — unread only (fresh notifications) */
  getUnread: () =>
    get<{ unreadCount: number; items: NotificationResponse[] }>(
      `/Notification?unreadOnly=true`
    ),

  /** All notifications including read ones — for history tab */
  getAll: (unreadOnly = false) =>
    get<{ unreadCount: number; items: NotificationResponse[] }>(
      `/Notification?unreadOnly=${unreadOnly}`
    ),

  markRead: (id: number) =>
    put<void>(`/Notification/${id}/read`),

  markAllRead: () =>
    put<void>("/Notification/read-all"),
};

export function buildNotificationConnection(): HubConnection {
  return new HubConnectionBuilder()
    .withUrl("/hubs/notifications", {          // ← FIX: was "/hubs/travel", must match Program.cs MapHub
      accessTokenFactory: () => localStorage.getItem("jwt_token") ?? "",
    })
    .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])  // ← ADD: retry schedule prevents crash on disconnect
    .configureLogging(LogLevel.Warning)
    .build();
}