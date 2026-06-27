import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageHead } from "@/components/PageHead";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { apiFetch } from "@/lib/api";
import { BadgeCheck, Building2, Mail, Lock, User } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function OwnerRegister() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "", full_name: "", company_name: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (form.password.length < 8) { setError(t("ownerRegister.passwordTooShort")); return; }
    setLoading(true);
    try {
      await apiFetch("/auth/register/owner", {
        method: "POST",
        body: JSON.stringify(form),
      }, null);
      setDone(true);
    } catch (err: any) {
      setError(err.message ?? t("ownerRegister.registrationFailed"));
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="pt-24 pb-16 flex items-center justify-center px-4">
          <div className="max-w-md w-full text-center">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
              <BadgeCheck className="h-8 w-8 text-primary" />
            </div>
            <h1 className="font-display text-2xl font-bold text-foreground mb-3">{t("ownerRegister.successTitle")}</h1>
            <p className="text-muted-foreground mb-6">
              {t("ownerRegister.successDesc")}
            </p>
            <Button asChild variant="outline">
              <Link to="/">{t("ownerRegister.backToHome")}</Link>
            </Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHead
        title="Product Owner Portal"
        description="Register as a verified product owner on ReviewHub to respond to reviews and engage with your customers."
        noindex
      />
      <Header />
      <main className="pt-24 pb-16 flex items-center justify-center px-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Building2 className="h-7 w-7 text-primary" />
            </div>
            <h1 className="font-display text-3xl font-bold text-foreground">{t("ownerRegister.heading")}</h1>
            <p className="text-muted-foreground mt-2">
              {t("ownerRegister.subtitle")}
            </p>
          </div>

          <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200 mb-6">
              <BadgeCheck className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-amber-700">
                {t("ownerRegister.verificationNotice")}{" "}
                <strong>{t("ownerRegister.officialBadge")}</strong>{" "}
                {t("ownerRegister.badgeSuffix")}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="company_name">{t("ownerRegister.companyLabel")}</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="company_name"
                    placeholder={t("ownerRegister.companyPlaceholder")}
                    value={form.company_name}
                    onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="full_name">{t("ownerRegister.fullNameLabel")}</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="full_name"
                    placeholder={t("ownerRegister.fullNamePlaceholder")}
                    value={form.full_name}
                    onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">{t("ownerRegister.emailLabel")}</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder={t("ownerRegister.emailPlaceholder")}
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">{t("ownerRegister.passwordLabel")}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder={t("ownerRegister.passwordPlaceholder")}
                    value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? t("ownerRegister.submitting") : t("ownerRegister.submitApplication")}
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground mt-6">
              {t("ownerRegister.haveAccount")}{" "}
              <Link to="/auth" className="text-primary hover:underline font-medium">{t("ownerRegister.signIn")}</Link>
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
