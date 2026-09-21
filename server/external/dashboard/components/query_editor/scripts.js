/**
 * @module dashboard/components/query_editor
 * query_editor — embedded LSP-lite behaviour.
 *
 * The script carries the whole editor experience locally:
 *   - syntax highlighting through an overlay <pre> (token-class colours,
 *     including `*` and comparison operators)
 *   - live diagnostics (unbalanced parens, unterminated strings/comments)
 *     surfaced in a small popup at the top-right of the editor — visible only
 *     while there are lint messages; the runtime error row (#editor-error)
 *     sits in its own strip above the toolbar
 *   - completions (SQL keywords + tables + their columns) on Ctrl+Space
 *     or after a typed prefix, with keyboard navigation — the dropdown opens
 *     below the caret line so the text being typed stays visible
 *   - Ctrl+Enter run via SchemeApp, Tab indentation, scroll sync
 *
 * This is an embedded script string: it must not contain backticks or ${}, and
 * every backslash in the emitted code is doubled here in the ESM source.
 */

export const queryEditorScript = `(function () {
  var SchemeApp = window.SchemeApp;
  if (!SchemeApp || SchemeApp.bound.editor) return;
  SchemeApp.bound.editor = true;

  var input = document.getElementById("sql-input");
  var highlight = document.getElementById("sql-highlight");
  var completions = document.getElementById("sql-completions");
  var diagnostics = document.getElementById("editor-diagnostics");
  if (!input || !highlight || !completions || !diagnostics) return;

  var KEYWORD_LIST = SchemeApp.KEYWORDS || [];
  var KEYWORDS = {};
  for (var kw = 0; kw < KEYWORD_LIST.length; kw++) KEYWORDS[KEYWORD_LIST[kw]] = true;

  function escapeHTML(value) {
    var element = document.createElement("div");
    element.textContent = value;
    return element.innerHTML;
  }

  function isKnownTable(word) {
    var schema = SchemeApp.getState().schema;
    if (!schema || !schema.tables) return false;
    for (var tableIndex = 0; tableIndex < schema.tables.length; tableIndex++) {
      if (schema.tables[tableIndex].name === word) return true;
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // Syntax highlighting — a character scanner (no regex backslash escapes).
  // -------------------------------------------------------------------------

  function highlightSQL(text) {
    var out = [];
    var index = 0;
    var length = text.length;
    while (index < length) {
      var ch = text.charAt(index);
      var next = text.charAt(index + 1);

      if (ch === " " || ch === "\\t" || ch === "\\n" || ch === "\\r") {
        var whitespaceStart = index;
        while (index < length) {
          var wschar = text.charAt(index);
          if (wschar !== " " && wschar !== "\\t" && wschar !== "\\n" && wschar !== "\\r") break;
          index++;
        }
        out.push(escapeHTML(text.slice(whitespaceStart, index)));
        continue;
      }

      if (ch === "-" && next === "-") {
        var commentStart = index;
        while (index < length && text.charAt(index) !== "\\n") index++;
        out.push('<span class="tok-comment">' + escapeHTML(text.slice(commentStart, index)) + "</span>");
        continue;
      }

      if (ch === "/" && next === "*") {
        var blockStart = index;
        index += 2;
        while (index < length && !(text.charAt(index) === "*" && text.charAt(index + 1) === "/")) index++;
        index = Math.min(index + 2, length);
        out.push('<span class="tok-comment">' + escapeHTML(text.slice(blockStart, index)) + "</span>");
        continue;
      }

      if (ch === "'" || ch === '"' || ch === "\`") {
        var quote = ch;
        var stringStart = index;
        index++;
        while (index < length) {
          if (text.charAt(index) === quote) {
            if (text.charAt(index + 1) === quote) { index += 2; continue; }
            index++;
            break;
          }
          index++;
        }
        out.push('<span class="tok-string">' + escapeHTML(text.slice(stringStart, index)) + "</span>");
        continue;
      }

      if (ch === "[") {
        var bracketStart = index;
        index++;
        while (index < length && text.charAt(index) !== "]") index++;
        index++;
        out.push('<span class="tok-string">' + escapeHTML(text.slice(bracketStart, index)) + "</span>");
        continue;
      }

      if (/[0-9]/.test(ch)) {
        var numberStart = index;
        var seenDot = false;
        while (index < length) {
          var numberChar = text.charAt(index);
          if (/[0-9]/.test(numberChar)) { index++; continue; }
          if (numberChar === "." && !seenDot) { seenDot = true; index++; continue; }
          break;
        }
        out.push('<span class="tok-number">' + escapeHTML(text.slice(numberStart, index)) + "</span>");
        continue;
      }

      var operatorChars = "*+-/%<>=!();,.";
      if (operatorChars.indexOf(ch) !== -1) {
        var operatorStart = index;
        index++;
        if ((ch === "<" || ch === ">" || ch === "!") && text.charAt(index) === "=") index++;
        else if (ch === "<" && text.charAt(index) === ">") index++;
        out.push('<span class="tok-operator">' + escapeHTML(text.slice(operatorStart, index)) + "</span>");
        continue;
      }

      if (/[A-Za-z_]/.test(ch)) {
        var identifierStart = index;
        while (index < length && /[A-Za-z0-9_]/.test(text.charAt(index))) index++;
        var word = text.slice(identifierStart, index);
        var upper = word.toUpperCase();
        if (KEYWORDS[upper]) {
          out.push('<span class="tok-keyword">' + escapeHTML(word) + "</span>");
        } else if (isKnownTable(word)) {
          out.push('<span class="tok-table">' + escapeHTML(word) + "</span>");
        } else {
          out.push('<span class="tok-ident">' + escapeHTML(word) + "</span>");
        }
        continue;
      }

      out.push(escapeHTML(ch));
      index++;
    }
    return out.join("");
  }

  // -------------------------------------------------------------------------
  // Diagnostics — parenthesised quotes and unterminated literals/comments.
  // -------------------------------------------------------------------------

  function computeDiagnostics() {
    var text = input.value;
    var messages = [];
    var index = 0;
    var length = text.length;
    var parens = 0;
    var stringOpen = false;
    var commentOpen = false;

    while (index < length) {
      var ch = text.charAt(index);
      var next = text.charAt(index + 1);

      if (ch === "-" && next === "-") {
        while (index < length && text.charAt(index) !== "\\n") index++;
        continue;
      }
      if (ch === "/" && next === "*") {
        commentOpen = true;
        index += 2;
        while (index < length && !(text.charAt(index) === "*" && text.charAt(index + 1) === "/")) index++;
        if (index < length) { commentOpen = false; index += 2; }
        else index = length;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === "\`") {
        var quote = ch;
        var closed = false;
        index++;
        while (index < length) {
          if (text.charAt(index) === quote) {
            if (text.charAt(index + 1) === quote) { index += 2; continue; }
            closed = true;
            index++;
            break;
          }
          index++;
        }
        if (!closed) stringOpen = true;
        continue;
      }
      if (ch === "(") { parens++; index++; continue; }
      if (ch === ")") { parens--; index++; continue; }
      index++;
    }

    if (stringOpen) messages.push({ kind: "warn", text: "Unterminated string literal." });
    if (commentOpen) messages.push({ kind: "warn", text: "Unterminated block comment." });
    if (parens !== 0) messages.push({ kind: "warn", text: "Unbalanced parentheses — " + parens + " open." });
    return messages;
  }

  function refreshDiagnostics() {
    var messages = computeDiagnostics();
    var html = "";
    for (var diagIndex = 0; diagIndex < messages.length; diagIndex++) {
      html += '<div class="diag diag-' + messages[diagIndex].kind + '">' + messages[diagIndex].text + "</div>";
    }
    if (messages.length) {
      diagnostics.innerHTML = html;
      diagnostics.hidden = false;
    } else {
      hideDiagnostics();
    }
  }

  function hideDiagnostics() {
    diagnostics.hidden = true;
    diagnostics.innerHTML = "";
  }

  // -------------------------------------------------------------------------
  // Completion — Ctrl+Space or after a typed prefix. Keyword + table + column.
  // -------------------------------------------------------------------------

  var completionItems = [];
  var completionIndex = 0;
  var completionTimer = null;

  function wordBeforeCaret() {
    var value = input.value;
    var caret = input.selectionStart;
    var start = caret;
    while (start > 0 && /[A-Za-z0-9_]/.test(value.charAt(start - 1))) start--;
    return { start: start, end: caret, word: value.slice(start, caret) };
  }

  function candidatesFor(prefix) {
    var all = SchemeApp.completionCandidates();
    var lower = prefix.toLowerCase();
    var exact = [];
    var starts = [];
    var contains = [];
    for (var index = 0; index < all.length; index++) {
      var candidate = all[index];
      var lowerCandidate = candidate.toLowerCase();
      if (lowerCandidate === lower) exact.push(candidate);
      else if (lowerCandidate.indexOf(lower) === 0) starts.push(candidate);
      else if (lower.length > 0 && lowerCandidate.indexOf(lower) > 0) contains.push(candidate);
    }
    return exact.concat(starts, contains).slice(0, 50);
  }

function positionCompletion() {
    var caret = input.selectionStart;
    var before = input.value.slice(0, caret);
    var lines = before.split("\\n");
    var row = lines.length - 1;
    var column = lines[lines.length - 1].length;
    var lineHeight = 20;
    var paddingTop = 12;
    var dropdownHeight = Math.min(220, completionItems.length * 26 + 12);
    var shellHeight = input.clientHeight;
    // Anchor below the caret line so the line being edited stays visible;
    // flip above the line when there is no room below.
    var top = paddingTop + row * lineHeight - input.scrollTop;
    if (top + lineHeight + dropdownHeight > shellHeight - paddingTop) {
      top = top - dropdownHeight;
      if (top < paddingTop) top = paddingTop;
    } else {
      top = top + lineHeight + 4;
    }
    var left = Math.min(column * 8, Math.max(0, input.clientWidth - 260));
    completions.style.top = top + "px";
    completions.style.left = left + "px";
  }

  function renderCompletionList() {
    var html = "";
    for (var itemIndex = 0; itemIndex < completionItems.length; itemIndex++) {
      var activeClass = itemIndex === completionIndex ? " active" : "";
      html += '<div class="completion-item' + activeClass + '" data-index="' + itemIndex + '">' +
        escapeHTML(completionItems[itemIndex]) + "</div>";
    }
    completions.innerHTML = html;
  }

  function showCompletion(prefix) {
    var items = candidatesFor(prefix);
    if (!items.length) { hideCompletion(); return; }
    completionItems = items;
    completionIndex = 0;
    renderCompletionList();
    completions.hidden = false;
    positionCompletion();
  }

  function hideCompletion() {
    completions.hidden = true;
    completions.innerHTML = "";
  }

  function acceptCompletion(index) {
    var item = completionItems[index];
    if (!item) { hideCompletion(); return; }
    var info = wordBeforeCaret();
    var value = input.value;
    input.value = value.slice(0, info.start) + item + value.slice(info.end);
    var caret = info.start + item.length;
    input.setSelectionRange(caret, caret);
    refreshHighlight();
    hideCompletion();
  }

  function scheduleCompletion() {
    if (completionTimer) clearTimeout(completionTimer);
    var info = wordBeforeCaret();
    if (info.word.length >= 2) {
      completionTimer = setTimeout(function () { showCompletion(info.word); }, 180);
    } else {
      hideCompletion();
    }
  }

  // -------------------------------------------------------------------------
  // Editor plumbing
  // -------------------------------------------------------------------------

  function refreshHighlight() {
    highlight.innerHTML = highlightSQL(input.value);
  }

  function syncScroll() {
    highlight.scrollTop = input.scrollTop;
    highlight.scrollLeft = input.scrollLeft;
  }

  function insertAtCaret(text) {
    var start = input.selectionStart;
    var end = input.selectionEnd;
    input.value = input.value.slice(0, start) + text + input.value.slice(end);
    var caret = start + text.length;
    input.setSelectionRange(caret, caret);
    refreshHighlight();
  }

  function runQueryFromEditor() {
    SchemeApp.runQuery(input.value);
  }

  input.addEventListener("scroll", syncScroll);
  input.addEventListener("input", function () {
    // A fresh edit supersedes the last runtime error shown below the editor.
    if (SchemeApp.clearQueryError) SchemeApp.clearQueryError();
    refreshHighlight();
    refreshDiagnostics();
    scheduleCompletion();
  });

  input.addEventListener("keydown", function (event) {
    if (event.ctrlKey && event.key === "Enter") {
      event.preventDefault();
      runQueryFromEditor();
      return;
    }
    if (event.ctrlKey && (event.key === " " || event.code === "Space")) {
      event.preventDefault();
      var info = wordBeforeCaret();
      showCompletion(info.word);
      return;
    }
    if (!completions.hidden) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (completionItems.length) completionIndex = (completionIndex + 1) % completionItems.length;
        renderCompletionList();
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (completionItems.length) completionIndex = (completionIndex - 1 + completionItems.length) % completionItems.length;
        renderCompletionList();
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        if (completionItems.length) {
          event.preventDefault();
          acceptCompletion(completionIndex);
          return;
        }
      }
    }
    // Escape first closes the completions dropdown, then the diagnostics
    // popup — both stay hidden until the next edit restores them.
    if (event.key === "Escape") {
      hideDiagnostics();
      if (!completions.hidden) hideCompletion();
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      insertAtCaret("  ");
    }
  });

  completions.addEventListener("mousedown", function (event) {
    var item = event.target.closest ? event.target.closest(".completion-item") : null;
    if (!item) return;
    event.preventDefault();
    acceptCompletion(Number(item.dataset.index));
  });

  var clearButton = document.getElementById("button-clear-editor");
  if (clearButton) {
    clearButton.addEventListener("click", function () {
      input.value = "";
      hideCompletion();
      refreshHighlight();
      refreshDiagnostics();
      if (SchemeApp.clearQueryError) SchemeApp.clearQueryError();
      input.focus();
    });
  }

  // A window resize invalidates the completion dropdown's absolute position —
  // hide it and let the next keystroke re-open it at the new geometry.
  window.addEventListener("resize", hideCompletion);

  refreshHighlight();
  refreshDiagnostics();
})();
`;
