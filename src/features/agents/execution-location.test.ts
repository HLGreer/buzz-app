import { expect, it } from "vitest";
import { agentExecution, executionDetails } from "./execution-location";

it("keeps unknown execution distinct from local, including an unavailable harness", () => {
  expect(agentExecution({ place: "hosted" })).toBe("remote");
  expect(agentExecution({ place: "here" })).toBe("local");
  expect(agentExecution({ place: "elsewhere" })).toBeUndefined();
  expect(agentExecution({ place: "elsewhere" }, {})).toBe("local");
});

it("keeps a native agent with a remote execution binding distinct from local custody", () => {
  expect(
    agentExecution({
      place: "here",
      executionBinding: { provider: "internal/remote" },
    }),
  ).toBe("remote");
  // Only Builderlab establishes the availability and file boundary.
  expect(executionDetails("buzz.codex/codex")).toEqual({});
  expect(executionDetails("block.builderlab/builderlab")).toEqual({
    description:
      "Keeps working while this computer is off, and you can chat from your phone. It can’t open files on this computer.",
  });
});
