"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

import { DeskKeyDialog } from "@/components/ui/desk-key-dialog";
import { DESK_KEY_HEADER } from "@/lib/desk-key";

type WriteFetch = (url: string, init: RequestInit) => Promise<Response | null>;

/** Shown when a save is cancelled at the Desk Key prompt. */
export const DESK_KEY_CANCELLED = "Not saved. Saving needs the Desk Key.";

const DeskKeyContext = createContext<WriteFetch | null>(null);

/**
 * Sends writes with the Desk Key. The first save or upload asks for it; a wrong key asks again; Cancel returns null.
 * The key lives in memory only, so nothing is saved in the browser.
 */
export function DeskKeyProvider({ children }: { children: ReactNode }) {
  const key = useRef<string | null>(null);
  const [prompt, setPrompt] = useState<{ id: number; error: string | null; resolve: (key: string | null) => void } | null>(
    null,
  );

  const ask = useCallback(
    (error: string | null) =>
      new Promise<string | null>((resolve) => {
        setPrompt({ id: Date.now(), error, resolve });
      }),
    [],
  );

  const finish = useCallback(
    (value: string | null) => {
      prompt?.resolve(value);
      setPrompt(null);
    },
    [prompt],
  );

  const writeFetch = useCallback<WriteFetch>(
    async (url, init) => {
      let error: string | null = null;
      for (;;) {
        if (!key.current) {
          const typed = await ask(error);
          if (!typed) return null;
          key.current = typed;
        }
        const headers = new Headers(init.headers);
        headers.set(DESK_KEY_HEADER, key.current);
        const res = await fetch(url, { ...init, headers });
        if (res.status !== 401) return res;
        key.current = null;
        error = "That Desk Key is not right. Check it and try again.";
      }
    },
    [ask],
  );

  const onCancel = useCallback(() => finish(null), [finish]);

  return (
    <DeskKeyContext.Provider value={writeFetch}>
      {children}
      {prompt ? <DeskKeyDialog key={prompt.id} error={prompt.error} onSubmit={(k) => finish(k)} onCancel={onCancel} /> : null}
    </DeskKeyContext.Provider>
  );
}

export function useWriteFetch(): WriteFetch {
  const context = useContext(DeskKeyContext);
  if (!context) throw new Error("useWriteFetch needs DeskKeyProvider");
  return context;
}
