import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { parseProductMaster } from "@/lib/workbook/parse-master";
import { parseFixings, parseOptionChain, parseSurface } from "@/lib/workbook/parse-market";
import { readCsv, readXlsx, toIso, toNumber } from "@/lib/workbook/sheet-reader";
import { SEED } from "@/tests/helpers/book";

const sample = (name: string) => path.join(__dirname, "..", "..", "public", "samples", name);
const buffer = (name: string) => {
  const b = readFileSync(sample(name));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

describe("cell readers", () => {
  it("reads desk numbers and dates", () => {
    expect(toNumber("1,23,456.50")).toBe(123456.5);
    expect(toNumber("7.5%")).toBeCloseTo(0.075, 12);
    expect(toNumber("-")).toBeNull();
    expect(toIso("29-Oct-2026")).toBe("2026-10-29");
    expect(toIso("29/10/2026")).toBe("2026-10-29");
    expect(toIso(46324)).toBe("2026-10-29");
  });
});

describe("upload parsers on the sample files", () => {
  it("product master round-trips the seeded book", async () => {
    const { products, issues } = parseProductMaster(await readXlsx(buffer("product-master-sample.xlsx")));
    expect(products).toHaveLength(SEED.products.length);
    expect(products.reduce((s, p) => s + p.legs.length, 0)).toBe(SEED.products.reduce((s, p) => s + p.legs.length, 0));
    expect(products[0]).toMatchObject({ name: SEED.products[0].name, coupon: SEED.products[0].coupon, observationDates: SEED.products[0].observationDates });
    expect(issues.filter((i) => !i.message.includes("Coupon"))).toEqual([]);
  });

  it("volatility surface", async () => {
    const { surface, issues } = parseSurface(await readXlsx(buffer("vol-surface-sample.xlsx")), "Test Surface");
    expect(issues).toEqual([]);
    expect(surface!.referenceLevel).toBe(SEED.surface.referenceLevel);
    expect(surface!.expiries).toEqual(SEED.surface.expiries);
    expect(surface!.moneyness).toHaveLength(SEED.surface.moneyness.length);
  });

  it("NSE option chain", () => {
    const { rows, issues } = parseOptionChain([readCsv(readFileSync(sample("option-chain-sample.csv"), "utf8"))]);
    expect(issues).toEqual([]);
    expect(rows.length).toBe(SEED.chains[0].rows.length);
    expect(rows[0]).toEqual(SEED.chains[0].rows[0]);
  });

  it("fixing history", () => {
    const { fixings } = parseFixings([readCsv(readFileSync(sample("fixings-sample.csv"), "utf8"))]);
    expect(fixings).toHaveLength(SEED.fixings.length);
  });

  it("rejects a sheet without a product header", () => {
    const { products, issues } = parseProductMaster([{ name: "x", rows: [["Nothing"]] }]);
    expect(products).toEqual([]);
    expect(issues[0].message).toMatch(/Product Name/);
  });
});
