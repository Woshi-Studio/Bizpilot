import Link from "next/link";

// A form's error line. When a plan limit stopped the save (`upgrade`),
// it carries an Upgrade button to Settings -> Plan. The Lead Finder
// passes its own button ("Get leads" -> the lead packs and subscription).
export default function FormError({
  error,
  upgrade,
  className = "",
  upgradeHref = "/plans",
  upgradeLabel = "Upgrade",
}: {
  error?: string;
  upgrade?: boolean;
  className?: string;
  upgradeHref?: string;
  upgradeLabel?: string;
}) {
  if (!error) return null;
  if (!upgrade) return <p className={`alert-error ${className}`}>{error}</p>;
  return (
    <div
      role="alert"
      className={`alert-info flex flex-wrap items-center justify-between gap-3 ${className}`}
    >
      <span>{error}</span>
      <Link href={upgradeHref} className="btn-primary btn-sm">
        {upgradeLabel}
      </Link>
    </div>
  );
}
