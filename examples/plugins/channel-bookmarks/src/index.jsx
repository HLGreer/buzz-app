import { bookmark, readBookmarks, writeBookmarks } from "./model";

export const inject = ["react", "panels", "relay"];

export function apply(ctx) {
  const React = ctx.react;
  let enabled = true;
  ctx.effect(() => () => {
    enabled = false;
  });
  const gap = {
    display: "flex",
    flexDirection: "column",
    gap: "var(--space-3)",
  };
  const row = {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "var(--space-1)",
  };
  // External plugins use the host's exposed control roles and layout tokens.
  function Button({ children, primary = false, ...props }) {
    return (
      <button
        type="button"
        data-buzz-ui=""
        className="buzz-button"
        data-size="sm"
        data-variant={primary ? "prominent" : "subtle"}
        data-button-shape="capsule"
        {...props}
      >
        <span className="buzz-button-label">{children}</span>
      </button>
    );
  }
  function Launcher({ context, toggle, pressed, available }) {
    const trigger = React.useRef(null);
    const tooltipId = React.useId();
    React.useEffect(() => {
      const button = trigger.current;
      if (!button || pressed) return;
      let timer;
      let popup;
      let dismissed = false;
      const hide = () => {
        clearTimeout(timer);
        popup?.remove();
        popup = undefined;
        button.removeAttribute("aria-describedby");
      };
      const show = () => {
        if (!enabled || !available() || dismissed || popup) return;
        popup = document.createElement("div");
        popup.className = "buzz-tooltip-positioner";
        Object.assign(popup.style, {
          position: "fixed",
          pointerEvents: "none",
        });
        const bubble = document.createElement("div");
        bubble.id = tooltipId;
        bubble.className = "buzz-tooltip";
        bubble.setAttribute("role", "tooltip");
        bubble.setAttribute("data-buzz-ui", "");
        bubble.textContent = "Bookmarks";
        popup.append(bubble);
        document.body.append(popup);
        const anchor = button.getBoundingClientRect();
        const bounds = popup.getBoundingClientRect();
        // Match the host tooltip's 4px offset and 8px collision padding.
        const left = Math.max(
          8,
          Math.min(
            anchor.left + (anchor.width - bounds.width) / 2,
            window.innerWidth - bounds.width - 8,
          ),
        );
        const below = anchor.bottom + 4;
        const top =
          below + bounds.height <= window.innerHeight - 8
            ? below
            : Math.max(8, anchor.top - bounds.height - 4);
        Object.assign(popup.style, { left: `${left}px`, top: `${top}px` });
        button.setAttribute("aria-describedby", tooltipId);
      };
      const rest = () => {
        if (!popup && !dismissed) {
          clearTimeout(timer);
          timer = setTimeout(show, 250);
        }
      };
      const enter = () => {
        dismissed = false;
        rest();
      };
      const leave = () => {
        dismissed = false;
        hide();
      };
      const focus = () => {
        if (!dismissed) show();
      };
      const dismiss = () => {
        dismissed = true;
        hide();
      };
      const key = (event) => {
        if (event.key === "Tab") dismissed = false;
        if (event.key === "Escape") dismiss();
      };
      const events = {
        pointerenter: enter,
        pointermove: rest,
        pointerleave: leave,
        focus,
        blur: hide,
        pointerdown: dismiss,
        click: dismiss,
      };
      for (const [name, listener] of Object.entries(events))
        button.addEventListener(name, listener);
      window.addEventListener("keydown", key);
      window.addEventListener("scroll", hide, true);
      window.addEventListener("resize", hide);
      return () => {
        hide();
        for (const [name, listener] of Object.entries(events))
          button.removeEventListener(name, listener);
        window.removeEventListener("keydown", key);
        window.removeEventListener("scroll", hide, true);
        window.removeEventListener("resize", hide);
      };
    }, [pressed, available, tooltipId]);
    return (
      <button
        ref={trigger}
        tabIndex={0}
        type="button"
        className="buzz-button"
        data-buzz-ui=""
        data-size="sm"
        data-icon-variant="ghost"
        data-icon-size="sm"
        data-icon-shape="control"
        data-variant="ghost"
        aria-label="Toggle channel bookmarks"
        aria-expanded={pressed}
        onClick={(event) => {
          event.currentTarget.focus();
          if (enabled && available()) toggle(context.channelId);
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M18 7v14l-6 -4l-6 4v-14a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4" />
        </svg>
      </button>
    );
  }
  function Editor({ session, channelId, active }) {
    const channels = React.useSyncExternalStore(
      session.channels.subscribeList,
      session.channels.list,
    );
    const channel = channels.channels.find((item) => item.id === channelId);
    const canRead =
      !!channel &&
      !channel.cached &&
      !!channel.members?.includes(session.viewer ?? "");
    const canWrite =
      canRead &&
      !channel.archived &&
      !channel.readOnly &&
      session.canvas.available;
    const [saved, setSaved] = React.useState();
    const [busy, setBusy] = React.useState(false);
    const [error, setError] = React.useState("");
    const [conflict, setConflict] = React.useState(false);
    const [editing, setEditing] = React.useState();
    const [label, setLabel] = React.useState("");
    const [url, setUrl] = React.useState("");
    const nameId = React.useId();
    const urlId = React.useId();
    const operation = React.useRef(0);
    const working = React.useRef(false);
    const current = React.useRef({ active, canRead, canWrite });
    current.current = { active, canRead, canWrite };
    const refreshButton = React.useRef(null);
    const origin = React.useRef(null);
    React.useLayoutEffect(() => {
      if (
        origin.current &&
        !origin.current.isConnected &&
        document.activeElement === document.body
      )
        refreshButton.current?.focus();
      origin.current = null;
    });
    const valid = React.useCallback(
      (generation) =>
        operation.current === generation &&
        current.current.active() &&
        current.current.canRead,
      [],
    );
    const load = React.useCallback(async () => {
      if (
        working.current ||
        !current.current.active() ||
        !current.current.canRead
      )
        return;
      const generation = ++operation.current;
      working.current = true;
      setBusy(true);
      setError("");
      try {
        const head = await session.canvas.read(channelId);
        const items = readBookmarks(head?.content ?? "").items;
        if (!valid(generation)) return;
        setSaved({ content: head?.content ?? "", id: head?.id, items });
        setEditing(undefined);
        setConflict(false);
      } catch (reason) {
        if (valid(generation)) {
          setSaved(undefined);
          setError(String(reason));
        }
      } finally {
        if (generation === operation.current) {
          working.current = false;
          setBusy(false);
        }
      }
    }, [session, channelId, valid]);
    React.useEffect(() => {
      if (canRead) void load();
      return () => {
        operation.current++;
        working.current = false;
      };
    }, [load, canRead]);
    async function save(items, clear = false) {
      if (
        !saved ||
        working.current ||
        conflict ||
        !current.current.active() ||
        !current.current.canWrite
      )
        return;
      const trigger = document.activeElement;
      const generation = ++operation.current;
      working.current = true;
      setBusy(true);
      setError("");
      try {
        const content = writeBookmarks(saved.content, items);
        const head = await session.canvas.save(channelId, content, saved.id);
        if (!valid(generation)) return;
        origin.current = trigger;
        setSaved({
          content: head.content,
          id: head.id,
          items: readBookmarks(head.content).items,
        });
        setEditing(undefined);
        if (clear) {
          setLabel("");
          setUrl("");
        }
      } catch (reason) {
        if (valid(generation)) {
          const changed = reason?.name === "CanvasConflictError";
          setConflict(changed);
          setError(
            changed
              ? "Canvas changed elsewhere. Refresh before saving again. Your input is kept."
              : `Couldn’t save. ${reason?.message ?? String(reason)}`,
          );
        }
      } finally {
        if (generation === operation.current) {
          working.current = false;
          setBusy(false);
        }
      }
    }
    function move(index, direction) {
      const items = [...saved.items];
      const other = items[index + direction];
      if (!other) return;
      [items[index], items[index + direction]] = [other, items[index]];
      void save(items);
    }
    if (!canRead)
      return (
        <p role="status">
          Bookmarks are unavailable until channel access is confirmed.
        </p>
      );
    const disabled = busy || !saved || conflict || !canWrite;
    return (
      <section
        aria-label="Channel bookmarks"
        aria-busy={busy}
        style={{ ...gap, padding: "var(--space-panel-inset)", minWidth: 0 }}
      >
        <p>
          Shared links for this channel. Refresh to load other members’ changes.
        </p>
        <div style={row}>
          <Button
            ref={refreshButton}
            disabled={busy}
            onClick={() => void load()}
          >
            Refresh bookmarks
          </Button>
        </div>
        {busy && <p role="status">Loading or saving bookmarks…</p>}
        {error && <p role="alert">{error}</p>}
        {saved && !saved.items.length && (
          <p>No bookmarks yet. Add a link below.</p>
        )}
        {saved?.items.map((item, index) => (
          <div key={item.url} style={gap}>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ overflowWrap: "anywhere" }}
            >
              {item.label}
            </a>
            {canWrite && (
              <div style={row}>
                <Button
                  disabled={disabled}
                  aria-label={`Edit ${item.label}`}
                  onClick={() => {
                    setEditing(index);
                    setLabel(item.label);
                    setUrl(item.url);
                  }}
                >
                  Edit
                </Button>
                <Button
                  disabled={disabled || editing !== undefined || index === 0}
                  aria-label={`Move ${item.label} up`}
                  onClick={() => move(index, -1)}
                >
                  Move up
                </Button>
                <Button
                  disabled={
                    disabled ||
                    editing !== undefined ||
                    index === saved.items.length - 1
                  }
                  aria-label={`Move ${item.label} down`}
                  onClick={() => move(index, 1)}
                >
                  Move down
                </Button>
                <Button
                  disabled={disabled || editing !== undefined}
                  aria-label={`Remove ${item.label}`}
                  onClick={() =>
                    void save(saved.items.filter((_, i) => i !== index))
                  }
                >
                  Remove
                </Button>
              </div>
            )}
          </div>
        ))}
        {canWrite && (
          <form
            style={gap}
            onSubmit={(event) => {
              event.preventDefault();
              if (disabled || !saved) return;
              try {
                const item = bookmark(label, url);
                const items = [...saved.items];
                if (editing === undefined) items.push(item);
                else items[editing] = item;
                void save(items, true);
              } catch (reason) {
                setError(String(reason));
              }
            }}
          >
            <div className="buzz-field" data-buzz-ui="" style={gap}>
              <label htmlFor={nameId} className="buzz-field-label">
                Bookmark name
              </label>
              <input
                id={nameId}
                className="buzz-input"
                data-buzz-ui=""
                data-size="md"
                value={label}
                disabled={busy}
                onChange={(event) => setLabel(event.target.value)}
              />
            </div>
            <div className="buzz-field" data-buzz-ui="" style={gap}>
              <label htmlFor={urlId} className="buzz-field-label">
                Bookmark URL
              </label>
              <input
                id={urlId}
                className="buzz-input"
                data-buzz-ui=""
                data-size="md"
                value={url}
                disabled={busy}
                onChange={(event) => setUrl(event.target.value)}
              />
            </div>
            <div style={row}>
              {editing !== undefined && (
                <Button
                  disabled={busy}
                  onClick={() => {
                    setEditing(undefined);
                    setLabel("");
                    setUrl("");
                  }}
                >
                  Cancel edit
                </Button>
              )}
              <Button type="submit" primary disabled={disabled}>
                {editing === undefined ? "Add bookmark" : "Save bookmark"}
              </Button>
            </div>
          </form>
        )}
      </section>
    );
  }
  function Panel({ channelContext }) {
    const state = React.useSyncExternalStore(
      ctx.relay.subscribe,
      ctx.relay.snapshot,
    );
    const active = React.useCallback(
      () => enabled && ctx.relay.snapshot() === state,
      [state],
    );
    if (
      !channelContext ||
      state.status !== "ready" ||
      state.scope !== channelContext.scope
    )
      return <p role="status">Connect to this channel to view bookmarks.</p>;
    return (
      <Editor
        key={`${state.scope}:${state.generation}:${channelContext.channelId}`}
        session={state.session}
        channelId={channelContext.channelId}
        active={active}
      />
    );
  }
  ctx.panels.register({
    id: "bookmarks",
    title: "Bookmarks",
    matches: () => false,
    channelLauncher: Launcher,
    channelPlacement: "side",
    component: Panel,
  });
}
