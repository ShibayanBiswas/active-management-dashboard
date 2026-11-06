import { z } from "zod";

import { headerKey, toIso, toNumber, type Cell, type Sheet } from "@/lib/workbook/sheet-reader";
import type { Leg, Product } from "@/lib/types";

/** Canonical field to accepted header spellings (lower case, letters and digits only). */
const FIELDS = {
  name: ["productname", "product"],
  productCode: ["productcode", "isin"],
  tradeDate: ["tradedate"],
  allotmentDate: ["allotmentdate", "allotmentdt"],
  maturityDate: ["maturitydate"],
  tenorDays: ["tenordays", "tenor"],
  mobilisation: ["mobilisation", "mobilization"],
  initialNifty: ["initialniftylevel", "initialnifty"],
  contingentLevel: ["contingentlevel"],
  faceValue: ["facevalue"],
  coupon: ["coupon"],
  actualTarget: ["actualtarget", "target"],
  marginPct: ["marginpercent", "margin", "marginge"],
  ib: ["ib", "repib", "inbuilt"],
  tranCost: ["transactioncost", "trancost"],
  issuanceCost: ["issuancecost"],
  prodRate: ["productrate", "prddiscrate", "prodrate"],
  premRate: ["premiumrate", "premdiscrate", "premgrrate"],
  marginRate: ["marginrate", "marginfundingrate", "margingrrate"],
  optionType: ["optiontype", "reqoptions", "option"],
  strike: ["strike", "reqstrike"],
  side: ["side", "buysell"],
  expiry: ["expiry", "reqexpiry"],
  quantity: ["quantity", "reqquantity"],
  prdPrice: ["productprice", "prdprice"],
  prdPremium: ["productpremium", "prdpremium"],
} as const;

type Field = keyof typeof FIELDS;

const legSchema = z.object({
  optionType: z.enum(["Call", "Put"]),
  strike: z.number().positive(),
  side: z.enum(["Buy", "Sell"]),
  expiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  quantity: z.number().refine((q) => q !== 0, "Quantity Must Not Be Zero"),
  prdPrice: z.number().nullable(),
  prdPremium: z.number().nullable(),
});

type ParseIssue = { row: number; message: string };

function findHeader(rows: Cell[][]): { index: number; columns: Partial<Record<Field, number>> } | null {
  for (let r = 0; r < Math.min(rows.length, 20); r += 1) {
    const keys = rows[r].map(headerKey);
    if (!keys.includes("productname")) continue;
    const columns: Partial<Record<Field, number>> = {};
    for (const field of Object.keys(FIELDS) as Field[]) {
      const at = keys.findIndex((k) => (FIELDS[field] as readonly string[]).includes(k));
      if (at >= 0) columns[field] = at;
    }
    keys.forEach((k, i) => {
      const obs = k.match(/^observationdate(\d)$/);
      if (obs) (columns as Record<string, number>)[`obs${obs[1]}`] = i;
    });
    return { index: r, columns };
  }
  return null;
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** One row per leg; product fields repeat on every leg row and the first row wins. */
export function parseProductMaster(sheets: Sheet[]): { products: Product[]; issues: ParseIssue[] } {
  const issues: ParseIssue[] = [];
  const sheet = sheets.find((s) => findHeader(s.rows)) ?? null;
  if (!sheet) return { products: [], issues: [{ row: 0, message: "No Sheet With A Product Name Header Was Found" }] };
  const { index, columns } = findHeader(sheet.rows)!;
  for (const required of ["name", "optionType", "strike", "side", "expiry", "quantity", "mobilisation", "faceValue", "allotmentDate"] as Field[]) {
    if (columns[required] == null) issues.push({ row: index + 1, message: `Missing Column ${required}` });
  }
  if (issues.length) return { products: [], issues };

  const get = (row: Cell[], field: Field) => (columns[field] != null ? row[columns[field]!] : null);
  const byName = new Map<string, Product>();
  for (let r = index + 1; r < sheet.rows.length; r += 1) {
    const row = sheet.rows[r];
    const name = get(row, "name");
    if (name == null || String(name).trim() === "") continue;
    const productName = String(name).trim();
    let product = byName.get(productName);
    if (!product) {
      const observationDates = Array.from({ length: 7 }, (_, i) => (columns as Record<string, number>)[`obs${i + 1}`])
        .map((c) => (c != null ? toIso(row[c]) : null))
        .filter((d): d is string => d != null);
      product = {
        id: slug(productName),
        name: productName,
        productCode: get(row, "productCode") != null ? String(get(row, "productCode")) : null,
        tradeDate: toIso(get(row, "tradeDate")),
        allotmentDate: toIso(get(row, "allotmentDate")),
        maturityDate: toIso(get(row, "maturityDate")),
        tenorDays: toNumber(get(row, "tenorDays")),
        mobilisation: toNumber(get(row, "mobilisation")),
        initialNifty: toNumber(get(row, "initialNifty")),
        contingentLevel: toNumber(get(row, "contingentLevel")),
        faceValue: toNumber(get(row, "faceValue")),
        coupon: toNumber(get(row, "coupon")),
        actualTarget: toNumber(get(row, "actualTarget")),
        marginPct: toNumber(get(row, "marginPct")),
        ib: toNumber(get(row, "ib")),
        tranCost: toNumber(get(row, "tranCost")),
        issuanceCost: toNumber(get(row, "issuanceCost")),
        prodRate: toNumber(get(row, "prodRate")),
        premRate: toNumber(get(row, "premRate")),
        marginRate: toNumber(get(row, "marginRate")),
        observationDates,
        legs: [],
      };
      if (!product.allotmentDate) issues.push({ row: r + 1, message: `${productName}: Allotment Date Missing` });
      if (!(product.coupon != null && product.coupon > 0)) issues.push({ row: r + 1, message: `${productName}: Coupon Missing Or Zero` });
      if (!(product.tenorDays != null && product.tenorDays > 0)) issues.push({ row: r + 1, message: `${productName}: Tenor Missing Or Not Positive` });
      byName.set(productName, product);
    }
    const optionRaw = String(get(row, "optionType") ?? "").toLowerCase();
    const sideRaw = String(get(row, "side") ?? "").toLowerCase();
    const leg = legSchema.safeParse({
      optionType: optionRaw.startsWith("c") ? "Call" : optionRaw.startsWith("p") ? "Put" : optionRaw,
      strike: toNumber(get(row, "strike")),
      side: sideRaw.startsWith("s") ? "Sell" : sideRaw.startsWith("b") ? "Buy" : sideRaw,
      expiry: toIso(get(row, "expiry")),
      quantity: toNumber(get(row, "quantity")),
      prdPrice: toNumber(get(row, "prdPrice")),
      prdPremium: toNumber(get(row, "prdPremium")),
    });
    if (leg.success) product.legs.push(leg.data as Leg);
    else issues.push({ row: r + 1, message: `${productName}: Leg Skipped, ${leg.error.issues[0]?.message ?? "Invalid Leg"}` });
  }
  return { products: [...byName.values()], issues };
}
