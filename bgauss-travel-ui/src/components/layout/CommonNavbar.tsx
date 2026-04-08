import styles from "./CommonNavbar.module.css";

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
}

export default function CommonNavbar({
  navItems = [],
  user,
  onSignOut,
}: CommonNavbarProps) {
  const hasNavigation = navItems.length > 0;
  const hasActions = Boolean(user || onSignOut);

  return (
    <header className={`${styles.navbar} ${!hasNavigation && !hasActions ? styles.brandOnly : ""}`}>
      <div className={styles.brand}>
        <div className={styles.brandIcon}>
          <span>BG</span>
        </div>
        <div className={styles.brandText}>
          <span className={styles.brandName}>BGauss Travel</span>
          <span className={styles.brandSub}>Employee Portal</span>
        </div>
      </div>

      {hasNavigation && (
        <nav className={styles.navLinks} aria-label="Primary">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`${styles.navLink} ${item.active ? styles.navLinkActive : ""}`}
              onClick={item.onClick}
            >
              {item.label}
            </button>
          ))}
        </nav>
      )}

      {hasActions && (
        <div className={styles.actions}>
          {user && (
            <div className={styles.userPill}>
              <div className={styles.avatar}>{user.initials}</div>
              <div className={styles.userInfo}>
                <span className={styles.userName}>{user.name}</span>
                <span className={styles.userRole}>{user.subtitle}</span>
              </div>
            </div>
          )}

          {onSignOut && (
            <button type="button" className={styles.signOutBtn} onClick={onSignOut}>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Sign out
            </button>
          )}
        </div>
      )}
    </header>
  );
}
