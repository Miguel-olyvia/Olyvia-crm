import { Trash2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ErroDoCampo, ITEM, N, Rotulo } from "./PecasNovoNegocio";
import { FOCO } from "./estilos";
import type { ErrosLinha, LinhaForm } from "./levantamento";
import { DIVISOES, OUTRO, UNIDADES, trabalhosPorServico } from "./levantamentoExemplo";

export const MAX_OBSERVACOES = 200;

interface Props {
  /** A base dos ids do painel; os da linha são `<id>-linha-<linha.id>-<campo>`. */
  id: string;
  /** A posição da linha (a partir de 1), para o nome da linha e do botão Remover. */
  numero: number;
  linha: LinhaForm;
  servico: string;
  erros: ErrosLinha | undefined;
  aoMudar: (parcial: Partial<LinhaForm>) => void;
  aoRemover: () => void;
}

const trigger = (invalido: boolean) => cn("min-h-11", FOCO, invalido && "border-destructive");
const ligar = (erro: unknown, id: string) => (erro ? `${id}-erro` : undefined);

/** Uma lista fechada com rótulo e erro (a divisão, o trabalho e a unidade têm todas esta forma). */
function CampoLista(props: {
  id: string; rotulo: string; marcador?: string; valor: string; opcoes: readonly (readonly [string, string])[];
  erro?: string; obrigatorio?: boolean; aoMudar: (valor: string) => void;
}) {
  const { id, rotulo, marcador, valor, opcoes, erro, obrigatorio, aoMudar } = props;
  return (
    <div className="space-y-1.5">
      <Rotulo para={id} texto={rotulo} obrigatorio={obrigatorio} />
      <Select value={valor} onValueChange={aoMudar}>
        <SelectTrigger id={id} aria-invalid={erro ? true : undefined} aria-describedby={ligar(erro, id)} className={trigger(!!erro)}>
          <SelectValue placeholder={marcador} />
        </SelectTrigger>
        <SelectContent>
          {opcoes.map(([chave, texto]) => <SelectItem key={chave} value={chave} className={ITEM}>{texto}</SelectItem>)}
        </SelectContent>
      </Select>
      <ErroDoCampo id={`${id}-erro`} chave={erro} />
    </div>
  );
}

/** Uma linha do levantamento: divisão, trabalho (da lista do serviço, ou "Outro"), medida e unidade, e observações. */
export function LinhaLevantamentoForm({ id, numero, linha, servico, erros, aoMudar, aoRemover }: Props) {
  const { t } = useTranslation();
  const base = `${id}-linha-${linha.id}`;
  const trabalhos = [...trabalhosPorServico(servico), OUTRO].map((w) => [w, t(`${N}work.${w}`)] as const);
  const erroMedida = erros?.medida;
  return (
    <fieldset className="space-y-3 rounded-md border border-border p-3">
      <legend className="px-1 text-sm font-semibold text-foreground">{t(`${N}survey.line`, { n: numero })}</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <CampoLista
          id={`${base}-divisao`} rotulo={t(`${N}survey.room`)} marcador={t(`${N}survey.room.placeholder`)} valor={linha.divisao}
          opcoes={DIVISOES.map((d) => [d, t(`${N}room.${d}`)] as const)} obrigatorio
          erro={erros?.divisao && `error.room.${erros.divisao}`} aoMudar={(divisao) => aoMudar({ divisao })}
        />
        <CampoLista
          id={`${base}-trabalho`} rotulo={t(`${N}survey.work`)} marcador={t(`${N}survey.work.placeholder`)} valor={linha.trabalho}
          opcoes={trabalhos} obrigatorio erro={erros?.trabalho && `error.work.${erros.trabalho}`}
          aoMudar={(trabalho) => aoMudar({ trabalho })}
        />
        {linha.trabalho === OUTRO && (
          <div className="space-y-1.5 sm:col-span-2">
            <Rotulo para={`${base}-trabalhoOutro`} texto={t(`${N}survey.workOther`)} obrigatorio />
            <Input
              id={`${base}-trabalhoOutro`} value={linha.trabalhoOutro} autoComplete="off" aria-required="true"
              onChange={(e) => aoMudar({ trabalhoOutro: e.target.value })} aria-invalid={erros?.trabalhoOutro ? true : undefined}
              aria-describedby={ligar(erros?.trabalhoOutro, `${base}-trabalhoOutro`)} className={cn("min-h-11", FOCO)}
            />
            <ErroDoCampo id={`${base}-trabalhoOutro-erro`} chave={erros?.trabalhoOutro && `error.workOther.${erros.trabalhoOutro}`} />
          </div>
        )}
        <div className="space-y-1.5">
          <Rotulo para={`${base}-medida`} texto={t(`${N}survey.measure`)} obrigatorio />
          <Input
            id={`${base}-medida`} type="number" inputMode="decimal" step="any" min="0" value={linha.medida} aria-required="true"
            onChange={(e) => aoMudar({ medida: e.target.value })} aria-invalid={erroMedida ? true : undefined}
            aria-describedby={ligar(erroMedida, `${base}-medida`)} className={cn("min-h-11", FOCO)}
          />
          <ErroDoCampo id={`${base}-medida-erro`} chave={erroMedida && `error.measure.${erroMedida}`} />
        </div>
        <CampoLista
          id={`${base}-unidade`} rotulo={t(`${N}survey.unit`)} valor={linha.unidade}
          opcoes={UNIDADES.map((u) => [u, t(`${N}unit.${u}`)] as const)} aoMudar={(unidade) => aoMudar({ unidade })}
        />
        <div className="space-y-1.5 sm:col-span-2">
          <Rotulo para={`${base}-observacoes`} texto={t(`${N}survey.notes`)} />
          <Input
            id={`${base}-observacoes`} value={linha.observacoes} maxLength={MAX_OBSERVACOES} autoComplete="off"
            onChange={(e) => aoMudar({ observacoes: e.target.value })} className={cn("min-h-11", FOCO)}
          />
        </div>
      </div>
      <div className="flex justify-end">
        <Button
          type="button" variant="outline" onClick={aoRemover} aria-label={t(`${N}survey.remove.label`, { n: numero })}
          className={cn("min-h-11 min-w-11 gap-2", FOCO)}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          {t(`${N}survey.remove`)}
        </Button>
      </div>
    </fieldset>
  );
}
