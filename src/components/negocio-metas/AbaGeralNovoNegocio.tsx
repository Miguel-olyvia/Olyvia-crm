import type { RefObject } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CamposContactoNegocio } from "./CamposContactoNegocio";
import { ErroDoCampo, ITEM, N, Rotulo } from "./PecasNovoNegocio";
import { FOCO } from "./estilos";
import { OUTRO, SERVICOS } from "./levantamentoExemplo";
import type { DadosContactoNegocio } from "./negocioMetas";
import { COMERCIAIS_EXEMPLO, MAX_SERVICO, type ChaveContacto, type ErrosNovoNegocio, type PessoaOpcao } from "./novoNegocio";

export interface ValoresGeral {
  pessoaId: string;
  servico: string;
  servicoOutro: string;
  comercial: string;
  contacto: DadosContactoNegocio;
}

export interface AcoesGeral {
  pessoa: (id: string) => void;
  servico: (chave: string) => void;
  servicoOutro: (texto: string) => void;
  comercial: (nome: string) => void;
  contacto: (chave: ChaveContacto, valor: string) => void;
}

interface Props {
  /** A base dos ids dos campos (`<id>-pessoa`, `<id>-servico`...). */
  id: string;
  pessoas: readonly PessoaOpcao[];
  valores: ValoresGeral;
  erros: ErrosNovoNegocio;
  acoes: AcoesGeral;
  /** Recebe o foco quando o painel abre: o primeiro campo. */
  primeiroCampo: RefObject<HTMLButtonElement>;
}

type PropsServico = Pick<Props, "id" | "valores" | "erros" | "acoes">;

const trigger = (invalido: boolean) => cn("min-h-11", FOCO, invalido && "border-destructive");

function CampoPessoa({ id, pessoas, valores, erros, acoes, primeiroCampo }: Props) {
  const { t } = useTranslation();
  const erro = erros.pessoaId;
  return (
    <div className="space-y-1.5">
      <Rotulo para={`${id}-pessoa`} texto={t(`${N}person`)} obrigatorio />
      <Select value={valores.pessoaId} onValueChange={acoes.pessoa}>
        <SelectTrigger
          id={`${id}-pessoa`} ref={primeiroCampo} aria-required="true" aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? `${id}-pessoa-erro` : undefined} className={trigger(!!erro)}
        >
          <SelectValue placeholder={t(`${N}person.placeholder`)} />
        </SelectTrigger>
        <SelectContent>
          {pessoas.map((p) => <SelectItem key={p.id} value={p.id} className={ITEM}>{p.nome}</SelectItem>)}
        </SelectContent>
      </Select>
      <ErroDoCampo id={`${id}-pessoa-erro`} chave={erro && `error.person.${erro}`} />
    </div>
  );
}

function CampoServicoOutro({ id, valores, erros, acoes }: PropsServico) {
  const { t } = useTranslation();
  const erro = erros.servicoOutro;
  return (
    <div className="space-y-1.5">
      <Rotulo para={`${id}-servicoOutro`} texto={t(`${N}serviceOther`)} obrigatorio />
      <Input
        id={`${id}-servicoOutro`} value={valores.servicoOutro} autoComplete="off" aria-required="true"
        onChange={(e) => acoes.servicoOutro(e.target.value)} aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? `${id}-servicoOutro-erro` : undefined} className={cn("min-h-11", FOCO)}
      />
      <ErroDoCampo id={`${id}-servicoOutro-erro`} chave={erro && `error.serviceOther.${erro}`} />
    </div>
  );
}

/** O serviço escolhe-se de uma lista fechada; em "Outro" aparece o campo "Qual?" (obrigatório, curto). */
function CampoServico(props: PropsServico) {
  const { t } = useTranslation();
  const { id, valores, erros, acoes } = props;
  const erro = erros.servico;
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Rotulo para={`${id}-servico`} texto={t(`${N}service`)} obrigatorio />
        <Select value={valores.servico} onValueChange={acoes.servico}>
          <SelectTrigger
            id={`${id}-servico`} aria-required="true" aria-invalid={erro ? true : undefined}
            aria-describedby={erro ? `${id}-servico-dica ${id}-servico-erro` : `${id}-servico-dica`} className={trigger(!!erro)}
          >
            <SelectValue placeholder={t(`${N}service.placeholder`)} />
          </SelectTrigger>
          <SelectContent>
            {SERVICOS.map((s) => <SelectItem key={s} value={s} className={ITEM}>{t(`${N}service.opt.${s}`)}</SelectItem>)}
          </SelectContent>
        </Select>
        <p id={`${id}-servico-dica`} className="text-sm text-muted-foreground">{t(`${N}service.hint`)}</p>
        <ErroDoCampo id={`${id}-servico-erro`} chave={erro && `error.service.${erro}`} />
      </div>
      {valores.servico === OUTRO && <CampoServicoOutro {...props} />}
    </div>
  );
}

function CampoComercial({ id, valor, aoMudar }: { id: string; valor: string; aoMudar: (c: string) => void }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5">
      <Rotulo para={id} texto={t(`${N}salesperson`)} />
      <Select value={valor} onValueChange={aoMudar}>
        <SelectTrigger id={id} className={cn("min-h-11", FOCO)}><SelectValue /></SelectTrigger>
        <SelectContent>
          {COMERCIAIS_EXEMPLO.map((c) => <SelectItem key={c} value={c} className={ITEM}>{c}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

/** O primeiro passo, só para ler: o negócio começa sempre em Orçamento. */
function PrimeiroPasso() {
  const { t } = useTranslation();
  return (
    <div className="rounded-md border border-border bg-muted/40 p-3">
      <p className="text-sm font-medium text-foreground">{t(`${N}first`)}</p>
      <p className="text-sm text-muted-foreground">{t(`${N}first.text`)}</p>
    </div>
  );
}

/** A aba Geral: pessoa, serviço, comercial, contacto e o primeiro passo. */
export function AbaGeralNovoNegocio(props: Props) {
  const { id, valores, erros, acoes } = props;
  return (
    <div className="space-y-4">
      <CampoPessoa {...props} />
      <CampoServico id={id} valores={valores} erros={erros} acoes={acoes} />
      <CampoComercial id={`${id}-comercial`} valor={valores.comercial} aoMudar={acoes.comercial} />
      <CamposContactoNegocio idBase={id} valores={valores.contacto} erros={erros} aoMudar={acoes.contacto} />
      <PrimeiroPasso />
    </div>
  );
}
