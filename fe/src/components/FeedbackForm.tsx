import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { FEEDBACK_TYPES, feedbackApi, type FeedbackType } from "@/lib/feedbackApi";
import { FEEDBACK_TYPE_ICON } from "@/lib/feedbackDisplay";
import {
  FEEDBACK_MAX,
  FEEDBACK_MAX_LINKS,
  FEEDBACK_MAX_OPEN,
  FEEDBACK_MIN,
  charCount,
  checkFeedbackMessage,
} from "@/lib/feedbackRules";

/** A rate-limit wait in the largest sensible unit, with localized digits. */
function waitText(t: TFunction, seconds: number) {
  if (seconds < 60) return t("feedback.wait.seconds", { count: seconds });
  if (seconds < 3600) return t("feedback.wait.minutes", { count: Math.ceil(seconds / 60) });
  return t("feedback.wait.hours", { count: Math.ceil(seconds / 3600) });
}

/** The translated message for an error code from the client rules or the server. */
function errorText(t: TFunction, code: string, retryAfter?: number) {
  switch (code) {
    case "message_too_short":
      return t("feedback.errors.message_too_short", { min: FEEDBACK_MIN });
    case "message_too_long":
      return t("feedback.errors.message_too_long", { max: FEEDBACK_MAX });
    case "too_many_links":
      return t("feedback.errors.too_many_links", { max: FEEDBACK_MAX_LINKS });
    case "too_many_open":
      return t("feedback.errors.too_many_open", { max: FEEDBACK_MAX_OPEN });
    case "rate_limited":
      return t("feedback.errors.rate_limited", { wait: waitText(t, retryAfter ?? 60) });
    case "message_low_effort":
    case "invalid_type":
    case "invalid_body":
    case "duplicate":
    case "paused":
    case "rate_limit_unavailable":
      return t(`feedback.errors.${code}`);
    default:
      return t("feedback.errors.network");
  }
}

/** Codes about the message text are shown under the textarea; the rest above the button. */
const MESSAGE_CODES = new Set(["message_too_short", "message_too_long", "message_low_effort", "too_many_links"]);

export function FeedbackForm() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const location = useLocation();
  // Entry links pass the page the user was on, so a bug report says where it happened.
  const from = (location.state as { from?: string } | null)?.from;

  const [type, setType] = useState<FeedbackType | null>(null);
  const [message, setMessage] = useState("");
  const [typeError, setTypeError] = useState<string | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const count = charCount(message);

  const reset = () => {
    setType(null);
    setMessage("");
    setTypeError(null);
    setMessageError(null);
    setFormError(null);
    setSent(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    setFormError(null);

    const typeErr = type ? null : t("feedback.errors.invalid_type");
    const ruleCode = checkFeedbackMessage(message);
    setTypeError(typeErr);
    setMessageError(ruleCode ? errorText(t, ruleCode) : null);
    if (typeErr) {
      document.getElementById("feedback-type-bug")?.focus();
      return;
    }
    if (ruleCode) {
      document.getElementById("feedback-message")?.focus();
      return;
    }

    setSending(true);
    try {
      await feedbackApi.create(token, { type: type!, message, page_path: from });
      qc.invalidateQueries({ queryKey: ["feedback-mine"] });
      setSent(true);
    } catch (err) {
      if (err instanceof ApiError && err.code) {
        const text = errorText(t, err.code, err.retryAfter);
        if (MESSAGE_CODES.has(err.code)) setMessageError(text);
        else setFormError(text);
      } else {
        toast({ title: t("feedback.errors.network"), variant: "destructive" });
      }
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="text-center py-6" role="status">
        <CheckCircle2 className="h-12 w-12 text-primary mx-auto mb-4" />
        <h2 className="font-serif text-2xl font-semibold text-foreground mb-2">{t("feedback.thanksTitle")}</h2>
        <p className="text-muted-foreground mb-6 max-w-md mx-auto">{t("feedback.thanksBody")}</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild variant="hero" className="rounded-full px-6">
            <Link to="/profile#my-feedback">{t("feedback.seeYours")}</Link>
          </Button>
          <Button variant="outline" className="rounded-full px-6" onClick={reset}>
            {t("feedback.sendAnother")}
          </Button>
        </div>
      </div>
    );
  }

  const hint = t(`feedback.hints.${type ?? "other"}`);

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <fieldset>
        <legend className="text-sm font-medium text-foreground mb-3">{t("feedback.typeLabel")}</legend>
        <div className="flex flex-wrap gap-2" aria-describedby={typeError ? "feedback-type-error" : undefined}>
          {FEEDBACK_TYPES.map((key) => {
            const Icon = FEEDBACK_TYPE_ICON[key];
            const active = type === key;
            return (
              <button
                key={key}
                id={`feedback-type-${key}`}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setType(key);
                  setTypeError(null);
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/30"
                )}
              >
                <Icon className="h-4 w-4" />
                {t(`feedback.types.${key}`)}
              </button>
            );
          })}
        </div>
        {typeError && (
          <p id="feedback-type-error" className="text-xs text-destructive mt-2">
            {typeError}
          </p>
        )}
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="feedback-message">{t("feedback.messageLabel")}</Label>
        <p id="feedback-message-hint" className="text-xs text-muted-foreground">
          {hint}
        </p>
        <Textarea
          id="feedback-message"
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            if (messageError) setMessageError(null);
          }}
          aria-invalid={Boolean(messageError) || undefined}
          aria-describedby={messageError ? "feedback-message-error" : "feedback-message-hint feedback-message-count"}
          className={cn("min-h-[180px] bg-background", messageError && "border-destructive focus-visible:ring-destructive")}
        />
        <div className="flex items-start justify-between gap-3">
          {messageError ? (
            <p id="feedback-message-error" className="text-xs text-destructive">
              {messageError}
            </p>
          ) : (
            <span />
          )}
          <span
            id="feedback-message-count"
            className={cn("text-xs tabular-nums shrink-0", count > FEEDBACK_MAX ? "text-destructive" : "text-muted-foreground")}
          >
            {t("feedback.counter", { count, max: FEEDBACK_MAX })}
          </span>
        </div>
      </div>

      {formError && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {formError}
        </div>
      )}

      <Button type="submit" variant="hero" className="w-full sm:w-auto rounded-full px-6" disabled={sending}>
        {sending ? t("feedback.sending") : t("feedback.submit")}
      </Button>
    </form>
  );
}
