/**
 * SP Workstation frames this desk and sends postMessage({ type: "active-management:navigate", path }).
 * Only the Workstation parent, from its one origin, may move the frame, and only to a nav route.
 */
import { embedNavigationTarget } from "../lib/embed-navigation";

function assert(label: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? `: ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

const parent = {};
const WORKSTATION = "https://sp-workstation.vercel.app";
const msg = (origin: string, data: unknown, source: unknown = parent) => ({
  origin,
  data,
  source: source as MessageEventSource,
});
const nav = (path: string) => ({ type: "active-management:navigate", path });

for (const path of ["/", "/portfolio/unwinding", "/intelligence", "/upload"]) {
  const target = embedNavigationTarget(msg(WORKSTATION, nav(path)), parent, true);
  assert(`Workstation opens ${path}`, target === path, String(target));
}

const local = msg("http://localhost:3000", nav("/portfolio/unwinding"));
assert("local Workstation accepted outside production", embedNavigationTarget(local, parent, false) === "/portfolio/unwinding");
assert("local Workstation rejected in production", embedNavigationTarget(local, parent, true) === null);

const ok = nav("/portfolio/unwinding");
assert("other origin rejected", embedNavigationTarget(msg("https://evil.example", ok), parent, true) === null);
assert("other source rejected", embedNavigationTarget(msg(WORKSTATION, ok, {}), parent, true) === null);
assert(
  "other message type rejected",
  embedNavigationTarget(msg(WORKSTATION, { ...ok, type: "hedging-sheet:navigate" }), parent, true) === null,
);
for (const path of ["/multi", "/multi/portfolio/unwinding", "/api/multi/dataset", "/portfolio", "/portfolio/pricer"]) {
  assert(`path ${path} rejected`, embedNavigationTarget(msg(WORKSTATION, nav(path)), parent, true) === null);
}
assert("non-object data rejected", embedNavigationTarget(msg(WORKSTATION, "nope"), parent, true) === null);
