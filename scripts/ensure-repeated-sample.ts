/**
 * Build the Repeated Rows multi sample into public/samples.
 * Always rebuilds so Anand Rathi logo + maroon/gold masthead ship on every Vercel deploy
 * (the ~90MB file is gitignored).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(
  process.cwd(),
  "public/samples/Product_Master_Input_Multiple_Products_Repeated_Rows.xlsx",
);

function main() {
  console.log("Building branded Repeated Rows sample for deploy…");
  const result = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["tsx", "scripts/build-sample-inputs.ts", "--repeated-only"],
    { stdio: "inherit", cwd: process.cwd(), shell: process.platform === "win32" },
  );
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  if (!fs.existsSync(OUT) || fs.statSync(OUT).size < 1_000_000) {
    console.error("Repeated Rows sample was not written:", OUT);
    process.exit(1);
  }
  console.log("Wrote", OUT, fs.statSync(OUT).size);
}

main();
