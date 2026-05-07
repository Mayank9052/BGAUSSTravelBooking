// src/components/layout/CommonNavbar.tsx
// FIXED:
//  1. Notification dropdown rendered via createPortal → escapes backdrop-filter stacking context
//  2. Dropdown position calculated from bell button ref (position: fixed, top: 68px)
//  3. Click-outside closes dropdown correctly
//  4. All existing props/behaviour preserved

import { useRef, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./CommonNavbar.module.css";
import { NotificationTabs } from "./NotificationTabs";

export interface NotificationItem {
  notificationId: number;
  title:          string;
  message:        string;
  isRead:         boolean;
  createdAt:      string;
}

export interface NotificationBellProps {
  notifications:     NotificationItem[];
  allNotifications?: NotificationItem[];
  unreadCount:       number;
  showDrop:          boolean;
  onToggle:          () => void;
  onMarkRead:        (id: number) => void;
  onMarkAllRead:     () => void;
  onClose:           () => void;
  onOpenHistory?:    () => void;
}

interface NavItem {
  id:       string;
  label:    string;
  active?:  boolean;
  onClick?: () => void;
}

interface NavUser {
  initials: string;
  name:     string;
  subtitle: string;
}

interface CommonNavbarProps {
  navItems?:         NavItem[];
  locationDisplay?:  string;
  user?:             NavUser;
  onSignOut?:        () => void;
  notificationBell?: NotificationBellProps;
  showBack?:         boolean;
  onBack?:           () => void;
  onAvatarClick?:    () => void;
}

export default function CommonNavbar({
  navItems = [],
  locationDisplay,
  user,
  onSignOut,
  notificationBell,
  showBack = false,
  onBack,
  onAvatarClick,
}: CommonNavbarProps) {

  // Ref on the bell button to calculate dropdown position
  const bellRef    = useRef<HTMLButtonElement>(null);
  const dropRef    = useRef<HTMLDivElement>(null);

  // Track dropdown position for the portal
  const [dropPos, setDropPos] = useState<{ top: number; right: number } | null>(null);

  // Recalculate position when dropdown opens
  useEffect(() => {
    if (!notificationBell?.showDrop) {
      setDropPos(null);
      return;
    }
    if (bellRef.current) {
      const rect = bellRef.current.getBoundingClientRect();
      setDropPos({
        top:   rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
  }, [notificationBell?.showDrop]);

  // Click-outside: checks both bell button and dropdown portal
  useEffect(() => {
    if (!notificationBell?.showDrop) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideDrop = dropRef.current?.contains(target);
      const insideBell = bellRef.current?.contains(target);
      if (!insideDrop && !insideBell) {
        notificationBell.onClose();
      }
    };
    const t = setTimeout(() => document.addEventListener("mousedown", close), 50);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", close); };
  }, [notificationBell?.showDrop]);

  const handleBack = () => {
    if (onBack) onBack();
    else window.history.back();
  };

  return (
    <header className={styles.navbar}>

      {/* ── Back button ── */}
      {showBack && (
        <button
          type="button"
          onClick={handleBack}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 8, padding: "6px 12px", cursor: "pointer",
            color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: 600,
            flexShrink: 0, transition: "background 0.15s", fontFamily: "inherit",
          }}
          onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.14)")}
          onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
        >
          ← Back
        </button>
      )}

      {/* ── Brand ── */}
      <div className={styles.brand}>
        <div className={styles.brandIcon}><span>BG</span></div>
        <div className={styles.brandText}>
          <span className={styles.brandName}>BGauss Travel</span>
          <span className={styles.brandSub}>Employee Portal</span>
        </div>
      </div>

      {/* ── Nav links ── */}
      {navItems.length > 0 && (
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

      {/* ── Right actions ── */}
      <div className={styles.actions}>

        {locationDisplay && (
          <div style={{
            fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: 500,
            display: "flex", alignItems: "center", gap: 3,
          }}>
            <span>📍</span>
            {locationDisplay}
          </div>
        )}

        {/* ── Notification bell — button stays in navbar, dropdown goes to portal ── */}
        {notificationBell && (
          <>
            <button
              ref={bellRef}
              onClick={notificationBell.onToggle}
              title="Notifications"
              style={{
                position: "relative", background: "none", border: "none",
                cursor: "pointer", padding: "6px 8px", borderRadius: 8,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke="rgba(255,255,255,0.75)" strokeWidth="2" strokeLinecap="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              {notificationBell.unreadCount > 0 && (
                <span style={{
                  position: "absolute", top: 2, right: 2,
                  minWidth: 15, height: 15, background: "#D83B34",
                  borderRadius: "50%", fontSize: 9, fontWeight: 700,
                  color: "#fff", display: "flex", alignItems: "center",
                  justifyContent: "center", border: "1.5px solid #0b1120", padding: "0 2px",
                }}>
                  {notificationBell.unreadCount > 9 ? "9+" : notificationBell.unreadCount}
                </span>
              )}
            </button>

            {/* ── Portal: renders at document.body, fully escaping navbar stacking context ── */}
            {notificationBell.showDrop && dropPos && createPortal(
              <div
                ref={dropRef}
                style={{
                  position: "fixed",
                  top:   dropPos.top,
                  right: dropPos.right,
                  width: 360,
                  background: "#fff",
                  borderRadius: 16,
                  border: "1.5px solid #e2e8f0",
                  boxShadow: "0 16px 48px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)",
                  zIndex: 99999,
                  overflow: "hidden",
                  // Animate in
                  animation: "notifSlideIn 0.18s cubic-bezier(0.16,1,0.3,1) both",
                }}
              >
                {/* Dropdown header */}
                <div style={{
                  padding: "14px 16px 10px",
                  borderBottom: "1px solid #f1f5f9",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <span style={{ fontWeight: 800, fontSize: 14, color: "#0f172a" }}>
                    🔔 Notifications
                    {notificationBell.unreadCount > 0 && (
                      <span style={{
                        marginLeft: 8, background: "#ef4444", color: "#fff",
                        borderRadius: 999, padding: "1px 7px", fontSize: 10, fontWeight: 700,
                      }}>
                        {notificationBell.unreadCount}
                      </span>
                    )}
                  </span>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    {notificationBell.unreadCount > 0 && (
                      <button
                        onClick={notificationBell.onMarkAllRead}
                        style={{
                          fontSize: 11, color: "#3b82f6", background: "none",
                          border: "none", cursor: "pointer", fontWeight: 700,
                          padding: 0, fontFamily: "inherit",
                        }}
                      >
                        Mark all read
                      </button>
                    )}
                    <button
                      onClick={notificationBell.onClose}
                      style={{
                        background: "none", border: "none", cursor: "pointer",
                        fontSize: 16, color: "#94a3b8", padding: 0, lineHeight: 1,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <NotificationTabs
                  notifications={notificationBell.notifications}
                  allNotifications={notificationBell.allNotifications ?? notificationBell.notifications}
                  onMarkRead={notificationBell.onMarkRead}
                  onOpenHistory={notificationBell.onOpenHistory}
                />
              </div>,
              document.body
            )}
          </>
        )}

        {/* ── User pill ── */}
        {user && (
          <div className={styles.userPill}>
            <div
              className={styles.avatar}
              onClick={onAvatarClick}
              title={onAvatarClick ? "Edit profile" : undefined}
              style={{ cursor: onAvatarClick ? "pointer" : "default" }}
            >
              {user.initials}
            </div>
            <div className={styles.userInfo}>
              <span className={styles.userName}>{user.name}</span>
              <span className={styles.userRole}>{user.subtitle}</span>
            </div>
          </div>
        )}

        {/* ── Sign out ── */}
        {onSignOut && (
          <button type="button" className={styles.signOutBtn} onClick={onSignOut}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Sign out
          </button>
        )}
      </div>

      {/* Keyframe for dropdown animation — injected once */}
      <style>{`
        @keyframes notifSlideIn {
          from { opacity: 0; transform: translateY(-8px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
      `}</style>
    </header>
  );
}