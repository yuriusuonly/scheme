/**
 * topbar — page header styles, local to this component.
 */

export const topbarCss = `#topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--topbar-h);
  padding: 0 16px;
  background: var(--c-surface);
  border-bottom: 1px solid var(--c-border);
  box-shadow: var(--shadow-sm);
  z-index: 100;
  flex-shrink: 0;
}

.topbar-left {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.logo {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.3px;
}

.tagline {
  font-size: 12px;
  color: var(--c-text-muted);
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 14px;
}

/* Circle avatar → /profile. */
.avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--c-primary);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  border: 2px solid var(--c-border-light);
  transition: border-color 0.15s, box-shadow 0.15s, transform 0.15s;
  user-select: none;
}

.avatar:hover {
  border-color: var(--c-primary);
  box-shadow: var(--shadow-sm);
}

.avatar:focus-visible {
  outline: 2px solid var(--c-primary);
  outline-offset: 1px;
}`;