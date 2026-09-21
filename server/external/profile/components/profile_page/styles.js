/**
 * profile-page — user profile page styles, local to this component.
 */

export const profilePageCss = `.profile-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--topbar-h);
  padding: 0 16px;
  background: var(--c-surface);
  border-bottom: 1px solid var(--c-border);
  box-shadow: var(--shadow-sm);
  flex-shrink: 0;
}

.profile-topbar .logo {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.3px;
}

.profile-page {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.profile-card {
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  box-shadow: var(--shadow-md);
  padding: 40px 56px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  min-width: 260px;
}

.profile-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 96px;
  height: 96px;
  border-radius: 50%;
  background: var(--c-primary);
  color: #fff;
  font-size: 40px;
  font-weight: 700;
  line-height: 1;
  box-shadow: var(--shadow-md);
  user-select: none;
}

.profile-name {
  font-size: 22px;
  font-weight: 700;
  text-align: center;
  word-break: break-word;
}

.profile-role {
  padding: 2px 10px;
  border-radius: 10px;
  background: var(--c-primary);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.profile-error {
  padding: 20px;
  color: var(--c-danger);
  text-align: center;
  font-size: 12px;
}`;