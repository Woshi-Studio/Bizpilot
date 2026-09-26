import { BUSINESS_LINES, MAX_LINE_LENGTH } from "@/lib/business-lines";

// Business line picker for create/edit forms: suggests the configured
// lines (plus any extra ones already in use) and also accepts free text.
// Posts as `business_line`; the server normalizes it.
export default function BusinessLineInput({
  id,
  defaultValue,
  lines,
  className,
  label = "Business",
  showLabel = true,
}: {
  id: string;
  defaultValue?: string | null;
  lines?: string[];
  className?: string;
  label?: string;
  showLabel?: boolean;
}) {
  const listId = `${id}-options`;
  const options = lines ?? BUSINESS_LINES.map((l) => l.value);
  return (
    <div>
      {showLabel && (
        <label htmlFor={id} className="label">
          {label}
        </label>
      )}
      <input
        id={id}
        name="business_line"
        type="text"
        list={listId}
        maxLength={MAX_LINE_LENGTH}
        defaultValue={defaultValue ?? ""}
        placeholder="Pick or type, e.g. VWA"
        aria-label={showLabel ? undefined : label}
        autoComplete="off"
        className={className}
      />
      <datalist id={listId}>
        {options.map((v) => {
          const known = BUSINESS_LINES.find((l) => l.value === v);
          return (
            <option key={v} value={v}>
              {known && known.label !== v ? known.label : undefined}
            </option>
          );
        })}
      </datalist>
    </div>
  );
}
