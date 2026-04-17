// src/components/layout/CommonNavbar.tsx
// ADDED:
//  1. showBack prop — shows a ← Back button at start of navbar (all pages except Dashboard)
//  2. locationDisplay — shows current city near the user avatar (Dashboard page only)
//  3. onBack callback (defaults to browser history back)

import { useRef, useEffect, useState, useCallback } from "react";
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
  /** City/location string to show near avatar (Dashboard only) */
  locationDisplay?:  string;
  user?:             NavUser;
  onSignOut?:        () => void;
  notificationBell?: NotificationBellProps;
  /** Show ← Back button at the left of navbar. Set to false on Dashboard. Default: true */
  showBack?:         boolean;
  /** Called when back button is clicked. Defaults to history.back() */
  onBack?:           () => void;
  
}

export default function CommonNavbar({
  navItems = [],
  locationDisplay,
  user,
  onSignOut,
  notificationBell,
  showBack = false,
  onBack,
  
}: CommonNavbarProps) {
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!notificationBell?.showDrop) return;
    const close = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node))
        notificationBell.onClose();
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

      {/* ── Back button (shown on all non-dashboard pages) ── */}
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
          onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}>
          ← Back
        </button>
      )}

      {/* Brand */}
      <div className={styles.brand}>
        <div className={styles.brandIcon}><span>BG</span></div>
        <div className={styles.brandText}>
          <span className={styles.brandName}>BGauss Travel</span>
          <span className={styles.brandSub}>Employee Portal</span>
        </div>
      </div>

      {/* Nav links */}
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

      {/* Right actions */}
      <div className={styles.actions}>

        {/* Location display — shown on Dashboard only */}
        {locationDisplay && (
          <div style={{
            fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: 500,
            display: "flex", alignItems: "center", gap: 3, marginTop: 2,
            paddingRight: 2,
          }}>
            <span style={{ fontSize: 10 }}>📍</span>
            {locationDisplay}
          </div>
        )}

        {/* ── Notification bell ── */}
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

            {notificationBell.showDrop && (
              <div style={{
                position: "absolute", top: "calc(100% + 8px)", right: 0,
                width: 360, background: "#fff", borderRadius: 16,
                border: "1.5px solid #e2e8f0",
                boxShadow: "0 16px 48px rgba(0,0,0,0.16)",
                zIndex: 999, overflow: "hidden",
              }}>
                <div style={{
                  padding: "14px 16px 10px", borderBottom: "1px solid #f1f5f9",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <span style={{ fontWeight: 800, fontSize: 14, color: "#0f172a" }}>🔔 Notifications</span>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    {notificationBell.unreadCount > 0 && (
                      <button onClick={notificationBell.onMarkAllRead}
                        style={{ fontSize: 11, color: "#3b82f6", background: "none",
                          border: "none", cursor: "pointer", fontWeight: 700, padding: 0, fontFamily: "inherit" }}>
                        Mark all read
                      </button>
                    )}
                    <button onClick={notificationBell.onClose}
                      style={{ background: "none", border: "none", cursor: "pointer",
                        fontSize: 16, color: "#94a3b8", padding: 0, lineHeight: 1 }}>
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
              </div>
            )}
          </div>
        )}


        {/* ── User pill + optional location ── */}
        {user && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 0 }}>
            <div className={styles.userPill}>
              <div className={styles.avatar}>{user.initials}</div>
              <div className={styles.userInfo}>
                <span className={styles.userName}>{user.name}</span>
                <span className={styles.userRole}>{user.subtitle}</span>
              </div>
            </div>
            
          </div>
        )}

        {/* Sign out */}
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
    </header>
  );
}