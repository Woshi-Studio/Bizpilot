import Link from "next/link";

// A form's error line. When a plan limit stopped the save (`upgrade`),
// it carries an Upgrade button to Settings -> Plan.
export default function FormError({
  error,
  upgrade,
  className = "",
}: {
  error?: string;
  upgrade?: boolean;
  className?: string;
}) {
  if (!error) return null;
  if (!upgrade) return <p className={`alert-error ${className}`}>{error}</p>;
  return (
    <div
      role="alert"
      className={`alert-info flex flex-wrap items-center justify-between gap-3 ${className}`}
    >
      <span>{error}</span>
      <Link href="/settings#plan" className="btn-primary btn-sm">
        Upgrade
      </Link>
    </div>
  );
}
