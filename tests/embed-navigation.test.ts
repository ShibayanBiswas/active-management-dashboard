import { describe, expect, it } from "vitest";

import { embedNavigationTarget } from "@/lib/embed-navigation";

const parent = {};
const msg = (origin: string, data: unknown, source: unknown = parent) => ({ origin, data, source: source as MessageEventSource });

describe("Workstation navigate messages", () => {
  it("accepts an allowlisted path from the Workstation parent", () => {
    expect(embedNavigationTarget(msg("https://sp-workstation.vercel.app", { type: "active-management:navigate", path: "/scenarios" }), parent, true)).toBe("/scenarios");
  });

  it("accepts the local Workstation only outside production", () => {
    const m = msg("http://localhost:3000", { type: "active-management:navigate", path: "/legs" });
    expect(embedNavigationTarget(m, parent, false)).toBe("/legs");
    expect(embedNavigationTarget(m, parent, true)).toBeNull();
  });

  it("rejects other origins, sources, types and paths", () => {
    const ok = { type: "active-management:navigate", path: "/pricing" };
    expect(embedNavigationTarget(msg("https://evil.example", ok), parent, true)).toBeNull();
    expect(embedNavigationTarget(msg("https://sp-workstation.vercel.app", ok, {}), parent, true)).toBeNull();
    expect(embedNavigationTarget(msg("https://sp-workstation.vercel.app", { ...ok, type: "hedging-sheet:navigate" }), parent, true)).toBeNull();
    expect(embedNavigationTarget(msg("https://sp-workstation.vercel.app", { ...ok, path: "/api/health" }), parent, true)).toBeNull();
    expect(embedNavigationTarget(msg("https://sp-workstation.vercel.app", "nope"), parent, true)).toBeNull();
  });
});
