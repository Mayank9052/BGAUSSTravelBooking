// src/components/layout/NotificationTabs.tsx
// FIXED:
//  1. Optimistic local dismissal — clicking "mark read" instantly removes the item
//     from the Fresh tab without waiting for parent state to propagate
//  2. Dismissed IDs are tracked in local state; merged with parent's isRead filter
//     so History tab still grows correctly once parent catches up

import { useState } from "react";

interface NotifItem {
  notificationId: number;
  title:          string;
  message:        string;
  isRead:         boolean;
  createdAt:      string;
}

interface NotificationTabsProps {
  notifications:    NotifItem[];   // unread only  (Fresh tab source)
  allNotifications: NotifItem[];   // every notif  (History tab source)
  onMarkRead:       (id: number) => void;
  onOpenHistory?:   () => void;
}

const fmtTime = (d: string) => {
  try {
    const date    = new Date(d);
    const diffMs  = Date.now() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1)  return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr  < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7)  return `${diffDay}d ago`;
    return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  } catch { return ""; }
};

const notifIcon = (title: string) => {
  const t = title?.toLowerCase() ?? "";
  if (t.includes("approved"))  return "✅";
  if (t.includes("rejected"))  return "❌";
  if (t.includes("submitted")) return "📤";
  if (t.includes("reimburse")) return "💰";
  if (t.includes("travel"))    return "✈️";
  if (t.includes("expense"))   return "🧾";
  return "🔔";
};

export function NotificationTabs({
  notifications,
  allNotifications,
  onMarkRead,
  onOpenHistory,
}: NotificationTabsProps) {
  const [tab, setTab]               = useState<"fresh" | "history">("fresh");
  // IDs dismissed this session — gives instant visual feedback before parent re-renders
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(new Set());

  const handleMarkRead = (id: number) => {
    // 1. Instantly hide from Fresh tab
    setDismissedIds(prev => new Set(prev).add(id));
    // 2. Propagate to parent (updates unreadCount, moves to allNotifs, etc.)
    onMarkRead(id);
  };

  // Fresh = parent's unread list minus anything we've already dismissed locally
  const freshItems = notifications.filter(n => !dismissedIds.has(n.notificationId));

  // History = items marked read by parent OR dismissed locally this session
  const historyItems = allNotifications.filter(
    n => n.isRead || dismissedIds.has(n.notificationId)
  );

  return (
    <div>
      {/* ── Tab bar ── */}
      <div style={{ display: "flex", borderBottom: "1px solid #f1f5f9" }}>
        {(["fresh", "history"] as const).map(t => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              if (t === "history") onOpenHistory?.();
            }}
            style={{
              flex: 1, padding: "10px 0", fontSize: 12, fontWeight: 700,
              background: "none", border: "none", cursor: "pointer",
              borderBottom: tab === t ? "2px solid #3b82f6" : "2px solid transparent",
              color: tab === t ? "#3b82f6" : "#94a3b8",
              transition: "color 0.15s, border-color 0.15s",
              fontFamily: "inherit",
            }}
          >
            {t === "fresh"
              ? `Fresh${freshItems.length > 0 ? ` (${freshItems.length})` : ""}`
              : `History (${historyItems.length})`}
          </button>
        ))}
      </div>

      {/* ── Fresh tab ── */}
      {tab === "fresh" && (
        <div style={{ maxHeight: 320, overflowY: "auto" }}>
          {freshItems.length === 0 ? (
            <div style={{ padding: "36px 16px", textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>✅</div>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", margin: 0 }}>All caught up!</p>
              <p style={{ fontSize: 11, color: "#94a3b8", margin: "4px 0 0" }}>No new notifications</p>
            </div>
          ) : freshItems.map(n => (
            <div
              key={n.notificationId}
              onClick={() => handleMarkRead(n.notificationId)}
              style={{
                padding: "12px 16px", borderBottom: "1px solid #f1f5f9",
                background: "#eff6ff", cursor: "pointer",
                display: "flex", gap: 10, alignItems: "flex-start",
                transition: "background 0.12s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "#dbeafe")}
              onMouseLeave={e => (e.currentTarget.style.background = "#eff6ff")}
            >
              <span style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>
                {notifIcon(n.title)}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  display: "flex", justifyContent: "space-between",
                  alignItems: "flex-start", gap: 8, marginBottom: 3,
                }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>{n.title}</span>
                  <span style={{ fontSize: 10, color: "#94a3b8", flexShrink: 0, whiteSpace: "nowrap" }}>
                    {fmtTime(n.createdAt)}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "#475569", lineHeight: 1.55, wordBreak: "break-word" }}>
                  {n.message}
                </div>
                <div style={{ fontSize: 10, color: "#3b82f6", fontWeight: 600, marginTop: 5 }}>
                  Tap to dismiss →
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── History tab ── */}
      {tab === "history" && (
        <div style={{ maxHeight: 320, overflowY: "auto" }}>
          {historyItems.length === 0 ? (
            <div style={{ padding: "36px 16px", textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>📭</div>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", margin: 0 }}>No history yet</p>
              <p style={{ fontSize: 11, color: "#94a3b8", margin: "4px 0 0" }}>
                Read notifications will appear here
              </p>
            </div>
          ) : historyItems.map(n => (
            <div
              key={n.notificationId}
              style={{
                padding: "12px 16px", borderBottom: "1px solid #f8fafc",
                background: "#fff", display: "flex", gap: 10,
                alignItems: "flex-start", opacity: 0.72,
              }}
            >
              <span style={{ fontSize: 20, flexShrink: 0, marginTop: 1 }}>
                {notifIcon(n.title)}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  display: "flex", justifyContent: "space-between",
                  alignItems: "flex-start", gap: 8, marginBottom: 3,
                }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#334155" }}>{n.title}</span>
                  <span style={{ fontSize: 10, color: "#94a3b8", flexShrink: 0, whiteSpace: "nowrap" }}>
                    {fmtTime(n.createdAt)}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: "#64748b", lineHeight: 1.55, wordBreak: "break-word" }}>
                  {n.message}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
