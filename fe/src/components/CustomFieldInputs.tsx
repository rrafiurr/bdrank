import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "react-i18next";
import type { ApiReviewField } from "@/lib/api";

interface Props {
  fields: ApiReviewField[];
  values: Record<number, string>;
  onChange: (fieldId: number, value: string) => void;
}

/**
 * Renders the admin-defined fields for the selected product or category.
 * The server re-resolves and re-validates on submit, so nothing here is a
 * security boundary — it exists to tell the reviewer what is expected.
 */
export function CustomFieldInputs({ fields, values, onChange }: Props) {
  const { t } = useTranslation();
  if (fields.length === 0) return null;

  return (
    <>
      {fields.map((f) => (
        <div key={f.id} className="space-y-2">
          <Label htmlFor={`cf-${f.id}`}>
            {f.label}
            {f.is_required && <span className="ml-1 text-destructive">*</span>}
          </Label>

          {f.type === "select" ? (
            <select
              id={`cf-${f.id}`}
              value={values[f.id] ?? ""}
              onChange={(e) => onChange(f.id, e.target.value)}
              className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">{t("reviewForm.selectPlaceholder")}</option>
              {f.options.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          ) : (
            <Input
              id={`cf-${f.id}`}
              type={f.type === "number" ? "number" : f.type === "url" ? "url" : "text"}
              inputMode={f.type === "number" ? "decimal" : undefined}
              min={f.min_value ?? undefined}
              max={f.max_value ?? undefined}
              value={values[f.id] ?? ""}
              onChange={(e) => onChange(f.id, e.target.value)}
              className="bg-background"
            />
          )}

          {f.help_text && <p className="text-xs text-muted-foreground">{f.help_text}</p>}
        </div>
      ))}
    </>
  );
}
