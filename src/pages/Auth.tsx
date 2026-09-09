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
import { authLoginSchema, authSignupSchema } from "@/lib/validations";

type AuthMode = "login" | "register" | "forgot-password";

const MIN_PASSWORD_LENGTH = 8;
const AUTH_TIMEOUT_MS = 12000;

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
  // Contagem decrescente do bloqueio: e INFORMACAO, nao uma decisao.
  //
  // Quem bloqueia e o servidor (funcao portal-login + tabela
  // auth_login_attempts, migracao 20261103010000). Este ecra limita-se a
  // repetir o que o servidor disse da ultima vez, para a pessoa saber quanto
  // falta sem ter de tentar as cegas. NAO impede o envio nem desliga o botao:
  // se o servidor entretanto libertar, ou se o bloqueio for de outra conta,
  // quem esta aqui tem de conseguir entrar.
  //
  // Guarda-se com o email a que pertence. Sem isso, falhar numa conta
  // trancava o formulario para TODAS as outras no mesmo separador -- e o
  // servidor conta as tentativas por conta, nao por browser.
  const [lockout, setLockout] = useState<{ email: string; until: number } | null>(() => {
    try {
      const val = sessionStorage.getItem("lockout");
      if (!val) return null;
      const parsed = JSON.parse(val);
      return typeof parsed?.until === "number" && typeof parsed?.email === "string" ? parsed : null;
    } catch {
      return null;
    }
  });
  const [lockoutCountdown, setLockoutCountdown] = useState(0);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Lockout countdown timer
  useEffect(() => {
    if (!lockout) return;
    const interval = setInterval(() => {
      const remaining = Math.ceil((lockout.until - Date.now()) / 1000);
      if (remaining <= 0) {
        setLockout(null);
        sessionStorage.removeItem("lockout");
        setLockoutCountdown(0);
      } else {
        setLockoutCountdown(remaining);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lockout]);

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
    if (mode === "register") {
      const result = authSignupSchema.safeParse({ fullName, email: trimmedEmail, password });
      return result.success ? null : result.error.issues[0]?.message ?? "Dados inválidos.";
    }

    if (mode === "login") {
      const result = authLoginSchema.safeParse({ email: trimmedEmail, password });
      return result.success ? null : result.error.issues[0]?.message ?? "Dados inválidos.";
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

    // Nao se recusa o envio por causa da contagem local: quem decide e o
    // servidor. A contagem pode estar velha, pode ser de outra conta, e o
    // servidor pode ja ter libertado. Tenta-se sempre.

    setLoading(true);

    try {
      if (mode === "login") {
        // Login is brokered through the portal-login Edge Function, which
        // enforces server-side rate limiting (auth_login_attempts table)
        // before performing the actual password grant. This replaces the
        // old sessionStorage-only lockout, which was trivially bypassed by
        // clearing storage or using a private browsing tab.
        const { data: loginData, error: loginError } = await withAuthTimeout(
          supabase.functions.invoke("portal-login", {
            body: { email: trimmedEmail, password },
          }),
          "O login"
        );

        if (loginError) {
          let backendMessage: string | undefined;
          let retryAfterSeconds: number | undefined;
          try {
            const ctx: any = (loginError as any).context;
            let parsedBody: any;
            if (ctx && typeof ctx.json === "function") {
              parsedBody = await ctx.json();
            } else if (ctx && typeof ctx.text === "function") {
              const text = await ctx.text();
              try {
                parsedBody = JSON.parse(text);
              } catch {
                parsedBody = { message: text };
              }
            }
            backendMessage = parsedBody?.message || parsedBody?.error;
            retryAfterSeconds = parsedBody?.retry_after_seconds;
          } catch {
            // ignore parse errors, fall back to generic message below
          }

          if (typeof retryAfterSeconds === "number" && retryAfterSeconds > 0) {
            const until = Date.now() + retryAfterSeconds * 1000;
            const alvo = { email: email.trim().toLowerCase(), until };
            setLockout(alvo);
            sessionStorage.setItem("lockout", JSON.stringify(alvo));
            setLockoutCountdown(retryAfterSeconds);
          }

          throw new Error(backendMessage || loginError.message || "Não foi possível iniciar sessão.");
        }

        if (!loginData?.access_token || !loginData?.refresh_token) {
          throw new Error("Resposta inesperada do servidor de autenticação.");
        }

        const { error: sessionError } = await supabase.auth.setSession({
          access_token: loginData.access_token,
          refresh_token: loginData.refresh_token,
        });
        if (sessionError) throw sessionError;

        // Reset lockout UX state on success
        setLockout(null);
        sessionStorage.removeItem("lockout");

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
          // Deliberately generic for the "already registered" case: confirming
          // that an email already has an account lets an attacker enumerate
          // real accounts one guess at a time. Other errors (weak password,
          // invalid format) don't reveal account existence, so they pass through.
          if (
            signUpError.message?.toLowerCase().includes("already registered") ||
            signUpError.message?.toLowerCase().includes("already been registered")
          ) {
            throw new Error("Não foi possível concluir o registo com os dados fornecidos.");
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

      // O bloqueio (429 do portal-login) ja registou a contagem acima
      // and surfaces its own message via the thrown Error below.
      if (mode === "login" && lockout && Date.now() < lockout.until) {
        toast({
          title: "Conta temporariamente bloqueada",
          description: getErrorMessage(error, "Login"),
          variant: "destructive",
        });
        return;
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
              {lockout && lockout.email === email.trim().toLowerCase() && Date.now() < lockout.until && (
                <p className="text-sm text-destructive text-center">
                  Demasiadas tentativas nesta conta. O servidor deve voltar a aceitar
                  em {lockoutCountdown}s — podes tentar na mesma.
                </p>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
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
