// As fases de um negócio na ficha, numa lista ordenada: ✓ nas feitas, • na atual, ○ nas que faltam e ✗ onde se perdeu. O estado diz-se
// sempre por texto (só para o leitor de ecrã, e a atual leva aria-current), nunca só pelo ícone ou pela cor.
import { Check, Circle, CircleDot, X } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import type { EstadoFase, FaseVista } from "./fasesDoNegocio";

const P = "pessoasPagina.phases.";

const ICONE = { feita: Check, atual: CircleDot, porFazer: Circle, perdida: X } as const;
const COR_ICONE: Record<EstadoFase, string> = {
  feita: "text-emerald-600 dark:text-emerald-400",
  atual: "text-primary dark:text-violet-300",
  porFazer: "text-muted-foreground",
  perdida: "text-destructive",
};
const COR_TEXTO: Record<EstadoFase, string> = {
  feita: "text-foreground",
  atual: "font-semibold text-foreground",
  porFazer: "text-muted-foreground",
  perdida: "font-semibold text-foreground",
};

export function FasesDoNegocioLista({ fases }: { fases: readonly FaseVista[] }) {
  const { t } = useTranslation();
  return (
    <ol className="space-y-1.5">
      {fases.map((f) => {
        const Icone = ICONE[f.estado];
        return (
          <li key={f.id} aria-current={f.estado === "atual" ? "step" : undefined} className="flex items-center gap-2 text-[15px]">
            <Icone aria-hidden="true" className={cn("h-4 w-4 shrink-0", COR_ICONE[f.estado])} />
            <span className={COR_TEXTO[f.estado]}>{t(`${P}${f.id}`)}</span>
            <span className="sr-only">, {t(`${P}state.${f.estado}`)}</span>
          </li>
        );
      })}
    </ol>
  );
}
