"use client";

import type { ReactNode } from "react";

import { DeskLoading, Panel } from "@/components/ui/desk-ui";
import { useDesk } from "@/lib/context/desk-provider";
import type { Book } from "@/lib/engine/book";
import type { DeskData, DeskInputs } from "@/lib/types";

/** Renders children once the book is priced; loading and error states otherwise. */
export function DeskGate({ children }: { children: (ctx: { book: Book; data: DeskData; inputs: DeskInputs }) => ReactNode }) {
  const { book, data, inputs, error } = useDesk();
  if (error && !data) {
    return (
      <Panel>
        <p className="desk-alert-error">{error}</p>
      </Panel>
    );
  }
  if (!book || !data || !inputs) return <DeskLoading />;
  return <>{children({ book, data, inputs })}</>;
}
