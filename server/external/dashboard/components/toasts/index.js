/**
 * toasts — notification container.
 * Markup + styles only; toasts are created and removed by the core runtime's
 * showToast() helper.
 */

import { toastCss } from "./styles.js";

export function toasts() {
  return `<style>
${toastCss}
</style>
<div id="toast-container" class="toast-container"></div>`;
}