import { useEffect, useState, type ReactNode } from "react";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="field-label" title={hint}>
        {label}
        {hint && <span className="ml-1 cursor-help normal-case text-slate-500">ⓘ</span>}
      </span>
      {children}
    </label>
  );
}

/**
 * Numeric input that keeps a local draft so users can type intermediate
 * values ("-", "0.") and commits on every valid parse.
 */
export function NumberField({
  label,
  value,
  onChange,
  step = "any",
  min,
  max,
  hint,
  unit,
  onClear,
}: {
  label: string;
  value: number | undefined | null;
  onChange: (v: number) => void;
  step?: number | "any";
  min?: number;
  max?: number;
  hint?: string;
  unit?: string;
  /** If given, emptying the field is allowed and calls this. */
  onClear?: () => void;
}) {
  const [draft, setDraft] = useState(value === undefined || value === null ? "" : String(value));
  useEffect(() => {
    if (value === undefined || value === null) setDraft("");
    else if (draft === "" || Number(draft) !== value) setDraft(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <Field label={unit ? `${label} (${unit})` : label} hint={hint}>
      <input
        className="input font-mono"
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          if (e.target.value.trim() === "" && e.target.validity.valid) onClear?.();
          const v = Number(e.target.value);
          if (e.target.value.trim() !== "" && Number.isFinite(v)) {
            const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
            onChange(clamped);
          }
        }}
      />
    </Field>
  );
}

export function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <Field label={label}>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-ink-700 px-4 py-3">
      <h3 className="mb-2 text-sm font-semibold text-bone">{title}</h3>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">{children}</div>
    </section>
  );
}
