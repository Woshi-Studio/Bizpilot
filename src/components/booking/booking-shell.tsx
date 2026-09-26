import type { ThemeId } from "@/lib/plans";
import { bt } from "@/lib/booking-i18n";

// The frame of every public booking page: the business's own theme (the
// owner's saved theme, not the visitor's), accent color, logo and name.
export default function BookingShell({
  theme,
  accent,
  logo,
  businessName,
  lang,
  children,
}: {
  theme: ThemeId;
  accent: string | null;
  logo: string | null;
  businessName: string;
  lang: string;
  children: React.ReactNode;
}) {
  const safeTheme = ["clean", "dark", "neon", "retro"].includes(theme) ? theme : "clean";
  const accentVars =
    accent && /^#[0-9a-f]{6}$/i.test(accent)
      ? ({
          "--accent": accent,
          "--accent-hover": `color-mix(in oklab, ${accent} 85%, black)`,
          "--accent-soft": `color-mix(in oklab, ${accent} 14%, var(--surface))`,
          "--accent-text": `color-mix(in oklab, ${accent} 80%, var(--text))`,
          "--ring": `color-mix(in oklab, ${accent} 35%, transparent)`,
        } as React.CSSProperties)
      : undefined;
  const initials = businessName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  return (
    <div lang={lang} className="flex min-h-screen flex-col bg-canvas" style={accentVars}>
      {/* The business's theme wins over the visitor's saved one on this page. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){try{var h=document.documentElement;h.setAttribute('data-theme','${safeTheme}');h.classList.toggle('dark',${safeTheme !== "clean"});}catch(e){}})();`,
        }}
      />
      <header className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 pt-6 sm:px-6 sm:pt-10">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="h-11 w-11 rounded-xl object-contain" />
        ) : (
          <span
            aria-hidden
            className="brand-mark flex h-11 w-11 items-center justify-center rounded-xl text-sm font-bold"
            style={{ background: "var(--accent)", color: "var(--accent-contrast)" }}
          >
            {initials || "•"}
          </span>
        )}
        <p className="brand-name text-lg font-semibold text-ink">{businessName}</p>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">{children}</main>
      <footer className="px-4 py-6 text-center text-xs text-subtle">
        {bt(lang, "powered")}{" "}
        <a href="https://jephelen.vercel.app" className="font-medium text-accent-text hover:underline">
          Jephelen
        </a>
      </footer>
    </div>
  );
}
