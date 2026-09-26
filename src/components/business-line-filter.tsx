import Link from "next/link";
import { NO_LINE, lineLabel } from "@/lib/business-lines";

// "Business" filter chips shown at the top of the owner pages. The choice
// lives in the ?line= URL param so it survives reloads and can be shared.
export default function BusinessLineFilter({
  basePath,
  lines,
  current,
  keep = {},
}: {
  basePath: string;
  lines: string[];
  current: string | undefined;
  // other URL params to carry over (e.g. calendar view/date)
  keep?: Record<string, string | undefined>;
}) {
  function href(line: string | undefined) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(keep)) {
      if (v) params.set(k, v);
    }
    if (line) params.set("line", line);
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  const options: { value: string | undefined; label: string }[] = [
    { value: undefined, label: "All businesses" },
    ...lines.map((l) => ({ value: l, label: lineLabel(l) })),
    { value: NO_LINE, label: "Unassigned" },
  ];

  return (
    <div className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
      <span className="eyebrow mr-1 shrink-0">
        Business
      </span>
      {options.map((o) => {
        const active = (current ?? "") === (o.value ?? "");
        return (
          <Link
            key={o.value ?? "all"}
            href={href(o.value)}
            aria-current={active ? "true" : undefined}
            className={active ? "chip chip-active" : "chip"}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}
