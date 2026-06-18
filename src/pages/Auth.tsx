import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { checkIsClientRole } from "@/hooks/useClientRole";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import olyviaIcon from "@/assets/olyvia-icon.png";

type AuthMode = "login" | "register" | "forgot-password";

const MIN_PASSWORD_LENGTH = 8;
const AUTH_TIMEOUT_MS = 12000;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 60000;

const Auth = () => {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [rememberMe, setRememberMe] = useState(() => {
    return sessionStorage.getItem("rememberMe") === "true";
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [failedAttempts, setFailedAttempts] = useState(() => parseInt(sessionStorage.getItem("failedAttempts") || "0", 10));
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(() => {
    const val = sessionStorage.getItem("lockoutUntil");
    return val ? parseInt(val, 10) : null;
  });
  const [lockoutCountdown, setLockoutCountdown] = useState(0);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Lockout countdown timer
  useEffect(() => {
    if (!lockoutUntil) return;
    const interval = setInterval(() => {
      const remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        setLockoutUntil(null);
        sessionStorage.removeItem("lockoutUntil");
        setLockoutCountdown(0);
        setFailedAttempts(0);
        sessionStorage.removeItem("failedAttempts");
      } else {
        setLockoutCountdown(remaining);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutUntil]);

  // Privacy decision: remember me only restores the email for the current browser session.
  // Legacy localStorage values are removed so the email is not persisted across sessions.
  useEffect(() => {
    const savedEmail = sessionStorage.getItem("savedEmail");
    if (rememberMe && savedEmail) {
      setEmail(savedEmail);
    }
    localStorage.removeItem("savedEmail");
    localStorage.removeItem("rememberMe");
  }, []);

  // Auth listener BEFORE getSession — prevents race conditions
  useEffect(() => {
    const redirectByRole = async (userId: string) => {
      const isClient = await checkIsClientRole(userId);
      navigate(isClient ? "/client-portal" : "/home");
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        redirectByRole(session.user.id);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        redirectByRole(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const trimmedEmail = email.trim().toLowerCase();

  const validateForm = (): string | null => {
    if (!trimmedEmail) return "Introduza o seu email.";

    if (mode === "register") {
      if (!fullName.trim()) return "Introduza o seu nome completo.";
      if (password.length < MIN_PASSWORD_LENGTH) {
        return `A password deve ter no mínimo ${MIN_PASSWORD_LENGTH} caracteres.`;
      }
    }

    if ((mode === "login" || mode === "register") && !password) {
      return "Introduza a sua password.";
    }

    return null;
  };

  const withAuthTimeout = async <T,>(promise: Promise<T>, action: string): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        window.setTimeout(() => {
          reject(new Error(`${action} demorou demasiado tempo. Tente novamente dentro de instantes.`));
        }, AUTH_TIMEOUT_MS);
      }),
    ]);
  };

  const getErrorMessage = (error: unknown, fallbackAction: string) => {
    const rawMessage = error instanceof Error ? error.message : "";
    const message = rawMessage.toLowerCase();

    if (
      message.includes("demorou demasiado tempo") ||
      message.includes("timeout") ||
      message.includes("network") ||
      message.includes("failed to fetch")
    ) {
      return `${fallbackAction} indisponível de momento. O servidor está lento. Tente novamente dentro de instantes.`;
    }

    return rawMessage || "Ocorreu um erro inesperado.";
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmedEmail) {
      toast({ title: "Erro", description: "Introduza o seu email.", variant: "destructive" });
      return;
    }
    setLoading(true);

    try {
      const { error } = await withAuthTimeout(
        supabase.auth.resetPasswordForEmail(trimmedEmail, {
          redirectTo: `${window.location.origin}/reset-password`,
        }),
        "O pedido de recuperação"
      );

      if (error) throw error;

      toast({
        title: "Email enviado!",
        description: "Verifique a sua caixa de correio para redefinir a password.",
      });
      setMode("login");
    } catch (error: unknown) {
      toast({
        title: "Erro",
        description: getErrorMessage(error, "Recuperação de password"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      toast({ title: "Erro", description: validationError, variant: "destructive" });
      return;
    }

    // Check lockout
    if (lockoutUntil && Date.now() < lockoutUntil) {
      toast({
        title: "Conta temporariamente bloqueada",
        description: `Demasiadas tentativas falhadas. Tente novamente em ${lockoutCountdown}s.`,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      if (mode === "login") {
        const { error } = await withAuthTimeout(
          supabase.auth.signInWithPassword({
            email: trimmedEmail,
            password,
          }),
          "O login"
        );

        if (error) throw error;

        // Reset failed attempts on success
        setFailedAttempts(0);
        sessionStorage.removeItem("failedAttempts");
        setLockoutUntil(null);
        sessionStorage.removeItem("lockoutUntil");

        // Persist only for the current browser session (more privacy than localStorage)
        if (rememberMe) {
          sessionStorage.setItem("rememberMe", "true");
          sessionStorage.setItem("savedEmail", trimmedEmail);
        } else {
          sessionStorage.removeItem("rememberMe");
          sessionStorage.removeItem("savedEmail");
        }
        // Clean any legacy localStorage values from prior versions
        localStorage.removeItem("rememberMe");
        localStorage.removeItem("savedEmail");

        toast({
          title: "Login efetuado!",
          description: "Bem-vindo de volta.",
        });
      } else if (mode === "register") {
        sessionStorage.setItem("showWelcomeOrg", "true");

        const { error: signUpError } = await withAuthTimeout(
          supabase.auth.signUp({
            email: trimmedEmail,
            password,
            options: {
              emailRedirectTo: window.location.origin,
              data: {
                full_name: fullName.trim(),
              },
            },
          }),
          "O registo"
        );

        if (signUpError) {
          sessionStorage.removeItem("showWelcomeOrg");
          if (
            signUpError.message?.toLowerCase().includes("already registered") ||
            signUpError.message?.toLowerCase().includes("already been registered")
          ) {
            throw new Error("Já existe uma conta com este email.");
          }
          throw signUpError;
        }

        toast({
          title: "Conta criada com sucesso!",
          description: "Bem-vindo à Olyvia.",
        });
      }
    } catch (error: unknown) {
      if (mode === "register") {
        sessionStorage.removeItem("showWelcomeOrg");
      }

      // Track failed login attempts
      if (mode === "login") {
        const newAttempts = failedAttempts + 1;
        setFailedAttempts(newAttempts);
        sessionStorage.setItem("failedAttempts", newAttempts.toString());
        if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
          const until = Date.now() + LOCKOUT_DURATION_MS;
          setLockoutUntil(until);
          sessionStorage.setItem("lockoutUntil", until.toString());
          setLockoutCountdown(Math.ceil(LOCKOUT_DURATION_MS / 1000));
          toast({
            title: "Conta temporariamente bloqueada",
            description: `Demasiadas tentativas falhadas. Tente novamente em 60 segundos.`,
            variant: "destructive",
          });
          return;
        }
      }

      toast({
        title: "Erro",
        description: getErrorMessage(error, mode === "login" ? "Login" : "Registo"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getTitle = () => {
    switch (mode) {
      case "login": return "Login";
      case "register": return "Criar Conta";
      case "forgot-password": return "Recuperar Password";
    }
  };

  const getDescription = () => {
    switch (mode) {
      case "login": return "Introduza as suas credenciais para aceder à Olyvia";
      case "register": return "Crie a sua conta e comece a utilizar a Olyvia";
      case "forgot-password": return "Introduza o seu email para receber instruções de recuperação";
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10 relative">
      <Button
        variant="ghost"
        className="absolute top-4 left-4 gap-2"
        onClick={() => navigate("/")}
      >
        <ArrowLeft className="w-4 h-4" />
        Voltar
      </Button>

      <Card className="w-full max-w-md mx-4">
        <CardHeader className="space-y-1 flex flex-col items-center">
          <div className="mb-4 cursor-pointer" onClick={() => navigate("/")}>
            <img
              src={olyviaIcon}
              alt="Olyvia"
              className="h-16 w-16 hover:scale-105 transition-transform"
            />
          </div>
          <CardTitle className="text-2xl font-bold text-center">
            {getTitle()}
          </CardTitle>
          <CardDescription className="text-center">
            {getDescription()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {mode === "forgot-password" ? (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "A enviar..." : "Enviar Email de Recuperação"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "register" && (
                <div className="space-y-2">
                  <Label htmlFor="fullName">Nome Completo</Label>
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="O seu nome completo"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={mode === "register" ? MIN_PASSWORD_LENGTH : undefined}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {mode === "register" && (
                  <p className="text-xs text-muted-foreground">
                    Mínimo {MIN_PASSWORD_LENGTH} caracteres
                  </p>
                )}
              </div>
              {mode === "login" && (
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="rememberMe"
                    checked={rememberMe}
                    onCheckedChange={(checked) => setRememberMe(checked === true)}
                  />
                  <Label
                    htmlFor="rememberMe"
                    className="text-sm font-normal cursor-pointer"
                  >
                    Lembrar-me
                  </Label>
                </div>
              )}
              {lockoutUntil && Date.now() < lockoutUntil && (
                <p className="text-sm text-destructive text-center">
                  Conta bloqueada. Tente novamente em {lockoutCountdown}s.
                </p>
              )}
              <Button type="submit" className="w-full" disabled={loading || !!(lockoutUntil && Date.now() < lockoutUntil)}>
                {loading ? "A processar..." : mode === "login" ? "Entrar" : "Criar Conta"}
              </Button>
            </form>
          )}
          <div className="mt-4 text-center text-sm space-y-2">
            {mode === "login" && (
              <button
                type="button"
                onClick={() => setMode("forgot-password")}
                className="text-muted-foreground hover:text-primary hover:underline block w-full"
              >
                Esqueceu a password?
              </button>
            )}
            {mode === "forgot-password" ? (
              <button
                type="button"
                onClick={() => setMode("login")}
                className="text-primary hover:underline block w-full"
              >
                Voltar ao Login
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setMode(mode === "login" ? "register" : "login")}
                className="text-primary hover:underline block w-full"
              >
                {mode === "login"
                  ? "Não tem conta? Registe-se agora"
                  : "Já tem conta? Faça login"}
              </button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
