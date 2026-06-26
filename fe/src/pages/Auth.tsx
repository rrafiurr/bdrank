import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { PageHead } from "@/components/PageHead";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Mail, Lock, User, Facebook } from "lucide-react";
import { GoogleLogin } from "@react-oauth/google";
import { isFacebookConfigured, loadFacebookSDK, facebookLogin } from "@/lib/facebook";
import { z } from "zod";

const authSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user, signIn, signUp, signInWithGoogle, signInWithFacebook } = useAuth();
  // Kill switch: set VITE_SOCIAL_LOGIN_ENABLED=false to hide all social login.
  // Unset/anything-else = enabled.
  const socialEnabled = import.meta.env.VITE_SOCIAL_LOGIN_ENABLED !== "false";
  const googleEnabled = socialEnabled && !!(import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined);
  const facebookEnabled = socialEnabled && isFacebookConfigured();
  const [fbReady, setFbReady] = useState(false);

  useEffect(() => {
    if (user) {
      navigate(user.is_product_owner ? "/owner-dashboard" : "/");
    }
  }, [user, navigate]);

  useEffect(() => {
    if (facebookEnabled) {
      loadFacebookSDK().then(() => setFbReady(true)).catch(() => setFbReady(false));
    }
  }, [facebookEnabled]);

  const validateForm = () => {
    try {
      authSchema.parse({ email, password });
      setErrors({});
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: { email?: string; password?: string } = {};
        error.errors.forEach((err) => {
          if (err.path[0] === "email") fieldErrors.email = err.message;
          if (err.path[0] === "password") fieldErrors.password = err.message;
        });
        setErrors(fieldErrors);
      }
      return false;
    }
  };

  const handleGoogle = async (credential: string) => {
    setLoading(true);
    try {
      await signInWithGoogle(credential);
      toast({ title: "Welcome!", description: "Signed in with Google." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleFacebook = async () => {
    setLoading(true);
    try {
      const accessToken = await facebookLogin();
      await signInWithFacebook(accessToken);
      toast({ title: "Welcome!", description: "Signed in with Facebook." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    try {
      if (isLogin) {
        await signIn(email, password);
        toast({ title: "Welcome back!", description: "You have been signed in." });
      } else {
        await signUp(email, password, fullName);
        toast({
          title: "Account created!",
          description: "You have been signed in.",
        });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <PageHead title={isLogin ? "Sign In" : "Create Account"} noindex />
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="h-12 w-12 rounded-lg bg-gradient-warm flex items-center justify-center mx-auto mb-4">
            <span className="text-primary-foreground font-serif font-bold text-2xl">R</span>
          </div>
          <h1 className="font-serif text-3xl font-bold text-foreground">
            {isLogin ? "Welcome Back" : "Join ReviewHub"}
          </h1>
          <p className="text-muted-foreground mt-2">
            {isLogin
              ? "Sign in to continue to your account"
              : "Create an account to start reviewing"}
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-card border border-border rounded-xl p-6 shadow-elegant">
          {/* Email Form */}
          <form onSubmit={handleEmailAuth} className="space-y-4">
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="John Doe"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                />
              </div>
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                />
              </div>
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password}</p>
              )}
            </div>

            <Button type="submit" variant="hero" className="w-full" disabled={loading}>
              {loading ? "Loading..." : isLogin ? "Sign In" : "Create Account"}
            </Button>
          </form>

          {(googleEnabled || facebookEnabled) && (
            <>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">or continue with</span>
                </div>
              </div>

              <div className="space-y-2">
                {googleEnabled && (
                  <div className="flex justify-center">
                    <GoogleLogin
                      onSuccess={(cred) => {
                        if (cred.credential) handleGoogle(cred.credential);
                      }}
                      onError={() =>
                        toast({ title: "Google login failed", variant: "destructive" })
                      }
                      width="320"
                    />
                  </div>
                )}

                {facebookEnabled && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-2"
                    onClick={handleFacebook}
                    disabled={loading || !fbReady}
                  >
                    <Facebook className="h-4 w-4" />
                    Continue with Facebook
                  </Button>
                )}
              </div>
            </>
          )}

          {/* Toggle */}
          <p className="text-center text-sm text-muted-foreground mt-6">
            {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setErrors({});
              }}
              className="text-primary hover:underline font-medium"
            >
              {isLogin ? "Sign up" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
