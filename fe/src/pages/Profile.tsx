import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { PageHead } from "@/components/PageHead";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { User, Mail, Camera, Save, ArrowLeft, Star, MessageSquare, ExternalLink, Clock } from "lucide-react";
import type { User as UserType } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";

interface MyReview {
  id: number;
  title: string;
  rating: number;
  is_approved: boolean;
  product: string;
  created_at: string;
}

interface MyComment {
  id: number;
  content: string;
  is_approved: boolean;
  review_id: number;
  review_title: string;
  product: string;
  created_at: string;
}

export default function Profile() {
  const { t, i18n } = useTranslation();
  const { user, token, loading: authLoading, setUser } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user || !token) return;
    apiFetch<UserType>("/profile", {}, token)
      .then((profile) => {
        setUsername(profile.username ?? "");
        setBio(profile.bio ?? "");
        setAvatarUrl(profile.avatar_url ?? "");
      })
      .catch(() => {
        setUsername(user.username ?? "");
        setBio(user.bio ?? "");
        setAvatarUrl(user.avatar_url ?? "");
      })
      .finally(() => setLoading(false));
  }, [user, token]);

  const { data: myReviews = [] } = useQuery<MyReview[]>({
    queryKey: ["my-reviews"],
    queryFn: () => apiFetch("/profile/reviews", {}, token),
    enabled: !!token,
  });

  const { data: myComments = [] } = useQuery<MyComment[]>({
    queryKey: ["my-comments"],
    queryFn: () => apiFetch("/profile/comments", {}, token),
    enabled: !!token,
  });

  const handleSave = async () => {
    if (!user || !token) return;
    setSaving(true);
    try {
      const updated = await apiFetch<UserType>(
        "/profile",
        { method: "PUT", body: JSON.stringify({ username: username.trim(), bio: bio.trim(), avatar_url: avatarUrl.trim() }) },
        token
      );
      setUser(updated);
      toast({ title: t("profile.successTitle"), description: t("profile.successDesc") });
    } catch (error: any) {
      toast({ title: t("profile.errorTitle"), description: error.message || t("profile.failedToUpdate"), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const getInitials = () => {
    if (username) return username.slice(0, 2).toUpperCase();
    if (user?.email) return user.email.slice(0, 2).toUpperCase();
    return "U";
  };

  const StarRow = ({ rating }: { rating: number }) => (
    <span className="flex items-center gap-0.5">
      {[1,2,3,4,5].map(s => (
        <Star key={s} className={`w-3 h-3 ${s <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
      ))}
    </span>
  );

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8 flex items-center justify-center min-h-[400px]">
          <div className="animate-pulse text-muted-foreground">{t("profile.loading")}</div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHead title={t("profile.title")} noindex />
      <Header />

      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <Button variant="ghost" onClick={() => navigate(-1)} className="mb-6 gap-2">
          <ArrowLeft className="h-4 w-4" />
          {t("profile.back")}
        </Button>

        <div className="mb-8">
          <h1 className="font-serif text-3xl font-bold text-foreground">{t("profile.title")}</h1>
          <p className="text-muted-foreground mt-2">{t("profile.subtitle")}</p>
        </div>

        {/* ── Profile edit card ── */}
        <div className="bg-card border border-border rounded-xl p-6 shadow-soft animate-fade-in">
          <div className="flex flex-col items-center mb-8">
            <div className="relative group">
              <Avatar className="h-24 w-24 border-4 border-primary/20">
                <AvatarImage src={avatarUrl} alt={username || t("profile.title")} />
                <AvatarFallback className="bg-gradient-warm text-primary-foreground text-2xl font-serif">
                  {getInitials()}
                </AvatarFallback>
              </Avatar>
              <div className="absolute inset-0 flex items-center justify-center bg-foreground/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                <Camera className="h-6 w-6 text-background" />
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-3">{user?.email}</p>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="username" className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />{t("profile.username")}
              </Label>
              <Input id="username" placeholder={t("profile.usernamePlaceholder")} value={username} onChange={e => setUsername(e.target.value)} className="bg-background" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />{t("profile.email")}
              </Label>
              <Input id="email" type="email" value={user?.email || ""} disabled className="bg-muted cursor-not-allowed" />
              <p className="text-xs text-muted-foreground">{t("profile.emailHint")}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="avatarUrl" className="flex items-center gap-2">
                <Camera className="h-4 w-4 text-muted-foreground" />{t("profile.avatarUrl")}
              </Label>
              <Input id="avatarUrl" type="url" placeholder={t("profile.avatarPlaceholder")} value={avatarUrl} onChange={e => setAvatarUrl(e.target.value)} className="bg-background" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">{t("profile.bio")}</Label>
              <Textarea id="bio" placeholder={t("profile.bioPlaceholder")} value={bio} onChange={e => setBio(e.target.value)} className="bg-background min-h-[120px] resize-none" maxLength={500} />
              <p className="text-xs text-muted-foreground text-right">{bio.length}/500 {t("profile.bioCount")}</p>
            </div>

            <Button onClick={handleSave} disabled={saving} variant="hero" className="w-full gap-2">
              <Save className="h-4 w-4" />
              {saving ? t("profile.saving") : t("profile.saveChanges")}
            </Button>
          </div>
        </div>

        {/* ── Account info ── */}
        <div className="mt-6 bg-card border border-border rounded-xl p-6 shadow-soft">
          <h2 className="font-serif text-xl font-semibold text-foreground mb-4">{t("profile.accountInfo")}</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("profile.memberSince")}</span>
              <span className="text-foreground">
                {user?.created_at ? new Date(user.created_at).toLocaleDateString(i18n.language === "bn" ? "bn-BD" : "en-US", { year: "numeric", month: "long", day: "numeric" }) : "N/A"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("profile.accountId")}</span>
              <span className="text-foreground font-mono text-xs">{user?.id}</span>
            </div>
          </div>
        </div>

        {/* ── My Reviews ── */}
        <div className="mt-6 bg-card border border-border rounded-xl overflow-hidden shadow-soft">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <h2 className="font-serif text-xl font-semibold text-foreground flex items-center gap-2">
              <Star className="h-5 w-5 text-primary" />
              {t("profile.myReviews")}
            </h2>
            <span className="text-sm text-muted-foreground">{myReviews.length} {t("profile.total")}</span>
          </div>

          {myReviews.length === 0 ? (
            <div className="px-6 py-10 text-center text-muted-foreground text-sm">
              {t("profile.noReviews")}{" "}
              <Link to="/write-review" className="text-primary hover:underline">{t("profile.writeOne")}</Link>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {myReviews.map(rv => (
                <li key={rv.id}>
                  <Link to={`/review/${rv.id}`} className="flex items-center gap-4 px-6 py-4 hover:bg-muted/30 transition-colors group">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate group-hover:text-primary transition-colors">{rv.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{rv.product} · {new Date(rv.created_at).toLocaleDateString(i18n.language === "bn" ? "bn-BD" : "en-US")}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <StarRow rating={rv.rating} />
                      {!rv.is_approved && (
                        <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 text-xs">{t("profile.pending")}</Badge>
                      )}
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── My Comments ── */}
        <div className="mt-6 mb-8 bg-card border border-border rounded-xl overflow-hidden shadow-soft">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <h2 className="font-serif text-xl font-semibold text-foreground flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              {t("profile.myComments")}
            </h2>
            <span className="text-sm text-muted-foreground">{myComments.length} {t("profile.total")}</span>
          </div>

          {myComments.length === 0 ? (
            <div className="px-6 py-10 text-center text-muted-foreground text-sm">
              {t("profile.noComments")}
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {myComments.map(cm => (
                <li key={cm.id}>
                  <Link to={`/review/${cm.review_id}`} className="flex items-start gap-4 px-6 py-4 hover:bg-muted/30 transition-colors group">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground/80 line-clamp-2 mb-1">{cm.content}</p>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {new Date(cm.created_at).toLocaleDateString(i18n.language === "bn" ? "bn-BD" : "en-US")}
                        <span>·</span>
                        <span className="truncate">{t("profile.on")} <span className="font-medium text-foreground/70 group-hover:text-primary transition-colors">{cm.review_title}</span></span>
                        <span>·</span>
                        <span>{cm.product}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
                      {!cm.is_approved && (
                        <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 text-xs">{t("profile.pending")}</Badge>
                      )}
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
