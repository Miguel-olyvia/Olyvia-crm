import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, LogOut, ShieldCheck } from "lucide-react";
import { spMarkPasswordChanged } from "@/lib/supplierPortal/spRpc";
import { validarNovaPassword } from "@/lib/supplierPortal/validarPassword";
import { PortalSeletorIdioma, usePortalT } from "@/portal-i18n";

interface SupplierFirstLoginModalProps {
  open: boolean;
  onDone: () => void;
}

/**
 * Caso de recurso (contrato F3.1, 7.1): o fornecedor entrou sem a marca de
 * password definida (p.ex. a chamada sp_mark_password_changed falhou no
 * /reset-password). Pede uma nova password e marca-a. Não usa nada do portal
 * do cliente.
 *
 * A validação é local (validarNovaPassword) e não o passwordResetSchema do CRM, para as mensagens
 * seguirem o idioma do portal. Uma mensagem de erro do Supabase Auth ao gravar fica como vem.
 */
export function SupplierFirstLoginModal({ open, onDone }: SupplierFirstLoginModalProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { t } = usePortalT();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  // Saída para não ficar preso se o servidor recusar ou falhar sempre (igual ao "Sair" do layout).
  const logout = async () => {
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
    } finally {
      navigate("/auth", { replace: true });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const invalid = validarNovaPassword(password, confirmPassword, t);
    if (invalid) {
      toast({ title: t("sp.primeiroAcesso.erro.titulo"), description: invalid, variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      try {
        await spMarkPasswordChanged();
      } catch {
        // A password já ficou definida; se a marca falhar, o modal volta a
        // aparecer no próximo acesso — não se bloqueia a pessoa agora.
      }
      toast({
        title: t("sp.primeiroAcesso.aviso.definida"),
        description: t("sp.primeiroAcesso.aviso.definidaDescricao"),
      });
      setPassword("");
      setConfirmPassword("");
      onDone();
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      toast({
        title: t("sp.primeiroAcesso.aviso.falhou"),
        description: message || t("sp.primeiroAcesso.aviso.falhouDescricao"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent
        className="sm:max-w-md"
        hideClose
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        {/* O seletor do cabeçalho do portal fica inerte atrás do modal: este é o que se usa aqui. */}
        <PortalSeletorIdioma compacto className="absolute right-4 top-4" />
        <DialogHeader className="pr-28">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
            <DialogTitle>{t("sp.primeiroAcesso.password.titulo")}</DialogTitle>
          </div>
          <DialogDescription>{t("sp.primeiroAcesso.password.descricao")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="sp-new-password">{t("sp.primeiroAcesso.password.nova")}</Label>
            <div className="relative">
              <Input
                id="sp-new-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("sp.primeiroAcesso.password.novaDica")}
                required
                minLength={8}
                className="h-11 pr-12"
              />
              <button
                type="button"
                className="absolute right-0 top-0 h-11 w-11 flex items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? t("sp.primeiroAcesso.password.esconder") : t("sp.primeiroAcesso.password.mostrar")}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sp-confirm-password">{t("sp.primeiroAcesso.password.confirmar")}</Label>
            <Input
              id="sp-confirm-password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t("sp.primeiroAcesso.password.confirmarDica")}
              required
              minLength={8}
              className="h-11"
            />
          </div>

          <Button type="submit" className="w-full h-11" disabled={loading}>
            {loading ? t("sp.primeiroAcesso.password.aGuardar") : t("sp.primeiroAcesso.password.definir")}
          </Button>
        </form>

        <div className="flex justify-center border-t pt-3">
          <Button
            type="button"
            variant="ghost"
            className="h-11 min-w-11 gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            onClick={() => void logout()}
            disabled={signingOut || loading}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {t("sp.primeiroAcesso.password.sair")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
