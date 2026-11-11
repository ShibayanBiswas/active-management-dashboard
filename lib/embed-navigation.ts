import { mainSections } from "@/lib/navigation";

/**
 * SP Workstation frames this app and asks it to change tab with postMessage, so a sidebar click does not reload the
 * frame and wipe the desk inputs. The message must come from the parent window, from one exact origin, and name one
 * exact route of this app.
 */
const EMBED_MESSAGE = "active-management:navigate";
const PARENT_ORIGIN = "https://sp-workstation.vercel.app";
/** SP Workstation dev server on port 3000. Never accepted in a production build. */
const LOCAL_PARENT_ORIGINS = new Set(["http://localhost:3000", "http://127.0.0.1:3000"]);

/** Every nav route: Home, Portfolio and its Unwinding Calculator, Intelligence, Upload. */
const ROUTES = new Set(
  mainSections.flatMap((section) => [section.href, ...(section.subNav ?? []).map((sub) => sub.href)]),
);

type EmbedEvent = Pick<MessageEvent, "source" | "origin" | "data">;

/** The route to open for a message, or null when the message is not one to act on. */
export function embedNavigationTarget(event: EmbedEvent, parent: unknown, production: boolean): string | null {
  if (event.source === null || event.source !== parent) return null;
  if (event.origin !== PARENT_ORIGIN && (production || !LOCAL_PARENT_ORIGINS.has(event.origin))) return null;
  const data: unknown = event.data;
  if (typeof data !== "object" || data === null) return null;
  const { type, path } = data as { type?: unknown; path?: unknown };
  if (type !== EMBED_MESSAGE || typeof path !== "string" || !ROUTES.has(path)) return null;
  return path;
}
