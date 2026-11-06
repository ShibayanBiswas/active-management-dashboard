"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp } from "lucide-react";

import { cn } from "@/lib/cn";

export type Column<T> = {
  id: string;
  label: string;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
  /** Sorting key; columns without one do not sort. */
  sort?: (row: T) => number | string | null;
  className?: string;
};

const ROW_HEIGHT = 41;

/** Virtualized desk table: sticky header, optional totals row, click to sort. */
export function DeskTable<T>({
  rows,
  columns,
  rowKey,
  totals,
  onRowClick,
  height = "book",
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  totals?: ReactNode[];
  onRowClick?: (row: T) => void;
  height?: "book" | "compact";
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [sort, setSort] = useState<{ id: string; dir: 1 | -1 } | null>(null);
  const sorted = useMemo(() => {
    const col = sort ? columns.find((c) => c.id === sort.id) : null;
    if (!col?.sort) return rows;
    const key = col.sort;
    return [...rows].sort((a, b) => {
      const x = key(a);
      const y = key(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (x < y ? -1 : x > y ? 1 : 0) * sort!.dir;
    });
  }, [rows, columns, sort]);

  const virtualizer = useVirtualizer({ count: sorted.length, getScrollElement: () => scrollRef.current, estimateSize: () => ROW_HEIGHT, overscan: 12 });
  const items = virtualizer.getVirtualItems();
  const padTop = items[0]?.start ?? 0;
  const padBottom = virtualizer.getTotalSize() - (items.at(-1)?.end ?? 0);

  return (
    <div ref={scrollRef} className={cn("desk-table-scroll font-ui", height === "book" && "desk-table-scroll--book")}>
      <table className="data-table-premium">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.id}
                className={cn(c.align === "right" && "text-right", c.sort && "cursor-pointer select-none")}
                onClick={() => c.sort && setSort((s) => (s?.id === c.id ? (s.dir === 1 ? { id: c.id, dir: -1 } : null) : { id: c.id, dir: 1 }))}
              >
                <span className="inline-flex items-center gap-1">
                  {c.label}
                  {sort?.id === c.id ? sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : null}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {totals ? (
            <tr className="row-total">
              {totals.map((t, i) => (
                <td key={i} className={cn(columns[i]?.align === "right" && "text-right")}>
                  {t}
                </td>
              ))}
            </tr>
          ) : null}
          {padTop > 0 ? (
            <tr aria-hidden className="virtual-spacer">
              <td colSpan={columns.length} style={{ height: padTop }} />
            </tr>
          ) : null}
          {items.map((item) => {
            const row = sorted[item.index];
            return (
              <tr
                key={rowKey(row)}
                className={cn("desk-virtual-row", item.index % 2 === 1 && "data-table-row-alt", onRowClick && "cursor-pointer")}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((c) => (
                  <td key={c.id} className={cn(c.align === "right" && "text-right", c.className)}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
          {padBottom > 0 ? (
            <tr aria-hidden className="virtual-spacer">
              <td colSpan={columns.length} style={{ height: padBottom }} />
            </tr>
          ) : null}
        </tbody>
      </table>
      {sorted.length === 0 ? <p className="px-5 py-6 text-sm text-muted">No Rows Match The Filters</p> : null}
    </div>
  );
}
