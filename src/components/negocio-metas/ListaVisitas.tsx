import { Plus } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CartaoVisita } from "./CartaoVisita";
import { N } from "./PecasNovoNegocio";
import { FOCO } from "./estilos";
import type { VisitaNegocio } from "./negocioMetas";
import type { AcoesVisitas } from "./useEstadoNovoNegocio";
import { ordenarVisitas } from "./visitasNegocio";

interface Props {
  id: string;
  visitas: readonly VisitaNegocio[];
  /** O id da visita aberta; `null` com todas fechadas. */
  aberta: string | null;
  acoes: AcoesVisitas;
}

/** Põe o foco num elemento (pelo id) num instante a seguir: o que se acaba de mostrar ainda está a montar. */
function focarDepois(elementoId: string): void {
  setTimeout(() => document.getElementById(elementoId)?.focus(), 0);
}

/**
 * A secção Visitas: as visitas do negócio em cartões por ordem cronológica (1.ª visita, 2.ª visita…), o botão
 * «Adicionar visita» (secundário) e, sem visitas, um estado vazio que diz o que fazer. Uma visita nova abre com o foco na data;
 * ao remover, o foco vai para «Adicionar visita»; ao marcar como feita, para o resumo da visita.
 */
export function ListaVisitas({ id, visitas, aberta, acoes }: Props) {
  const { t } = useTranslation();
  const botao = `${id}-visita-add`;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t(`${N}visits.help`)}</p>
      {visitas.length === 0 && <p className="text-sm text-foreground">{t(`${N}visits.empty`)}</p>}
      {visitas.length > 0 && (
        <ol aria-label={t(`${N}visits.list.label`)} className="space-y-2">
          {ordenarVisitas(visitas).map((v, i) => (
            <CartaoVisita
              key={v.id} id={id} numero={i + 1} visita={v} aberta={aberta === v.id}
              aoAlternar={() => acoes.alternar(v.id)} aoMudar={(parcial) => acoes.alterar(v.id, parcial)}
              aoMarcarFeita={() => { acoes.marcarFeita(v.id); focarDepois(`${id}-${v.id}-toggle`); }}
              aoRemover={() => { acoes.remover(v.id); focarDepois(botao); }}
            />
          ))}
        </ol>
      )}
      <Button
        id={botao} type="button" variant="outline" className={cn("min-h-11 gap-2", FOCO)}
        onClick={() => focarDepois(`${id}-${acoes.adicionar()}-data`)}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        {t(`${N}visits.add`)}
      </Button>
    </div>
  );
}
