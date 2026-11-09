import type ExcelJS from "exceljs";

import { EXCEL_THEME, excelFill } from "@/lib/workbook/export-theme";

let cachedLogoBase64: string | null = null;

/** Fetch ARWL logo as base64 (browser only — cached after first load). */
export async function fetchBrandLogoBase64(): Promise<string | null> {
  if (cachedLogoBase64) return cachedLogoBase64;
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch("/brand/arwl-logo.png");
    if (!res.ok) return null;
    const blob = await res.blob();
    cachedLogoBase64 = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result;
        if (typeof dataUrl !== "string") {
          resolve(null);
          return;
        }
        const base64 = dataUrl.split(",")[1] ?? null;
        resolve(base64);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
    return cachedLogoBase64;
  } catch {
    return null;
  }
}

/** Place Anand Rathi logo above the sheet masthead. Returns row offset for content below. */
export function embedBrandLogo(
  wb: ExcelJS.Workbook,
  sheet: ExcelJS.Worksheet,
  base64: string,
  washCols = 12,
): number {
  const imageId = wb.addImage({ base64, extension: "png" });
  sheet.addImage(imageId, {
    tl: { col: 0, row: 0 } as ExcelJS.Anchor,
    ext: { width: 210, height: 48 },
  });
  sheet.getRow(1).height = 30;
  sheet.getRow(2).height = 18;
  sheet.getRow(3).height = 6;
  const cols = Math.max(sheet.columnCount || 0, washCols);
  for (let c = 1; c <= cols; c++) {
    sheet.getCell(1, c).fill = excelFill(EXCEL_THEME.goldPale);
    sheet.getCell(2, c).fill = excelFill(EXCEL_THEME.goldPale);
    sheet.getCell(3, c).fill = excelFill(EXCEL_THEME.goldPale);
  }
  return 3;
}
