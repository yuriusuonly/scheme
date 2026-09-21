/**
 * toasts — toast notification styles, local to this component.
 */

export const toastCss = `.toast-container {
  position: fixed;
  bottom: 40px;
  right: 16px;
  z-index: 2000;
  display: flex;
  flex-direction: column-reverse;
  gap: 8px;
}

.toast {
  padding: 10px 16px;
  border-radius: var(--radius);
  font-size: 12px;
  color: #fff;
  box-shadow: var(--shadow-md);
  animation: toast-in 0.25s ease-out;
  max-width: 340px;
}

.toast-success { background: var(--c-success); }
.toast-error   { background: var(--c-danger); }
.toast-info    { background: var(--c-primary); }

@keyframes toast-in {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}`;