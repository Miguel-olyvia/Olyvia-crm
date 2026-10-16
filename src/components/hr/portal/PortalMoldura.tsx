/**
 * A moldura do portal temporario da admissao: fora do layout do CRM e sem sessao da app.
 * Cabecalho com a organizacao, "Portal de admissao", o primeiro nome da pessoa e, quando ha
 * sessao, "Terminar sessao"; por baixo o conteudo, num so `<main>` (o titulo de nivel 1 e de
 * cada vista, nunca da moldura).
 */
import type { ReactNode } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";

interface PortalMolduraProps {
  organizacao: string | null;
  nome: string | null;
  /** So com sessao activa: o botao de terminar. */
  aoSair?: () => void;
  aSair?: boolean;
  children: ReactNode;
}

export function PortalMoldura({ organizacao, nome, aoSair, aSair = false, children }: PortalMolduraProps) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-muted/30 text-foreground" data-testid="portal-admissao">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            {organizacao && <p className="truncate text-sm font-semibold">{organizacao}</p>}
            <p className="text-xs text-muted-foreground">{t("portal.titulo")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {nome && (
              <p className="text-sm font-medium">
                <span className="sr-only">{t("portal.pessoa")}: </span>
                {nome}
              </p>
            )}
            {aoSair && (
              <Button
                type="button"
                variant="outline"
                className="min-h-11 gap-2"
                onClick={aoSair}
                aria-disabled={aSair}
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                {t("portal.sair")}
              </Button>
            )}
          </div>
        </div>
      </header>
      <main id="portal-conteudo" className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        {children}
      </main>
    </div>
  );
}
