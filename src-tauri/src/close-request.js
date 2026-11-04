// Evaluated only in the trusted main webview by the macOS Close/Close All Tabs menus.
// Native code binds `tabEvent` to the requested close action.
// An unhandled Close request lets native code close the window; Close All Tabs never does.
(() => {
  if (document.querySelector('dialog[open], [aria-modal="true"]'))
    return "handled";
  const target =
    typeof browserSessionId === "string"
      ? document.querySelector(
          `[data-browser-session="${CSS.escape(browserSessionId)}"]`,
        )
      : window;
  if (!target) return "unhandled";
  const request = new Event(tabEvent, { cancelable: true, bubbles: true });
  target.dispatchEvent(request);
  return request.defaultPrevented ? "handled" : "unhandled";
})();
