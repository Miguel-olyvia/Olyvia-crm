import { Info, Plus } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LinhaLevantamentoForm, MAX_OBSERVACOES } from "./LinhaLevantamentoForm";
import { ErroDoCampo, ITEM, N, Rotulo } from "./PecasNovoNegocio";
import { FOCO } from "./estilos";
import type { ErrosNovoNegocio } from "./novoNegocio";
import { COMERCIAIS_EXEMPLO } from "./novoNegocio";
import type { LevantamentoForm, LinhaForm } from "./levantamento";
import { ESTADOS_LEVANTAMENTO } from "./levantamentoExemplo";

export interface AcoesLevantamento {
  mudar: (parcial: Partial<LevantamentoForm>) => void;
  adicionarLinha: () => void;
  mudarLinha: (id: string, parcial: Partial<LinhaForm>) => void;
  removerLinha: (id: string) => void;
}

interface Props {
  id: string;
  levantamento: LevantamentoForm;
  erros: ErrosNovoNegocio;
  acoes: AcoesLevantamento;
}

const SELECT = cn("min-h-11", FOCO);

/** Data da visita, quem fez e estado do levantamento. */
function CabecalhoLevantamento({ id, levantamento, acoes }: Pick<Props, "id" | "levantamento" | "acoes">) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div className="space-y-1.5">
        <Rotulo para={`${id}-data`} texto={t(`${N}survey.date`)} />
        <Input
          id={`${id}-data`} type="date" value={levantamento.data} className={SELECT}
          onChange={(e) => acoes.mudar({ data: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Rotulo para={`${id}-feitoPor`} texto={t(`${N}survey.by`)} />
        <Select value={levantamento.feitoPor} onValueChange={(feitoPor) => acoes.mudar({ feitoPor })}>
          <SelectTrigger id={`${id}-feitoPor`} className={SELECT}><SelectValue /></SelectTrigger>
          <SelectContent>
            {COMERCIAIS_EXEMPLO.map((c) => <SelectItem key={c} value={c} className={ITEM}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Rotulo para={`${id}-estado`} texto={t(`${N}survey.status`)} />
        <Select value={levantamento.estado} onValueChange={(estado) => acoes.mudar({ estado: estado as LevantamentoForm["estado"] })}>
          <SelectTrigger id={`${id}-estado`} className={SELECT}><SelectValue /></SelectTrigger>
          <SelectContent>
            {ESTADOS_LEVANTAMENTO.map((e) => (
              <SelectItem key={e} value={e} className={ITEM}>{t(`${N}survey.status.${e}`)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

/** A lista de linhas, o total, o botão Adicionar linha e o erro "Feito sem linhas". */
function ListaLinhas({ id, levantamento, erros, acoes }: Props) {
  const { t } = useTranslation();
  const n = levantamento.linhas.length;
  const erro = erros.levantamento;
  return (
    <section aria-labelledby={`${id}-linhas`} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${id}-linhas`} className="text-sm font-semibold text-foreground">{t(`${N}survey.lines`)}</h3>
        <p aria-live="polite" className="text-sm tabular-nums text-muted-foreground">{t(`${N}survey.count${n === 1 ? ".one" : ""}`, { n })}</p>
      </div>
      {n === 0 && <p className="text-sm text-muted-foreground">{t(`${N}survey.empty`)}</p>}
      {levantamento.linhas.map((linha, i) => (
        <LinhaLevantamentoForm
          key={linha.id} id={id} numero={i + 1} linha={linha} erros={erros.linhas?.[linha.id]}
          aoMudar={(parcial) => acoes.mudarLinha(linha.id, parcial)} aoRemover={() => { acoes.removerLinha(linha.id); document.getElementById(`${id}-add`)?.focus(); }}
        />
      ))}
      <div className="space-y-1.5">
        <Button
          id={`${id}-add`} type="button" variant="outline" onClick={acoes.adicionarLinha} className={cn("min-h-11 gap-2", FOCO)}
          aria-describedby={erro ? `${id}-add-erro` : undefined}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t(`${N}survey.add`)}
        </Button>
        <ErroDoCampo id={`${id}-add-erro`} chave={erro && `error.survey.${erro}`} />
      </div>
    </section>
  );
}

/** A aba Levantamento (só exemplo): data, quem fez, estado, as linhas e as observações gerais. */
export function AbaLevantamentoNovoNegocio(props: Props) {
  const { t } = useTranslation();
  const { id, levantamento, acoes } = props;
  return (
    <div className="space-y-4">
      <p role="note" className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm text-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        {t(`${N}survey.help`)}
      </p>
      <CabecalhoLevantamento id={id} levantamento={levantamento} acoes={acoes} />
      <ListaLinhas {...props} />
      <div className="space-y-1.5">
        <Rotulo para={`${id}-obs`} texto={t(`${N}survey.generalNotes`)} />
        <Input
          id={`${id}-obs`} value={levantamento.observacoes} maxLength={MAX_OBSERVACOES} autoComplete="off" className={SELECT}
          onChange={(e) => acoes.mudar({ observacoes: e.target.value })}
        />
      </div>
    </div>
  );
}
