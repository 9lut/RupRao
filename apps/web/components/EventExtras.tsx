import type { EventLink, LinkKind } from "@/lib/themes";

export const LINK_KINDS: { kind: LinkKind; label: string; placeholder: string }[] = [
  { kind: "facebook", label: "Facebook", placeholder: "https://facebook.com/…" },
  { kind: "instagram", label: "Instagram", placeholder: "https://instagram.com/…" },
  { kind: "line", label: "LINE", placeholder: "https://line.me/R/ti/p/@…" },
  { kind: "tiktok", label: "TikTok", placeholder: "https://tiktok.com/@…" },
  { kind: "youtube", label: "YouTube", placeholder: "https://youtube.com/@…" },
  { kind: "website", label: "เว็บไซต์", placeholder: "https://…" },
];

/** Simple outline glyphs (not the official logos) so they sit well on any theme. */
export function LinkIcon({ kind, size = 16 }: { kind: LinkKind; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (kind) {
    case "facebook":
      return (
        <svg {...common}>
          <path d="M14 8h2.5V4.5H14A3.5 3.5 0 0 0 10.5 8v2.5H8V14h2.5v6H14v-6h2.5l.5-3.5h-3V8.5c0-.3.2-.5.5-.5Z" />
        </svg>
      );
    case "instagram":
      return (
        <svg {...common}>
          <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
          <circle cx="12" cy="12" r="3.8" />
          <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" />
        </svg>
      );
    case "line":
      return (
        <svg {...common}>
          <path d="M12 4C7 4 3.5 7.1 3.5 10.8c0 3.3 2.8 6 6.7 6.6l-.5 2.6 3.4-2.5c4.3-.3 7.4-3.2 7.4-6.7C20.5 7.1 17 4 12 4Z" />
          <path d="M8 9.3v3.2h1.8M11 9.3v3.2M13 12.5V9.3l2.2 3.2V9.3M17.8 9.3h-1.6v3.2h1.6M16.2 10.9h1.4" strokeWidth="1.3" />
        </svg>
      );
    case "tiktok":
      return (
        <svg {...common}>
          <path d="M14 4v10.5a3.5 3.5 0 1 1-3.5-3.5" />
          <path d="M14 4c.4 2.6 2.2 4.4 5 4.6" />
        </svg>
      );
    case "youtube":
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="12" rx="4" />
          <path d="m10.5 9.5 4 2.5-4 2.5Z" fill="currentColor" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M3.5 12h17M12 3.5c2.4 2.5 3.5 5.3 3.5 8.5s-1.1 6-3.5 8.5c-2.4-2.5-3.5-5.3-3.5-8.5s1.1-6 3.5-8.5Z" />
        </svg>
      );
  }
}

/** Social / website buttons. `onImage` = white glass pills for the banner photo. */
export function EventLinks({ links, onImage = false, preview = false }: { links: EventLink[]; onImage?: boolean; preview?: boolean }) {
  if (!links.length) return null;
  const cls = onImage
    ? "bg-white/20 text-white ring-1 ring-white/40 backdrop-blur-md hover:bg-white/30"
    : "border border-line bg-white text-ink hover:bg-soft";
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {links.map((l, i) => {
        const label = l.label || LINK_KINDS.find((k) => k.kind === l.kind)?.label;
        const inner = (
          <>
            <LinkIcon kind={l.kind} size={15} />
            {label}
          </>
        );
        const pill = `pointer-events-auto inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition ${cls}`;
        // In the admin preview the buttons are only shown, not followed.
        return preview ? (
          <span key={i} className={pill}>
            {inner}
          </span>
        ) : (
          <a key={i} href={l.url} target="_blank" rel="noopener noreferrer nofollow" className={pill}>
            {inner}
          </a>
        );
      })}
    </div>
  );
}

/** Welcome message / notice from the organizer. */
export function Announcement({ title, text, className = "" }: { title?: string; text?: string; className?: string }) {
  if (!title && !text) return null;
  return (
    <section className={`fade-in flex gap-3 rounded-[22px] border border-line bg-white p-4 sm:p-5 ${className}`}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-soft text-accent" aria-hidden>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 10v4a1 1 0 0 0 1 1h2l5 4V5L7 9H5a1 1 0 0 0-1 1Z" />
          <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" />
        </svg>
      </span>
      <div className="min-w-0">
        {title && <p className="text-sm font-semibold">{title}</p>}
        {text && <p className={`whitespace-pre-line text-sm leading-relaxed text-muted ${title ? "mt-1" : ""}`}>{text}</p>}
      </div>
    </section>
  );
}
