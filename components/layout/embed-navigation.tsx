"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { embedNavigationTarget } from "@/lib/embed-navigation";

/**
 * Changes tab when SP Workstation asks. The client router keeps the desk state, so the run survives; replace rather
 * than push, because the Workstation already added the history entry.
 */
export function EmbedNavigation() {
  const router = useRouter();
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const path = embedNavigationTarget(event, window.parent, process.env.NODE_ENV === "production");
      if (path) router.replace(path);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [router]);
  return null;
}
