import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

/**
 * Controlled number input that avoids the native "0" + typed digit => "0400" leading-zero bug by
 * tracking the raw typed string and showing a blank box with a faint "0" placeholder instead of a
 * literal 0. An empty box counts as 0.
 *
 * Clamping into [min, max] happens on blur, not on every keystroke — clamping mid-type would fight
 * the resync effect below (e.g. typing "-5" would immediately snap to 0, which the effect would then
 * see as already matching `value` and never let the box re-sync to a corrected display).
 */
export function NumberInput({
  value,
  onChange,
  min = 0,
  max,
  step,
  className,
  disabled,
  id,
  "aria-describedby": ariaDescribedBy,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number | "any";
  className?: string;
  disabled?: boolean;
  id?: string;
  "aria-describedby"?: string;
}) {
  const [text, setText] = useState(() => (value ? String(value) : ""));

  // Resync when the value changes from outside (deal switch, product-revenue seed, reset link).
  useEffect(() => {
    const parsed = text.trim() === "" ? 0 : Number(text);
    if (parsed !== value) setText(value ? String(value) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <Input
      id={id}
      type="number"
      inputMode="decimal"
      min={min}
      max={max}
      step={step}
      value={text}
      placeholder="0"
      disabled={disabled}
      aria-describedby={ariaDescribedBy}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        const n = raw.trim() === "" ? 0 : Number(raw);
        onChange(Number.isFinite(n) ? n : 0);
      }}
      onBlur={() => {
        const n = text.trim() === "" ? 0 : Number(text);
        const clamped = Math.min(max ?? Infinity, Math.max(min, Number.isFinite(n) ? n : 0));
        if (clamped !== n) {
          setText(clamped ? String(clamped) : "");
          onChange(clamped);
        }
      }}
      className={className}
    />
  );
}
