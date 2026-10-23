// Os dados do levantamento: a data, o estado e o comercial. Um levantamento SEM visita ligada tem os seus próprios: já vêm preenchidos (hoje, por fazer,
// o comercial da sessão) e corrigem-se aqui. Com uma visita ligada herda-os dela e só se leem. Na ficha real o comercial escolhe-se entre os comerciais
// da organização (a mesma lista do «Feito por» das visitas); no exemplo, entre os de exemplo.
import { useEffect } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { opcoesFeitoPorReal } from "./CamposVisita";
import { useDadosNegocio } from "./costuraNegocio";
import { FOCO } from "./estilos";
import type { LevantamentoForm } from "./levantamento";
import type { EstadoLevantamento } from "./negocioMetas";
import { COMERCIAIS_EXEMPLO } from "./novoNegocio";
import { ErroDoCampo, ITEM, N, Rotulo } from "./PecasNovoNegocio";

const CAMPO = cn("min-h-11", FOCO);
const ESTADOS: readonly EstadoLevantamento[] = ["porFazer", "feito"];

interface Props {
  /** A base dos ids: os campos são `<id>-lev-data`, `<id>-lev-estado` e `<id>-lev-rep`. */
  id: string;
  /** Os valores de agora (os do formulário, ou os da visita que o representa). */
  levantamento: LevantamentoForm;
  /** Há uma visita que representa o levantamento: os dados vêm dela e só se leem. */
  deVisita: boolean;
  /** A data própria não é um dia que a base aceite (só se mostra sem visita). */
  erro?: "invalido";
  acoes: { mudar: (parcial: Partial<LevantamentoForm>) => void };
}

export function DadosDoLevantamento({ id, levantamento, deVisita, erro, acoes }: Props) {
  const { t } = useTranslation();
  // Só a ficha real tem `DadosNegocio`: o exemplo e os testes antigos usam os comerciais de exemplo.
  const dados = useDadosNegocio();
  const pedirComerciais = dados?.pedirComerciais;
  useEffect(() => { pedirComerciais?.(); }, [pedirComerciais]);
  // Um nome que o levantamento já traz e já não está na lista (ou que é de outra origem) continua à vista, no fim.
  const comerciais = opcoesFeitoPorReal(dados === null ? COMERCIAIS_EXEMPLO : dados.comerciais ?? [], levantamento.feitoPor);
  const idErro = `${id}-lev-data-erro`;
  const comErro = !deVisita && erro !== undefined;
  return (
    <fieldset className="space-y-3 rounded-md border border-border p-3">
      <legend className="px-1 text-sm font-semibold text-foreground">{t(`${N}survey.data.title`)}</legend>
      <p className="text-sm text-muted-foreground">{t(`${N}survey.data.${deVisita ? "fromVisit" : "own"}`)}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Rotulo para={`${id}-lev-data`} texto={t(`${N}survey.data.date`)} />
          <Input
            id={`${id}-lev-data`} type="date" min="2000-01-01" value={levantamento.data} disabled={deVisita} className={CAMPO}
            aria-invalid={comErro || undefined} aria-describedby={comErro ? idErro : undefined}
            onChange={(e) => acoes.mudar({ data: e.target.value })}
          />
          {comErro && <ErroDoCampo id={idErro} chave="survey.data.error" />}
        </div>
        <div className="space-y-1.5">
          <Rotulo para={`${id}-lev-estado`} texto={t(`${N}survey.status`)} />
          <Select value={levantamento.estado} disabled={deVisita} onValueChange={(estado) => acoes.mudar({ estado: estado as EstadoLevantamento })}>
            <SelectTrigger id={`${id}-lev-estado`} className={CAMPO}><SelectValue /></SelectTrigger>
            <SelectContent>
              {ESTADOS.map((e) => <SelectItem key={e} value={e} className={ITEM}>{t(`${N}survey.status.${e}`)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Rotulo para={`${id}-lev-rep`} texto={t(`${N}survey.data.rep`)} />
          <Select value={levantamento.feitoPor} disabled={deVisita} onValueChange={(feitoPor) => acoes.mudar({ feitoPor })}>
            <SelectTrigger id={`${id}-lev-rep`} className={CAMPO}><SelectValue /></SelectTrigger>
            <SelectContent>
              {comerciais.map((c) => <SelectItem key={c} value={c} className={ITEM}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
    </fieldset>
  );
}
