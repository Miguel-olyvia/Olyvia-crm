import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { PortalSeletorIdioma, usePortalT } from "@/portal-i18n";
import { chaveDoErroDePassword } from "./primeiroLoginValidacao";

interface FirstLoginModalProps {
  open: boolean;
  onPasswordChanged: () => void;
}

export function FirstLoginModal({ open, onPasswordChanged }: FirstLoginModalProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { t } = usePortalT();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // As regras são as do passwordResetSchema (partilhado com o CRM); a mensagem é a do idioma do portal.
    const chaveDoErro = chaveDoErroDePassword({ password, confirmPassword });
    if (chaveDoErro) {
      toast({ title: t("pc.login.erro.titulo"), description: t(chaveDoErro), variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast({ title: t("pc.login.sucesso.titulo"), description: t("pc.login.sucesso.descricao") });
      onPasswordChanged();
    } catch (err: any) {
      captureFlowError(err, "client-portal-access");
      // A mensagem vem do Supabase Auth (em inglês) e fica como vem.
      toast({ title: t("pc.login.erro.alterar"), description: err.message, variant: "destructive" });
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
            <DialogTitle>{t("pc.login.titulo")}</DialogTitle>
          </div>
          <DialogDescription>
            {t("pc.login.descricao")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="new-password">{t("pc.login.novaPassword")}</Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("pc.login.novaPlaceholder")}
                required
                minLength={8}
                className="pr-12"
              />
              <button
                type="button"
                className="absolute right-0 top-0 h-11 w-11 flex items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? t("pc.login.esconderPassword") : t("pc.login.mostrarPassword")}
              >
                {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">{t("pc.login.confirmarPassword")}</Label>
            <Input
              id="confirm-password"
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t("pc.login.confirmarPlaceholder")}
              required
              minLength={8}
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t("pc.login.aAlterar") : t("pc.login.submeter")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
