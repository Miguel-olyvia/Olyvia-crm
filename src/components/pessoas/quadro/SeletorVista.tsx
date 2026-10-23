import { Check } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { FOCO } from "@/components/negocio-metas/estilos";
import { VISTAS } from "../filtrosPessoas";
import type { VistaPessoas } from "../pessoasTipos";

interface SeletorVistaProps {
  vista: VistaPessoas;
  aoMudar: (vista: VistaPessoas) => void;
}

/** Lista ou Quadro: o escolhido leva ✓ além da cor. */
export function SeletorVista({ vista, aoMudar }: SeletorVistaProps) {
  const { t } = useTranslation();
  return (
    <div role="group" aria-label={t("pessoasPagina.view.label")} className="inline-flex rounded-lg border border-input bg-card p-0.5">
      {VISTAS.map((v) => (
        <button
          key={v} type="button" aria-pressed={vista === v} onClick={() => aoMudar(v)}
          className={cn(
            "inline-flex min-h-11 min-w-11 cursor-pointer items-center gap-1.5 rounded-md px-3 text-sm motion-reduce:transition-none", FOCO,
            vista === v ? "bg-primary font-medium text-primary-foreground" : "text-foreground hover:bg-accent",
          )}
        >
          {vista === v && <Check className="h-4 w-4" aria-hidden="true" />}
          {t(`pessoasPagina.view.${v === "lista" ? "list" : "board"}`)}
        </button>
      ))}
    </div>
  );
}
