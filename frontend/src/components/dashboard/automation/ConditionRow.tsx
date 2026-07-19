"use client";

import { X } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { LabeledSlider } from "@/components/ui/LabeledSlider";
import { Button } from "@/components/ui/Button";
import { CONDITION_FIELDS, CONDITION_FIELD_ORDER, OPERATORS, OPERATOR_LABELS } from "@/lib/conditionFields";
import type { BiometricField, WellnessField, ComparisonOperator } from "@moodsync/shared";

export interface ConditionDraft {
  id: string;
  field: BiometricField | WellnessField;
  operator: ComparisonOperator;
  value: number;
}

/** One AND-ed condition row — "Heart Rate is above 95 BPM" — rendered as
 * a field picker, an English-language operator picker, and a slider
 * whose range/unit come from `CONDITION_FIELDS` so a raw "95" never
 * appears without knowing it means BPM. `onRemove` is omitted for the
 * last remaining row (a rule needs at least one condition slot, even if
 * its checkbox is off — RuleForm.tsx owns that decision). */
export function ConditionRow({
  condition,
  onChange,
  onRemove,
}: {
  condition: ConditionDraft;
  onChange: (next: ConditionDraft) => void;
  onRemove?: () => void;
}) {
  const meta = CONDITION_FIELDS[condition.field];

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-3.5">
      <div className="flex items-center gap-2">
        <Select
          className="w-auto flex-1"
          value={condition.field}
          onChange={(e) => {
            const nextField = e.target.value as BiometricField | WellnessField;
            const nextMeta = CONDITION_FIELDS[nextField];
            // Re-center the value in the new field's real range so
            // switching from e.g. "Steps" (0-30,000) to "Sleep Score"
            // (0-100) doesn't silently carry over a nonsensical number.
            onChange({ ...condition, field: nextField, value: Math.round((nextMeta.min + nextMeta.max) / 2) });
          }}
        >
          <optgroup label="Raw biometrics">
            {CONDITION_FIELD_ORDER.filter((f) => CONDITION_FIELDS[f].group === "Raw biometrics").map((f) => (
              <option key={f} value={f}>
                {CONDITION_FIELDS[f].label}
              </option>
            ))}
          </optgroup>
          <optgroup label="MoodSync wellness scores">
            {CONDITION_FIELD_ORDER.filter((f) => CONDITION_FIELDS[f].group === "MoodSync wellness scores").map((f) => (
              <option key={f} value={f}>
                {CONDITION_FIELDS[f].label}
              </option>
            ))}
          </optgroup>
        </Select>
        <Select
          className="w-auto"
          value={condition.operator}
          onChange={(e) => onChange({ ...condition, operator: e.target.value as ComparisonOperator })}
        >
          {OPERATORS.map((o) => (
            <option key={o} value={o}>
              {OPERATOR_LABELS[o]}
            </option>
          ))}
        </Select>
        {onRemove && (
          <Button type="button" variant="ghost" className="!px-2" onClick={onRemove} aria-label="Remove condition">
            <X size={15} aria-hidden="true" />
          </Button>
        )}
      </div>
      <LabeledSlider
        label={meta.label}
        value={condition.value}
        min={meta.min}
        max={meta.max}
        step={meta.step}
        onChange={(value) => onChange({ ...condition, value })}
        formatValue={meta.format}
      />
    </div>
  );
}
