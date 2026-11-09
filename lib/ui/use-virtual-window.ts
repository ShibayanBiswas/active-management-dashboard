"use client";

import { useCallback, useEffect, useRef, useState, type RefObject, type UIEvent } from "react";

/** Fixed-row window for large desk tables — keeps DOM small while scrolling. */
export function useVirtualWindow(
  rowCount: number,
  rowHeight: number,
  scrollerRef: RefObject<HTMLElement | null>,
  overscan = 10,
) {
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const scrollTopRef = useRef(0);
  const viewportRef = useRef(640);
  const frameRef = useRef(0);

  const syncWindow = useCallback(() => {
    frameRef.current = 0;
    if (rowCount <= 0 || rowHeight <= 0) {
      setStart(0);
      setEnd(0);
      return;
    }
    // Move the window a band at a time so a tall book does not rebuild on every row.
    const band = Math.max(4, overscan);
    const rawStart = Math.floor(scrollTopRef.current / rowHeight);
    const nextStart = Math.max(0, Math.floor(rawStart / band) * band - overscan);
    const visible = Math.ceil(viewportRef.current / rowHeight) + overscan * 2 + band;
    const nextEnd = Math.min(rowCount, nextStart + visible);
    setStart((prev) => (prev === nextStart ? prev : nextStart));
    setEnd((prev) => (prev === nextEnd ? prev : nextEnd));
  }, [overscan, rowCount, rowHeight]);

  useEffect(() => {
    const el = scrollerRef.current;
    scrollTopRef.current = el?.scrollTop ?? 0;
    viewportRef.current = el?.clientHeight || 640;
    syncWindow();
    if (!el) return;
    const measure = () => {
      const next = el.clientHeight || 640;
      if (next === viewportRef.current) return;
      viewportRef.current = next;
      syncWindow();
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [scrollerRef, rowCount, rowHeight, syncWindow]);

  const onScroll = useCallback(
    (event: UIEvent<HTMLElement>) => {
      scrollTopRef.current = event.currentTarget.scrollTop;
      if (frameRef.current) return;
      frameRef.current = window.requestAnimationFrame(syncWindow);
    },
    [syncWindow],
  );

  const offsetY = start * rowHeight;
  const totalHeight = rowCount * rowHeight;

  return { onScroll, start, end, offsetY, totalHeight, rowHeight };
}
