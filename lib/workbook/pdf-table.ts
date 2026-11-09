import { computeGroupedRowSpans } from "@/lib/utils";

export type SpannedPdfCell =
  | string
  | {
      content: string;
      rowSpan: number;
      styles: { valign: "top" };
    };

/** Autotable body with clubbed cells. Same values merge only for allowed columns inside a group. */
export function spannedPdfBody(
  rows: string[][],
  groupCol: number,
  sanitize: (value: string) => string = (value) => value,
  mergeCols?: readonly number[],
): SpannedPdfCell[][] {
  if (!rows.length) return [];
  const cols = mergeCols ? [...mergeCols] : rows[0].map((_, i) => i);
  const spans = computeGroupedRowSpans(rows, cols, groupCol);
  return rows.map((row, ri) => {
    const cells: SpannedPdfCell[] = [];
    row.forEach((value, ci) => {
      const span = spans[ri]?.[ci] ?? 1;
      if (span === 0) return;
      const content = sanitize(value);
      cells.push(span > 1 ? { content, rowSpan: span, styles: { valign: "top" } } : content);
    });
    return cells;
  });
}
