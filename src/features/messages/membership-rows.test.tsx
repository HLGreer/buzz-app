// @vitest-environment jsdom
import { assert, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { profileTarget } from "../profiles/target";
import type { ChannelMessage, MembershipChange } from "../relay/contracts";
import {
  membershipRows,
  membershipDescription,
  renderedRowIndex,
  withoutStartingAgents,
} from "./membership-rows";
import { MembershipRow } from "./MembershipRow";
import { geometrySignature } from "./geometry";
const wen = "a".repeat(64),
  pippa = "b".repeat(64),
  brann = "c".repeat(64);
const profiles = new Map([
  [wen, { name: "Wen" }],
  [pippa, { name: "Pippa" }],
  [brann, { name: "Brann" }],
]);
function row(
  id: string,
  membership?: MembershipChange,
  createdAt = 100,
): ChannelMessage {
  return {
    id,
    channelId: "a",
    authorId: "relay",
    content: "",
    createdAt,
    ...(membership ? { membership } : {}),
    mentions: [],
    attachments: [],
    reactions: [],
    replyCount: 0,
    participants: [],
  };
}
const joined = (actor: string, target: string): MembershipChange => ({
  type: "member_joined",
  actor,
  target,
});
const left = (target: string): MembershipChange => ({
  type: "member_left",
  actor: target,
  target,
});
const removed = (actor: string, target: string): MembershipChange => ({
  type: "member_removed",
  actor,
  target,
});
it("matches the grouped invitation wording and keeps pronouns grammatical", () => {
  expect(
    membershipDescription(
      [row("1", joined(wen, pippa)), row("2", joined(wen, brann))],
      profiles,
      wen,
    ).text,
  ).toBe("Pippa added by you, along with Brann");
  expect(
    membershipDescription([row("1", joined(pippa, wen))], profiles, wen).text,
  ).toBe("You were added by Pippa");
  // Every member name, and only a member name, is tagged with its identity.
  expect(
    membershipDescription(
      [row("1", joined(wen, pippa)), row("2", joined(wen, brann))],
      profiles,
      wen,
    ).parts,
  ).toEqual([
    { id: pippa, text: "Pippa" },
    { text: " added by " },
    { id: wen, text: "you" },
    { text: ", along with " },
    { id: brann, text: "Brann" },
  ]);
  expect(
    membershipDescription([row("1", removed(pippa, wen))], profiles, wen).text,
  ).toBe("You were removed by Pippa");
});
it("groups removals without attributing a removal to the wrong actor", () => {
  const rows = [row("3", removed(wen, pippa)), row("4", removed(brann, wen))];
  expect(membershipRows(rows).map((r) => r.id)).toEqual(["4"]);
  const summary = membershipDescription(rows, profiles);
  expect(summary.text).toBe("Pippa and 1 other were removed");
  expect(summary.title).toContain("Pippa was removed by Wen");
  expect(summary.title).toContain("Wen was removed by Brann");
});
it("only conversation entries break membership groups; long gaps and midnight keep stable keys", () => {
  const a = row("a", joined(wen, pippa), 200),
    b = row("b", joined(wen, brann), 210);
  expect(membershipRows([a, b]).map((r) => r.id)).toEqual(["b"]);
  const old = row("old", joined(pippa, pippa), 100);
  expect(membershipRows([old, a, b]).map((r) => r.id)).toEqual(["b"]);
  expect(membershipRows([a, row("chat"), b])).toHaveLength(3);
  expect(
    membershipRows([a, { ...b, createdAt: a.createdAt + 3601 }]),
  ).toHaveLength(1);
  expect(
    membershipRows([a, { ...b, createdAt: a.createdAt + 3600 }]),
  ).toHaveLength(1);
  const midnight = new Date(2026, 8, 12).getTime() / 1000;
  expect(
    membershipRows([
      { ...a, createdAt: midnight - 1 },
      { ...b, createdAt: midnight },
    ]),
  ).toHaveLength(1);
});
it("hides self-joins and voluntary leaves before grouping, preserving messages and visible keys", () => {
  const hidden = [row("join", joined(pippa, pippa)), row("leave", left(pippa))];
  expect(membershipRows(hidden)).toEqual([]);
  expect(membershipDescription(hidden, profiles).text).toBe("");
  const addition = row("added", joined(wen, pippa));
  const removal = row("removed", removed(wen, brann));
  const message = row("message");
  expect(membershipRows([addition, ...hidden])).toEqual([addition]);
  expect(
    membershipRows([addition, ...hidden, removal])[0]?.membershipRows,
  ).toEqual([addition, removal]);
  expect(membershipRows([addition, ...hidden, message, removal])).toEqual([
    addition,
    message,
    removal,
  ]);
});
it("resolves a saved anchor on a hidden membership event to the nearest rendered row", () => {
  const first = row("first");
  const join = row("join", joined(pippa, pippa));
  const addition = row("added", joined(wen, pippa));
  const leave = row("leave", left(brann));
  const removal = row("removed", removed(wen, brann));
  const events = [first, join, addition, leave, removal];
  const rows = membershipRows(events);
  expect(rows.map(({ id }) => id)).toEqual(["first", "removed"]);
  expect(renderedRowIndex(rows, events, "first")).toBe(0);
  // A grouped member resolves to its group; a hidden event to the next one.
  expect(renderedRowIndex(rows, events, "added")).toBe(1);
  expect(renderedRowIndex(rows, events, "join")).toBe(1);
  // With nothing rendered after it, a hidden event resolves to the one before.
  const tail = [first, join];
  expect(renderedRowIndex(membershipRows(tail), tail, "join")).toBe(0);
  // An event that is not loaded still waits for its page.
  expect(renderedRowIndex(rows, events, "missing")).toBe(-1);
  expect(renderedRowIndex([], [join], "join")).toBe(-1);
});

it("collapses high-volume mixed activity and deduplicates repeat arrivals without swallowing messages", () => {
  const arrivals = Array.from({ length: 148 }, (_, index) => {
    const id = `member-${index}`;
    return row(String(index), joined("adder", id));
  });
  const activity = [
    ...arrivals.slice(0, 25),
    row("remove", removed(wen, pippa)),
    ...arrivals.slice(25),
    ...arrivals,
  ];
  const grouped = membershipRows([...activity, row("message")]);
  expect(grouped).toHaveLength(2);
  expect(grouped[0]?.membershipRows).toEqual(activity);
  const summary = membershipDescription(
    grouped[0]?.membershipRows ?? [],
    profiles,
  );
  expect(summary.text).toBe(
    "member-0 and 147 others were added · Pippa was removed",
  );
  const preview = summary.parts.find((part) => part.preview)?.preview;
  expect(preview?.members).toHaveLength(148);
  expect(preview?.members[0]).toEqual({ id: "member-0", name: "member-0" });
  expect(preview?.members.at(-1)).toEqual({
    id: "member-147",
    name: "member-147",
  });
  expect(summary.title).toContain("Pippa was removed by Wen");
  expect(summary.title.match(/member-0 was added by adder/g)).toHaveLength(1);
  expect(grouped[1]?.id).toBe("message");
});
it("describes each person by their latest visible change in the run", () => {
  const changes = [
    row("added", joined(wen, pippa)),
    row("removed", removed(brann, pippa)),
    row("added-back", joined(brann, pippa)),
  ];
  const group = membershipRows(changes)[0];
  expect(group?.membershipRows).toEqual(changes);
  expect(membershipDescription(changes, profiles).text).toBe(
    "Pippa added by Brann",
  );
  expect(membershipDescription(changes.slice(0, 2), profiles).text).toBe(
    "Pippa was removed by Brann",
  );
  const mixed = membershipDescription(
    [...changes, row("other-removal", removed(wen, brann))],
    profiles,
  );
  expect(mixed.text).toBe("Pippa was added · Brann was removed");
  expect(mixed.title).toBe(
    "Pippa was added by Brann; Brann was removed by Wen",
  );
  expect(mixed.targets).toEqual([pippa, brann]);
});
it("every grouped input remains represented for mixed three-event sequences", () => {
  const changes = [
    joined(wen, pippa),
    joined(brann, pippa),
    removed(wen, pippa),
    removed(brann, pippa),
  ];
  for (const a of changes)
    for (const b of changes)
      for (const c of changes) {
        const rows = [row("a", a), row("b", b), row("c", c)];
        const groups = membershipRows(rows);
        expect(groups.flatMap((r) => r.membershipRows ?? [r])).toEqual(rows);
        for (const group of groups) {
          const description = membershipDescription(
            group.membershipRows ?? [group],
            profiles,
          );
          expect(description.text).not.toBe("");
          expect(description.targets).toEqual([
            ...new Set(
              (group.membershipRows ?? [group]).map(
                (r) => r.membership?.target,
              ),
            ),
          ]);
        }
      }
});
it("keeps one visible name and a labelled overflow control with capped decorative avatars", () => {
  const rows = [pippa, brann, wen, "d".repeat(64)].map((id, i) =>
    row(String(i), joined("adder", id)),
  );
  const group = membershipRows(rows)[0];
  assert.exists(group);
  const view = render(
    <MembershipRow
      row={group}
      profiles={profiles}
      media={() => undefined}
      viewer={wen}
      day={false}
    />,
  );
  expect(view.container.querySelector("p")).toHaveTextContent(
    "Pippa and 3 others were added",
  );
  expect(screen.getByRole("button", { name: "3 others" })).toHaveAttribute(
    "aria-haspopup",
    "dialog",
  );
  expect(
    view.container.querySelector('[aria-hidden="true"]'),
  ).toHaveTextContent("+1");
  expect(view.container.querySelector("p")).toHaveAttribute(
    "title",
    "Pippa was added by adder; Brann was added by adder; You were added by adder; dddddddddd was added by adder",
  );
  view.unmount();
});
it.each([false, true])(
  "keeps small membership media requests with agent hint %s",
  (agent) => {
    const picture = "https://image.test/member.png";
    const media = vi.fn((url: string) => url);
    const html = renderToStaticMarkup(
      <MembershipRow
        row={row("join", joined(wen, pippa))}
        profiles={new Map([[pippa, { name: "Pippa", picture }]])}
        agentPubkeys={new Set(agent ? [pippa] : [])}
        media={media}
        day={false}
      />,
    );
    expect(media).toHaveBeenCalledWith(picture, "small");
    expect(html).toContain(
      `data-avatar-shape="${agent ? "squircle" : "circle"}"`,
    );
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("button");
  },
);
it("actor/subject profile enrichment invalidates cached system-row geometry", () => {
  const rows = [row("a", joined(wen, pippa))];
  const original = geometrySignature(rows, profiles);
  expect(
    geometrySignature(
      rows,
      new Map([...profiles, [pippa, { name: "Longer Pippa" }]]),
    ),
  ).not.toBe(original);
  expect(
    geometrySignature(
      rows,
      new Map([...profiles, [wen, { name: "Longer Wen" }]]),
    ),
  ).not.toBe(original);
});
it("member names open the subject's and the actor's profiles when the host can", () => {
  const open = vi.fn(() => true);
  const group = membershipRows([
    row("1", joined(wen, pippa)),
    row("2", joined(wen, brann)),
  ])[0];
  assert.exists(group);
  const mount = (canOpenLink: (target: string) => boolean) =>
    render(
      <MembershipRow
        row={group}
        profiles={profiles}
        agentPubkeys={new Set([brann])}
        media={() => undefined}
        viewer={wen}
        day={false}
        onOpenLink={open}
        canOpenLink={canOpenLink}
      />,
    );
  mount(() => true);
  const paragraph = screen.getByTitle("Pippa and Brann");
  expect(paragraph.textContent).toBe("Pippa added by you, along with Brann");
  const subject = screen.getByRole("button", { name: "View Pippa profile" });
  fireEvent.click(subject);
  expect(open).toHaveBeenLastCalledWith(profileTarget(pippa));
  // jsdom clicks never focus, so this proves the explicit focus that keeps a
  // return target for the profile tab under WebKit.
  expect(subject).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "View your profile" }));
  expect(open).toHaveBeenLastCalledWith(profileTarget(wen));
  const agent = screen.getByRole("button", { name: "View Brann profile" });
  // System notices name people as quiet text, never as mention chips.
  expect(agent).not.toHaveAttribute("data-mention-kind");
  fireEvent.click(agent);
  expect(open).toHaveBeenLastCalledWith(profileTarget(brann, { agent: true }));
  expect(screen.getAllByRole("button")).toHaveLength(3);
  cleanup();
  // A host that cannot open a profile keeps that name as plain prose.
  mount((target) => target === profileTarget(pippa));
  expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
    "Pippa",
  ]);
  expect(screen.getByTitle("Pippa and Brann").textContent).toBe(
    "Pippa added by you, along with Brann",
  );
  cleanup();
  render(
    <MembershipRow
      row={row("1", removed(pippa, brann))}
      profiles={profiles}
      media={() => undefined}
      viewer={wen}
      day={false}
      onOpenLink={open}
      canOpenLink={() => true}
    />,
  );
  expect(screen.getByTitle("Brann").textContent).toBe(
    "Brann was removed by Pippa",
  );
  fireEvent.click(screen.getByRole("button", { name: "View Pippa profile" }));
  expect(open).toHaveBeenLastCalledWith(profileTarget(pippa));
  // Without agent evidence, Brann opens as a person.
  fireEvent.click(screen.getByRole("button", { name: "View Brann profile" }));
  expect(open).toHaveBeenLastCalledWith(profileTarget(brann));
  expect(document.querySelector("[data-profile-target]")).toBeNull();
});

it("omits only the owner's starting agents once history reaches the start", () => {
  const added = (id: string, actor: string, target: string) =>
    row(id, { type: "member_joined", actor, target });
  const message = { ...row("message"), authorId: wen, content: "Hi" };
  const agents = new Set([pippa, brann]);
  const rows = [
    added("starting", wen, pippa),
    added("person", wen, "d".repeat(64)),
    added("by-agent", pippa, brann),
    message,
    added("later", wen, brann),
  ];
  expect(
    withoutStartingAgents(rows, wen, agents, true).map((row) => row.id),
  ).toEqual(["person", "by-agent", "message", "later"]);
  // Partial history cannot prove a leading arrival started the chat.
  expect(withoutStartingAgents(rows, wen, agents, false)).toBe(rows);
  expect(withoutStartingAgents(rows, undefined, agents, true)).toBe(rows);
  // A chat with no messages yet still started with its agents.
  expect(
    withoutStartingAgents([added("only", wen, pippa)], wen, agents, true),
  ).toEqual([]);
  // Setup churn hides as a whole, so no removal outlives its hidden addition.
  expect(
    withoutStartingAgents(
      [
        added("first", wen, pippa),
        row("removed", removed(wen, pippa)),
        row("left", left(brann)),
        added("again", wen, pippa),
        message,
      ],
      wen,
      agents,
      true,
    ).map((row) => row.id),
  ).toEqual(["left", "message"]);
});
