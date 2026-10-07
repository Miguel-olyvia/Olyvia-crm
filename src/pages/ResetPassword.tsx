import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff } from "lucide-react";
import olyviaIcon from "@/assets/olyvia-icon.png";
import { passwordResetSchema } from "@/lib/validations";
import { fetchAccessKind } from "@/hooks/useClientRole";
import { spMarkPasswordChanged } from "@/lib/supplierPortal/spRpc";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";

const MIN_PASSWORD_LENGTH = 8;

// Link enviado pela edge function create-supplier-portal-access:
// /reset-password?token_hash=<hash>&type=recovery (ou invite).
function readTokenHashParams(): { tokenHash: string } | null {
  const params = new URLSearchParams(window.location.search);
  const tokenHash = params.get("token_hash");
  const type = params.get("type");
  if (!tokenHash || (type !== "recovery" && type !== "invite")) return null;
  return { tokenHash };
}

// O token é de uso único. Em desenvolvimento o StrictMode corre o efeito duas
// vezes: a 2.ª verificação falharia e mostraria "Link inválido". Partilha-se a
// mesma promessa por token_hash.
const tokenVerifications = new Map<string, Promise<boolean>>();
function verifyTokenHashOnce(tokenHash: string): Promise<boolean> {
  let pending = tokenVerifications.get(tokenHash);
  if (!pending) {
    pending = supabase.auth
      .verifyOtp({ token_hash: tokenHash, type: "recovery" })
      .then(({ data, error }) => !error && !!data?.session)
      .catch(() => false);
    tokenVerifications.set(tokenHash, pending);
  }
  return pending;
}

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  // Link do convite/reposição com token_hash (portal do fornecedor): enquanto
  // o verifyOtp corre mostra-se um carregamento em vez de "Link inválido".
  const [verifyingToken, setVerifyingToken] = useState(() => readTokenHashParams() !== null);
  // Link com token_hash aberto num browser com outra sessão: confirmar antes.
  const [sessionConflict, setSessionConflict] = useState<{ tokenHash: string; email: string } | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const runTokenVerification = useCallback((tokenHash: string, isCancelled: () => boolean) => {
    void verifyTokenHashOnce(tokenHash).then((ok) => {
      // O token é de uso único: limpa-se o URL para um refresh não o reenviar.
      window.history.replaceState(window.history.state, "", window.location.pathname);
      if (isCancelled()) return;
      if (ok) setIsRecovery(true);
      setVerifyingToken(false);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsRecovery(true);
      }
    });

    // Check if already in a recovery session (hash fragment contains type=recovery)
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setIsRecovery(true);
    }

    // ?token_hash=…&type=recovery|invite (contrato F3.1, 1.2 passo 3). O
    // cliente usa PKCE e não trata este formato sozinho: verifica-se aqui.
    // Se já houver uma sessão neste browser, o verifyOtp substitui-a: pede-se
    // confirmação antes (não se sabe de quem é o link sem o consumir).
    const tokenParams = readTokenHashParams();
    if (tokenParams) {
      const { tokenHash } = tokenParams;
      if (tokenVerifications.has(tokenHash)) {
        // Já confirmado/em curso (2.ª passagem do StrictMode): só aguardar.
        runTokenVerification(tokenHash, () => cancelled);
      } else {
        void supabase.auth.getSession().then(({ data: { session } }) => {
          if (cancelled) return;
          if (session?.user) {
            setSessionConflict({ tokenHash, email: session.user.email ?? "outra conta" });
            setVerifyingToken(false);
            return;
          }
          runTokenVerification(tokenHash, () => cancelled);
        });
      }
    }

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [runTokenVerification]);

  const handleConfirmSessionSwitch = async () => {
    if (!sessionConflict) return;
    const { tokenHash } = sessionConflict;
    setSessionConflict(null);
    setVerifyingToken(true);
    // Só esta aba/browser: as outras sessões do utilizador ficam intactas.
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    runTokenVerification(tokenHash, () => false);
  };

  const handleCancelSessionSwitch = () => {
    setSessionConflict(null);
    navigate("/", { replace: true });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validation = passwordResetSchema.safeParse({ password, confirmPassword });
    if (!validation.success) {
      toast({
        title: "Erro",
        description: validation.error.issues[0]?.message || "Dados inválidos.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { data: updated, error } = await supabase.auth.updateUser({ password });

      if (error) throw error;

      toast({
        title: "Password atualizada!",
        description: "A sua password foi alterada com sucesso.",
      });

      // Encaminhar pelo tipo de conta (contrato F3.1, 1.2 passo 4). Se a
      // classificação falhar, segue para /home como antes (os guards
      // reencaminham a partir daí).
      let kind: Awaited<ReturnType<typeof fetchAccessKind>> | null = null;
      try {
        kind = await fetchAccessKind(updated?.user?.id ?? null);
      } catch {
        kind = null;
      }

      if (kind === "supplier_only") {
        try {
          await spMarkPasswordChanged();
        } catch {
          // Ignorado de propósito (contrato 2.3): o portal volta a pedir a
          // password no primeiro acesso se a marca não ficar gravada.
        }
        navigate("/supplier-portal");
        return;
      }
      if (kind === "client_only") {
        navigate("/client-portal");
        return;
      }

      navigate("/home");
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (sessionConflict) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10">
        <Card className="w-full max-w-md mx-4">
          <CardHeader className="flex flex-col items-center">
            <img src={olyviaIcon} alt="Olyvia" className="h-16 w-16 mb-4" />
            <CardTitle className="text-xl font-bold text-center">Terminar a sessão atual?</CardTitle>
            <CardDescription className="text-center break-words">
              Este link vai terminar a sessão de <span className="font-medium text-foreground">{sessionConflict.email}</span> neste
              browser. Continuar?
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button className="w-full h-11" onClick={() => void handleConfirmSessionSwitch()}>
              Continuar
            </Button>
            <Button className="w-full h-11" variant="outline" onClick={handleCancelSessionSwitch}>
              Cancelar
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isRecovery && verifyingToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10">
        <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
          <OlyviaLoader size={40} />
          <p className="text-sm text-muted-foreground">A validar o link…</p>
        </div>
      </div>
    );
  }

  if (!isRecovery) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10">
        <Card className="w-full max-w-md mx-4">
          <CardHeader className="flex flex-col items-center">
            <img src={olyviaIcon} alt="Olyvia" className="h-16 w-16 mb-4" />
            <CardTitle className="text-2xl font-bold text-center">
              Link inválido
            </CardTitle>
            <CardDescription className="text-center">
              Este link de recuperação é inválido ou já expirou.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate("/auth")}>
              Voltar ao Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-background to-accent/10">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="flex flex-col items-center">
          <img src={olyviaIcon} alt="Olyvia" className="h-16 w-16 mb-4" />
          <CardTitle className="text-2xl font-bold text-center">
            Nova Password
          </CardTitle>
          <CardDescription className="text-center">
            Introduza a sua nova password
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Nova Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={MIN_PASSWORD_LENGTH}
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
              <p className="text-xs text-muted-foreground">
                Mínimo {MIN_PASSWORD_LENGTH} caracteres
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmar Password</Label>
              <Input
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={MIN_PASSWORD_LENGTH}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "A atualizar..." : "Atualizar Password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;
