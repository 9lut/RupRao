import { useEffect, useSyncExternalStore } from "react";

/** What the site header borrows from the open event page: its logo, and whether to float over the banner. */
export interface EventBrand {
  logoUrl: string | null;
  name: string;
  /** Transparent header laid over the banner photo until the page scrolls. */
  overlay: boolean;
}

let current: EventBrand | null = null;
const listeners = new Set<() => void>();

function set(brand: EventBrand | null) {
  current = brand;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Read side (Header). */
export function useEventBrand(): EventBrand | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

/** Write side (event page): active while mounted. */
export function useProvideEventBrand(logoUrl: string | null | undefined, name: string | undefined, overlay: boolean) {
  useEffect(() => {
    if (!name || (!logoUrl && !overlay)) return;
    set({ logoUrl: logoUrl ?? null, name, overlay });
    return () => set(null);
  }, [logoUrl, name, overlay]);
}

/** Browser tab title and icon for the open event page; the site defaults come back on leave. */
export function useDocumentBrand(title: string | undefined, iconUrl: string | null | undefined) {
  useEffect(() => {
    if (!title) return;
    const prev = document.title;
    document.title = title;
    return () => {
      document.title = prev;
    };
  }, [title]);

  useEffect(() => {
    if (!iconUrl) return;
    // Next.js renders <link rel="icon"> (and apple-touch-icon) from app/icon.png; point them at ours.
    const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"], link[rel="apple-touch-icon"]'));
    const saved = links.map((l) => [l, l.href, l.type] as const);
    for (const l of links) {
      l.href = iconUrl;
      l.removeAttribute("type");
    }
    let added: HTMLLinkElement | null = null;
    if (!links.length) {
      added = Object.assign(document.createElement("link"), { rel: "icon", href: iconUrl });
      document.head.appendChild(added);
    }
    return () => {
      for (const [l, href, type] of saved) {
        l.href = href;
        if (type) l.type = type;
      }
      added?.remove();
    };
  }, [iconUrl]);
}
