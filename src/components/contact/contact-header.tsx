import Link from "next/link";
import Icon, { type IconName } from "@/components/icons";
import { websiteHref } from "@/lib/data";
import { lineLabel } from "@/lib/business-lines";

export function Avatar({ name, size = "lg" }: { name: string; size?: "sm" | "lg" }) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  // A stable soft color per name
  const hues = [262, 222, 170, 28, 330, 200, 140];
  const hue = hues[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % hues.length];
  const cls = size === "lg" ? "h-16 w-16 text-xl" : "h-10 w-10 text-sm";
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-2xl font-semibold ${cls}`}
      style={{
        background: `oklch(0.62 0.14 ${hue} / 0.16)`,
        color: `oklch(0.56 0.15 ${hue})`,
      }}
      aria-hidden
    >
      {letters || "?"}
    </span>
  );
}

function Row({
  icon,
  children,
}: {
  icon: IconName;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 text-sm text-ink-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted">
        <Icon name={icon} className="h-4 w-4" />
      </span>
      <span className="min-w-0 truncate">{children}</span>
    </div>
  );
}

// The top card of a contact page: who they are and how to reach them.
export default function ContactHeader({
  backHref,
  backLabel,
  name,
  company,
  status,
  line,
  phone,
  email,
  address,
  website,
  aside,
  badges,
}: {
  backHref: string;
  backLabel: string;
  name: string;
  company?: string | null;
  status?: { label: string; badgeClass: string } | null;
  line?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  website?: string | null;
  aside?: React.ReactNode;
  badges?: React.ReactNode;
}) {
  const site = websiteHref(website);
  return (
    <div>
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-ink"
      >
        <Icon name="arrowLeft" className="h-4 w-4" />
        {backLabel}
      </Link>

      <div className="card mt-3 p-5 sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <Avatar name={name} />
            <div className="min-w-0">
              <h1 className="page-title truncate">{name}</h1>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                {company && (
                  <span className="inline-flex items-center gap-1.5">
                    <Icon name="briefcase" className="h-4 w-4" />
                    {company}
                  </span>
                )}
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                {status && (
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${status.badgeClass}`}
                  >
                    {status.label}
                  </span>
                )}
                {line && (
                  <span className="inline-flex items-center rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent-text">
                    {lineLabel(line)}
                  </span>
                )}
                {badges}
              </div>
            </div>
          </div>
          {aside && <div className="shrink-0">{aside}</div>}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 border-t border-line/70 pt-5 sm:grid-cols-2">
          <Row icon="phone">
            {phone ? (
              <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="hover:text-accent-text">
                {phone}
              </a>
            ) : (
              <span className="text-subtle">No phone</span>
            )}
          </Row>
          <Row icon="mail">
            {email ? (
              <a href={`mailto:${email}`} className="hover:text-accent-text">
                {email}
              </a>
            ) : (
              <span className="text-subtle">No email</span>
            )}
          </Row>
          <Row icon="pin">
            {address ?? <span className="text-subtle">No address</span>}
          </Row>
          <Row icon="globe">
            {site ? (
              <a href={site} target="_blank" rel="noopener noreferrer" className="hover:text-accent-text">
                {website}
              </a>
            ) : website ? (
              website
            ) : (
              <span className="text-subtle">No website</span>
            )}
          </Row>
        </div>
      </div>
    </div>
  );
}

export function FactCard({
  icon,
  label,
  value,
  hint,
  href,
  tone = "default",
}: {
  icon: IconName;
  label: string;
  value: string;
  hint?: string;
  href?: string;
  tone?: "default" | "warn" | "good";
}) {
  const toneCls =
    tone === "warn"
      ? "bg-amber-50 text-amber-700"
      : tone === "good"
        ? "bg-green-50 text-green-700"
        : "bg-accent-soft text-accent-text";
  const body = (
    <>
      <div className="flex items-center gap-2.5">
        <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${toneCls}`}>
          <Icon name={icon} className="h-4 w-4" />
        </span>
        <span className="text-sm font-medium text-muted">{label}</span>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-ink">{value}</p>
      {hint && <p className="mt-0.5 truncate text-sm text-muted">{hint}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="card card-hover block p-5">
      {body}
    </Link>
  ) : (
    <div className="card p-5">{body}</div>
  );
}

export function Section({
  id,
  title,
  action,
  children,
}: {
  id?: string;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="card scroll-mt-36 p-5 sm:p-7">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="section-title">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
