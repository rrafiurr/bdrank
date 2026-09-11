import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { ApiReviewField } from "@/lib/api";

interface Props {
  fields: ApiReviewField[];
  values: Record<number, string>;
  onChange: (fieldId: number, value: string) => void;
  /** Validation messages keyed `cf-<fieldId>`, shared with the parent form. */
  errors?: Record<string, string>;
}

/**
 * Renders the admin-defined fields for the selected product or category.
 * The server re-resolves and re-validates on submit, so nothing here is a
 * security boundary — it exists to tell the reviewer what is expected.
 */
export function CustomFieldInputs({ fields, values, onChange, errors = {} }: Props) {
  const { t } = useTranslation();
  if (fields.length === 0) return null;

  return (
    <>
      {fields.map((f) => {
        const error = errors[`cf-${f.id}`];
        const describedBy = error ? `cf-${f.id}-error` : f.help_text ? `cf-${f.id}-help` : undefined;
        return (
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
                aria-invalid={Boolean(error) || undefined}
                aria-describedby={describedBy}
                className={cn(
                  "w-full h-10 rounded-md border border-input bg-background px-3 text-sm",
                  error && "border-destructive"
                )}
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
                aria-invalid={Boolean(error) || undefined}
                aria-describedby={describedBy}
                className={cn("bg-background", error && "border-destructive focus-visible:ring-destructive")}
              />
            )}

            {error ? (
              <p id={`cf-${f.id}-error`} className="text-xs text-destructive">{error}</p>
            ) : (
              f.help_text && (
                <p id={`cf-${f.id}-help`} className="text-xs text-muted-foreground">{f.help_text}</p>
              )
            )}
          </div>
        );
      })}
    </>
  );
}
