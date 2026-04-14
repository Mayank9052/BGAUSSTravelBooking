// src/components/layout/CommonNavbar.tsx
// Notification bell is now an OPTIONAL prop — only DashboardPage passes it.
// All other pages (Reports, Profile, etc.) get the clean navbar with no bell.

import { useRef, useEffect } from "react";
import styles from "./CommonNavbar.module.css";

export interface NotificationItem {
  notificationId: number;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationBellProps {
  notifications: NotificationItem[];
  unreadCount: number;
  showDrop: boolean;
  onToggle: () => void;
  onMarkRead: (id: number) => void;
  onMarkAllRead: () => void;
  onClose: () => void;
}

interface NavItem {
  id: string;
  label: string;
  active?: boolean;
  onClick?: () => void;
}

interface NavUser {
  initials: string;
  name: string;
  subtitle: string;
}

interface CommonNavbarProps {
  navItems?: NavItem[];
  user?: NavUser;
  onSignOut?: () => void;
  /** Pass this only from DashboardPage — other pages omit it */
  notificationBell?: NotificationBellProps;
}

const fmtDate = (d: string | null | undefined) => {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "2-digit",
    }) + " " + new Date(d).toLocaleTimeString("en-IN", {
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return d; }
};

export default function CommonNavbar({
  navItems = [],
  user,
  onSignOut,
  notificationBell,
}: CommonNavbarProps) {
  const hasNavigation = navItems.length > 0;
  const dropRef = useRef<HTMLDivElement>(null);

  // Close bell dropdown on outside click
  useEffect(() => {
    if (!notificationBell?.showDrop) return;
    const close = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node))
        notificationBell.onClose();
    };
    const t = setTimeout(() => document.addEventListener("mousedown", close), 50);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", close); };
  }, [notificationBell?.showDrop]);

  return (
    <header className={styles.navbar}>
      {/* Brand */}
      <div className={styles.brand}>
        <div className={styles.brandIcon}><span>BG</span></div>
        <div className={styles.brandText}>
          <span className={styles.brandName}>BGauss Travel</span>
          <span className={styles.brandSub}>Employee Portal</span>
        </div>
      </div>

      {/* Nav links */}
      {hasNavigation && (
        <nav className={styles.navLinks} aria-label="Primary">
          {navItems.map(item => (
            <button key={item.id} type="button"
              className={`${styles.navLink} ${item.active ? styles.navLinkActive : ""}`}
              onClick={item.onClick}>
              {item.label}
            </button>
          ))}
        </nav>
      )}

      {/* Right side actions */}
      <div className={styles.actions}>

        {/* ── Notification Bell — only rendered when prop is supplied ── */}
        {notificationBell && (
          <div ref={dropRef} style={{ position: "relative" }}>
            <button
              onClick={notificationBell.onToggle}
              title="Notifications"
              style={{
                position: "relative", background: "none", border: "none",
                cursor: "pointer", padding: "6px 8px", borderRadius: 8,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              {notificationBell.unreadCount > 0 && (
                <span style={{
                  position: "absolute", top: 2, right: 2,
                  width: 15, height: 15, background: "#D83B34",
                  borderRadius: "50%", fontSize: 9, fontWeight: 700,
                  color: "#fff", display: "flex", alignItems: "center",
                  justifyContent: "center", border: "1.5px solid #0f172a",
                }}>
                  {notificationBell.unreadCount > 9 ? "9+" : notificationBell.unreadCount}
                </span>
              )}
            </button>

            {/* Dropdown */}
            {notificationBell.showDrop && (
              <div style={{
                position: "absolute", top: "calc(100% + 8px)", right: 0,
                width: 360, background: "#fff", borderRadius: 14,
                border: "1.5px solid #e5e7eb",
                boxShadow: "0 12px 40px rgba(0,0,0,0.15)", zIndex: 600,
                overflow: "hidden",
              }}>
                {/* Header */}
                <div style={{
                  padding: "12px 16px", borderBottom: "1px solid #f1f5f9",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  background: "#0f172a",
                }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: "#fff", display: "flex", alignItems: "center", gap: 8 }}>
                    🔔 Notifications
                    {notificationBell.unreadCount > 0 && (
                      <span style={{ background: "#D83B34", borderRadius: 20, padding: "1px 7px", fontSize: 11 }}>
                        {notificationBell.unreadCount}
                      </span>
                    )}
                  </span>
                  {notificationBell.unreadCount > 0 && (
                    <button onClick={notificationBell.onMarkAllRead}
                      style={{ fontSize: 11, color: "#94a3b8", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
                      Mark all read
                    </button>
                  )}
                </div>

                {/* Items */}
                <div style={{ maxHeight: 360, overflowY: "auto" }}>
                  {notificationBell.notifications.length === 0 ? (
                    <div style={{ padding: "36px 16px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                      <div style={{ fontSize: 28, marginBottom: 8 }}>🔕</div>
                      No notifications yet
                    </div>
                  ) : notificationBell.notifications.map(n => (
                    <div key={n.notificationId}
                      onClick={() => notificationBell.onMarkRead(n.notificationId)}
                      style={{
                        padding: "11px 16px", borderBottom: "1px solid #f8fafc",
                        cursor: "pointer", background: n.isRead ? "transparent" : "#eff6ff",
                        transition: "background 0.15s",
                      }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                        <div style={{ fontWeight: n.isRead ? 500 : 700, fontSize: 13, color: "#0f172a" }}>{n.title}</div>
                        {!n.isRead && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#3b82f6", flexShrink: 0, marginTop: 4 }} />}
                      </div>
                      <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{n.message}</div>
                      <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 3 }}>{fmtDate(n.createdAt)}</div>
                    </div>
                  ))}
                </div>

                <div style={{ padding: "9px 16px", borderTop: "1px solid #f1f5f9", background: "#f8fafc", textAlign: "center" }}>
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>
                    {notificationBell.notifications.length} notification{notificationBell.notifications.length !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* User pill */}
        {user && (
          <div className={styles.userPill}>
            <div className={styles.avatar}>{user.initials}</div>
            <div className={styles.userInfo}>
              <span className={styles.userName}>{user.name}</span>
              <span className={styles.userRole}>{user.subtitle}</span>
            </div>
          </div>
        )}

        {/* Sign out */}
        {onSignOut && (
          <button type="button" className={styles.signOutBtn} onClick={onSignOut}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Sign out
          </button>
        )}
      </div>
    </header>
  );
}
