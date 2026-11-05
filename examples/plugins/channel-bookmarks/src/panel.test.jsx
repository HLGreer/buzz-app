// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import * as React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { apply } from "../dist/plugin.js";
import { readBookmarks } from "./model";

afterEach(cleanup);
function fixture() {
  let registration;
  let dispose;
  let head = {
    id: "one",
    content:
      "# Notes\nKeep me.\n\n## Channel bookmarks\n- [Docs](https://example.com/docs)\n",
  };
  let list = {
    channels: [
      { id: "alpha", members: ["viewer"], cached: false, readOnly: false },
    ],
  };
  const listeners = new Set();
  const canvas = {
    available: true,
    read: vi.fn(async () => head),
    save: vi.fn(async (_id, content, expected) => {
      if (head.id !== expected) {
        const error = new Error("Conflict");
        error.name = "CanvasConflictError";
        throw error;
      }
      head = { id: `${head.id}-next`, content };
      return head;
    }),
  };
  const state = {
    status: "ready",
    scope: "primary:viewer",
    generation: 1,
    session: {
      viewer: "viewer",
      canvas,
      channels: {
        list: () => list,
        subscribeList: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      },
    },
  };
  apply({
    react: React,
    effect: (effect) => {
      dispose = effect();
    },
    panels: {
      register: (panel) => {
        registration = panel;
      },
    },
    relay: { snapshot: () => state, subscribe: () => () => {} },
  });
  const Panel = registration.component;
  render(<Panel channelContext={{ scope: state.scope, channelId: "alpha" }} />);
  return {
    canvas,
    registration,
    dispose: () => dispose(),
    head: () => head,
    changeHead: () => {
      head = {
        ...head,
        id: "external",
        content: `${head.content}\n## Other\nConcurrent notes.\n`,
      };
    },
    access: (change) =>
      act(() => {
        list = {
          channels: list.channels.map((channel) => ({ ...channel, ...change })),
        };
        for (const listener of listeners) listener();
      }),
  };
}
async function fill(user, label, url) {
  await user.clear(screen.getByRole("textbox", { name: "Bookmark name" }));
  await user.type(
    screen.getByRole("textbox", { name: "Bookmark name" }),
    label,
  );
  await user.clear(screen.getByRole("textbox", { name: "Bookmark URL" }));
  await user.type(screen.getByRole("textbox", { name: "Bookmark URL" }), url);
}
it("registers only an existing channel panel and fences its launcher after disposal", async () => {
  const f = fixture();
  expect(f.registration.channelPlacement).toBe("side");
  const toggle = vi.fn();
  const Launcher = f.registration.channelLauncher;
  render(
    <Launcher
      context={{ channelId: "alpha" }}
      toggle={toggle}
      pressed={false}
      available={() => true}
    />,
  );
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: "Toggle channel bookmarks" }),
  );
  expect(toggle).toHaveBeenCalledWith("alpha");
  f.dispose();
  await user.click(
    screen.getByRole("button", { name: "Toggle channel bookmarks" }),
  );
  expect(toggle).toHaveBeenCalledTimes(1);
});
it("adds, edits, reorders, and removes shared links while preserving other Canvas sections", async () => {
  const f = fixture();
  const user = userEvent.setup();
  await screen.findByRole("link", { name: "Docs" });
  await fill(user, "API", "https://example.com/api");
  await user.click(screen.getByRole("button", { name: "Add bookmark" }));
  await screen.findByRole("link", { name: "API" });
  await user.click(screen.getByRole("button", { name: "Edit API" }));
  await fill(user, "Reference", "https://example.com/ref");
  await user.click(screen.getByRole("button", { name: "Save bookmark" }));
  await screen.findByRole("link", { name: "Reference" });
  await user.click(screen.getByRole("button", { name: "Move Reference up" }));
  await waitFor(() =>
    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual(
      ["Reference", "Docs"],
    ),
  );
  await user.click(screen.getByRole("button", { name: "Remove Docs" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("link", { name: "Docs" }),
    ).not.toBeInTheDocument(),
  );
  expect(
    screen.getByRole("button", { name: "Refresh bookmarks" }),
  ).toHaveFocus();
  expect(readBookmarks(f.head().content).items).toEqual([
    { label: "Reference", url: "https://example.com/ref" },
  ]);
  expect(f.head().content).toContain("# Notes\nKeep me.");
  for (const call of f.canvas.save.mock.calls) {
    expect(call[3]).toEqual({ preserveApproval: true });
  }
});
it("preserves typed input on conflict and reloads the latest Canvas before resubmission", async () => {
  const f = fixture();
  const user = userEvent.setup();
  await screen.findByRole("link", { name: "Docs" });
  await fill(user, "API", "https://example.com/api");
  f.changeHead();
  await user.click(screen.getByRole("button", { name: "Add bookmark" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Canvas changed elsewhere",
  );
  expect(screen.getByRole("textbox", { name: "Bookmark name" })).toHaveValue(
    "API",
  );
  expect(screen.getByRole("button", { name: "Add bookmark" })).toBeDisabled();
  await user.click(screen.getByRole("button", { name: "Refresh bookmarks" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Add bookmark" })).toBeEnabled(),
  );
  await user.click(screen.getByRole("button", { name: "Add bookmark" }));
  await screen.findByRole("link", { name: "API" });
  expect(f.head().content).toContain("## Other\nConcurrent notes.");
});
it("keeps read-only links but hides editing and revoked data", async () => {
  const f = fixture();
  await screen.findByRole("link", { name: "Docs" });
  f.access({ readOnly: true });
  expect(screen.getByRole("link", { name: "Docs" })).toBeVisible();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  f.access({ members: [] });
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(f.canvas.save).not.toHaveBeenCalled();
});
it("keeps failed input and ignores a detached read", async () => {
  const f = fixture();
  const user = userEvent.setup();
  await screen.findByRole("link", { name: "Docs" });
  f.canvas.save.mockRejectedValueOnce(new Error("Offline"));
  await fill(user, "API", "https://example.com/api");
  await user.click(screen.getByRole("button", { name: "Add bookmark" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Offline");
  expect(screen.getByRole("textbox", { name: "Bookmark name" })).toHaveValue(
    "API",
  );
  let release;
  f.canvas.read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  await user.click(screen.getByRole("button", { name: "Refresh bookmarks" }));
  cleanup();
  await act(async () => release(f.head()));
  expect(screen.queryByRole("region")).not.toBeInTheDocument();
});

it("uses the host tooltip bubble and dismisses it on leave, Escape, click, and unmount", async () => {
  const f = fixture();
  const Launcher = f.registration.channelLauncher;
  const toggle = vi.fn();
  const view = render(
    <Launcher
      context={{ channelId: "alpha" }}
      toggle={toggle}
      pressed={false}
      available={() => true}
    />,
  );
  const user = userEvent.setup();
  const button = screen.getByRole("button", {
    name: "Toggle channel bookmarks",
  });
  expect(button).not.toHaveAttribute("title");
  await user.hover(button);
  const hint = await screen.findByRole("tooltip", { name: "Bookmarks" });
  expect(hint).toHaveClass("buzz-tooltip");
  expect(button).toHaveAttribute("aria-describedby", hint.id);
  await user.unhover(button);
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  act(() => button.focus());
  expect(screen.getByRole("tooltip")).toHaveTextContent("Bookmarks");
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  fireEvent.pointerEnter(button);
  await screen.findByRole("tooltip");
  await user.click(button);
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  expect(toggle).toHaveBeenCalledWith("alpha");
  await user.unhover(button);
  await user.hover(button);
  await screen.findByRole("tooltip");
  view.unmount();
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
});
it("cancels a pending hint when its launcher unmounts", () => {
  vi.useFakeTimers();
  try {
    const f = fixture();
    const Launcher = f.registration.channelLauncher;
    const view = render(
      <Launcher
        context={{ channelId: "alpha" }}
        toggle={() => {}}
        pressed={false}
        available={() => true}
      />,
    );
    fireEvent.pointerEnter(
      screen.getByRole("button", { name: "Toggle channel bookmarks" }),
    );
    view.unmount();
    act(() => vi.runAllTimers());
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});
