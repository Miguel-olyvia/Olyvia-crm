// A moldura das páginas públicas (sem sessão): o nome da organização, duas ligações e o texto de confiança.
import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { FlaskConical, ShieldCheck } from "lucide-react";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { ORGANIZACAO_EXEMPLO } from "../dados/exemplo";

const LIGACAO = "inline-flex min-h-11 items-center rounded-md px-3 text-sm hover:bg-muted";

export function MolduraPublica({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const classe = ({ isActive }: { isActive: boolean }) => cn(LIGACAO, FOCO, isActive ? "font-semibold text-primary dark:text-violet-300" : "text-foreground");
  return (
    <div className="min-h-screen bg-muted/30 text-foreground">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div>
            <p className="text-xs text-muted-foreground">{ORGANIZACAO_EXEMPLO}</p>
            <p className="font-semibold">{t("cd.canal")}</p>
          </div>
          <nav aria-label={t("cd.navPublica")} className="flex gap-1">
            <NavLink to="/canal-denuncias/nova" className={classe}>{t("cd.nav.nova")}</NavLink>
            <NavLink to="/canal-denuncias/acompanhar" className={classe}>{t("cd.nav.acompanhar")}</NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-6">
        <p className="flex items-start gap-2 text-sm text-foreground/80">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary dark:text-violet-300" aria-hidden="true" />
          {t("cd.confianca")}
        </p>
        {children}
      </main>
      <footer className="mx-auto max-w-3xl px-4 pb-8">
        <p role="note" className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
          {t("cd.exemploPublico")}
        </p>
      </footer>
    </div>
  );
}
