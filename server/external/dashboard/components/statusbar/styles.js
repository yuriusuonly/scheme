/**
 * statusbar — footer status bar styles, local to this component.
 */

export const statusbarCss = `#statusbar {
  display: flex;
  align-items: center;
  height: var(--statusbar-h);
  padding: 0 16px;
  background: var(--c-surface);
  border-top: 1px solid var(--c-border);
  box-shadow: var(--shadow-sm);
  font-size: 11px;
  color: var(--c-text-muted);
  flex-shrink: 0;
  gap: 10px;
  white-space: nowrap;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-x: contain;
  scrollbar-width: thin;
}

/* A thin, unobtrusive horizontal scrollbar for the readout row. */
#statusbar::-webkit-scrollbar {
  height: 4px;
}

#statusbar::-webkit-scrollbar-thumb {
  background: var(--c-border);
  border-radius: 2px;
}

/* The online/offline indicator — first in the left corner, ahead of the two
   data readouts. */
#statusbar #synchronization-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
}

/* The active table / query result row total. */
#statusbar #table-count {
  font-weight: 600;
  color: var(--c-text);
  flex-shrink: 0;
}

/* Thin vertical divider between readouts. */
.separator {
  width: 1px;
  height: 20px;
  background: var(--c-border);
  flex-shrink: 0;
}

#statusbar #last-synchronization {
  flex-shrink: 0;
}

.synchronization-badge {
  font-size: 11px;
  color: var(--c-text-muted);
}

.dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.dot-green  { background: var(--c-success); }
.dot-yellow { background: var(--c-warning); }
.dot-red    { background: var(--c-danger); }

@media (max-width: 768px) {
  #statusbar { padding: 0 10px; }
}`;