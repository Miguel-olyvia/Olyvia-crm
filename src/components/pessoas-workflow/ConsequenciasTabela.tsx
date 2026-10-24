import { useId, useRef, useState, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FOCO, PISTA_DESATIVADO } from "@/components/negocio-metas/estilos";
import { GrupoRadios } from "@/components/negocio-metas/GrupoRadios";
import { CANCELAMENTOS, RECUSAS, type Cancelamento, type Recusa } from "@/hooks/pessoas/workflow/configNegocios";
import { RECUSAS_ORCAMENTO, type RecusaOrcamento } from "@/hooks/pessoas/workflow/consequencias";
import { chaveErroConsequencias } from "@/hooks/pessoas/workflow/errosConsequencias";
import type { ConsequenciasHook } from "@/hooks/pessoas/workflow/useConsequencias";
import type { EdicaoNegocios } from "./edicaoNegocios";

const N = "pessoasPagina.real.workflow.neg.";
const C = `${N}cons.`;

type Aviso = "guardado" | "semAlteracoes";
type Escolhas = Pick<EdicaoNegocios, "recusaProposta" | "recusaContrato" | "cancelamentoNoPrazo">;

const semMotivo = <T extends string>(opcoes: readonly T[]): Record<T, null> => Object.fromEntries(opcoes.map((o) => [o, null])) as Record<T, null>;

/**
 * A tabela das consequências do separador «Negócios»: seis acontecimentos (orçamento, proposta e contrato aceites ou recusados) com as colunas «Ao negócio»
 * e «A seguir». Os dois interruptores (cria a proposta, cria o contrato) e a recusa do orçamento gravam logo pelo hook (`neg_guardar_cadeia` e
 * `neg_guardar_recusa_orcamento`); as escolhas que o separador já tinha (recusa da proposta, do contrato, cancelamento e prazo) seguem a edição dele e
 * gravam com o «Guardar configuração». O resto é só leitura. Quem não tem `pessoas.config` vê os valores como texto (a base decide sempre). Enquanto
 * grava, os controlos ficam `aria-disabled` (continuam focáveis) e um duplo clique dá um só pedido; o resultado e o erro vão para regiões anunciadas.
 */
export interface ConsequenciasTabelaProps {
  consequencias: ConsequenciasHook;
  /** Pode mudar a configuração (pessoas.config). */
  pode: boolean;
  edicao: Escolhas;
  aoMudar: (parcial: Partial<Escolhas>) => void;
  /** A gravação principal do separador está em curso. */
  bloqueado: boolean;
  /** O campo do prazo de reflexão, que vive na linha do contrato recusado. */
  prazo: ReactNode;
  /** Avisa o separador de que esta tabela começou (true) ou acabou (false) de gravar, para ele não gravar ao mesmo tempo. */
  aoOcupar?: (ocupado: boolean) => void;
}

/** Um valor só para ler: o rótulo e o que está escolhido. */
function Leitura({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <p className="text-sm">
      <span className="text-muted-foreground">{rotulo}</span> <span className="font-medium">{valor}</span>
    </p>
  );
}

interface InterruptorProps {
  rotulo: string;
  ajuda: string;
  valor: boolean | null;
  semEscolha: boolean;
  /** Frase que explica porque os controlos estão desativados (a ler, sem configuração, erro de leitura), se houver. */
  idNota?: string;
  aoMudar: (valor: boolean) => void;
}

function Interruptor({ rotulo, ajuda, valor, semEscolha, idNota, aoMudar }: InterruptorProps) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <div className="flex min-h-11 items-center gap-3">
        <Switch
          id={`${id}-sw`} checked={valor === true} aria-disabled={semEscolha || undefined} aria-describedby={idNota && valor === null ? `${id}-ajuda ${idNota}` : `${id}-ajuda`}
          className={cn(FOCO, PISTA_DESATIVADO)} onCheckedChange={(v) => { if (!semEscolha) aoMudar(v); }}
        />
        <Label htmlFor={`${id}-sw`} className="text-sm font-medium">{rotulo}</Label>
      </div>
      <p id={`${id}-ajuda`} className="text-sm text-muted-foreground">{ajuda}</p>
    </div>
  );
}

export function ConsequenciasTabela({ consequencias, pode, edicao, aoMudar, bloqueado, prazo, aoOcupar }: ConsequenciasTabelaProps) {
  const { t } = useTranslation();
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  // O estado só muda no render seguinte: a referência é o que trava o segundo clique.
  const emCurso = useRef(false);
  const { dados } = consequencias;
  const aGuardar = ocupado || consequencias.aGuardar;
  // Uma gravação de cada vez: com a principal do separador ou uma desta tabela em curso, nenhuma escolha se aceita.
  const emGravacao = aGuardar || bloqueado;
  const idNota = useId();

  const gravar = async (corpo: () => Promise<{ mudou: boolean }>) => {
    if (emCurso.current) return;
    emCurso.current = true;
    setOcupado(true);
    aoOcupar?.(true);
    setAviso(null);
    setErro(null);
    try {
      const resultado = await corpo();
      setAviso(resultado.mudou ? "guardado" : "semAlteracoes");
    } catch (falha) {
      setErro(chaveErroConsequencias(falha));
    } finally {
      emCurso.current = false;
      setOcupado(false);
      aoOcupar?.(false);
    }
  };
  const mudarCadeia = (parcial: Partial<{ orcamentoCriaProposta: boolean; propostaCriaContrato: boolean }>) => {
    if (dados.orcamentoCriaProposta === null || dados.propostaCriaContrato === null) return;
    void gravar(() => consequencias.guardarCadeia({ orcamentoCriaProposta: dados.orcamentoCriaProposta as boolean, propostaCriaContrato: dados.propostaCriaContrato as boolean, ...parcial }));
  };
  const mudarRecusaOrcamento = (valor: RecusaOrcamento) => {
    if (dados.recusaOrcamento === null || valor === dados.recusaOrcamento) return;
    void gravar(() => consequencias.guardarRecusaOrcamento(valor));
  };

  const estadoDoInterruptor = (valor: boolean | null) => (valor === null ? t(`${C}state.unknown`) : valor ? t(`${C}state.on`) : t(`${C}state.off`));
  const mensagem = aGuardar ? t(`${C}saving`) : aviso === "guardado" ? t(`${C}saved`) : aviso === "semAlteracoes" ? t(`${C}unchanged`) : "";
  // A frase que explica porque há controlos desativados por falta de leitura: a ler, ou lido sem erro mas sem configuração (o erro tem a sua).
  const semConfig = consequencias.estado === "pronto" && dados.recusaOrcamento === null;
  const notaDesativado = pode && (consequencias.estado === "a-carregar" || consequencias.estado === "erro" || semConfig);
  const fixa = (chave: string) => <p className="text-sm text-muted-foreground">{t(chave)}</p>;

  // Sem o valor lido não se marca nenhuma opção (nem a primeira): diz-se que não se leu, tal como a quem só pode ler.
  const recusaOrcamento = pode && dados.recusaOrcamento !== null ? (
    <GrupoRadios<RecusaOrcamento>
      legenda={t(`${C}quoteRefused.title`)} ajuda={t(`${C}quoteRefused.hint`)} bloqueado={emGravacao}
      valor={dados.recusaOrcamento} opcoes={RECUSAS_ORCAMENTO} indisponiveis={semMotivo(RECUSAS_ORCAMENTO)}
      rotulo={(r) => t(`${C}quoteRefused.${r}`)} aoMudar={mudarRecusaOrcamento}
    />
  ) : (
    <Leitura rotulo={t(`${C}quoteRefused.title`)} valor={dados.recusaOrcamento === null ? t(`${C}state.unknown`) : t(`${C}quoteRefused.${dados.recusaOrcamento}`)} />
  );
  const grupoRecusa = (texto: string, campo: "recusaProposta" | "recusaContrato") => (pode ? (
    <GrupoRadios<Recusa>
      legenda={t(`${N}${texto}.title`)} ajuda={t(`${N}${texto}.hint`)} bloqueado={emGravacao} valor={edicao[campo]} opcoes={RECUSAS}
      indisponiveis={semMotivo(RECUSAS)} rotulo={(r) => t(`${N}refusal.${r}`)} aoMudar={(valor) => aoMudar({ [campo]: valor })}
    />
  ) : (
    <Leitura rotulo={t(`${N}${texto}.title`)} valor={t(`${N}refusal.${edicao[campo]}`)} />
  ));
  const cancelamento = pode ? (
    <GrupoRadios<Cancelamento>
      legenda={t(`${N}cancel.title`)} ajuda={t(`${N}cancel.hint`)} bloqueado={emGravacao} valor={edicao.cancelamentoNoPrazo} opcoes={CANCELAMENTOS}
      indisponiveis={semMotivo(CANCELAMENTOS)} rotulo={(c) => t(`${N}cancel.${c}`)} aoMudar={(cancelamentoNoPrazo) => aoMudar({ cancelamentoNoPrazo })}
    />
  ) : (
    <Leitura rotulo={t(`${N}cancel.title`)} valor={t(`${N}cancel.${edicao.cancelamentoNoPrazo}`)} />
  );
  const interruptor = (rotulo: string, ajuda: string, valor: boolean | null, aoAlterar: (v: boolean) => void) => (pode ? (
    <Interruptor rotulo={t(rotulo)} ajuda={t(ajuda)} valor={valor} semEscolha={emGravacao || valor === null} idNota={notaDesativado ? idNota : undefined} aoMudar={aoAlterar} />
  ) : (
    <div className="space-y-1">
      <Leitura rotulo={t(rotulo)} valor={estadoDoInterruptor(valor)} />
      <p className="text-sm text-muted-foreground">{t(ajuda)}</p>
    </div>
  ));

  const linhas: Array<{ chave: string; evento: string; negocio: ReactNode; seguinte: ReactNode }> = [
    {
      chave: "orcamentoAceite", evento: "quoteAccepted", negocio: fixa(`${C}noChange`),
      seguinte: interruptor(`${C}quoteAccepted.switch`, `${C}quoteAccepted.hint`, dados.orcamentoCriaProposta, (v) => mudarCadeia({ orcamentoCriaProposta: v })),
    },
    { chave: "orcamentoRecusado", evento: "quoteRefused", negocio: recusaOrcamento, seguinte: fixa(`${C}quoteRefused.after`) },
    {
      chave: "propostaAceite", evento: "proposalAccepted", negocio: fixa(`${C}proposalAccepted.deal`),
      seguinte: interruptor(`${C}proposalAccepted.switch`, `${C}proposalAccepted.hint`, dados.propostaCriaContrato, (v) => mudarCadeia({ propostaCriaContrato: v })),
    },
    { chave: "propostaRecusada", evento: "proposalRefused", negocio: grupoRecusa("propRefused", "recusaProposta"), seguinte: fixa(`${C}proposalRefused.after`) },
    { chave: "contratoAssinado", evento: "contractSigned", negocio: fixa(`${C}contractSigned.deal`), seguinte: fixa(`${C}contractSigned.after`) },
    {
      chave: "contratoRecusado", evento: "contractRefused",
      negocio: (
        <div className="space-y-3">
          {grupoRecusa("contRefused", "recusaContrato")}
          {cancelamento}
          {prazo}
        </div>
      ),
      seguinte: fixa(`${C}contractRefused.after`),
    },
  ];

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">{t(`${C}title`)}</h3>
      <p className="text-sm text-muted-foreground">{t(`${C}intro`)}</p>
      {consequencias.estado === "erro" && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm">
          <p id={idNota}>{t(`${C}readError`)}</p>
          <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={consequencias.recarregar}>{t(`${N}retry`)}</Button>
        </div>
      )}
      {pode && consequencias.estado === "a-carregar" && <p id={idNota} className="text-sm text-muted-foreground">{t(`${C}loading`)}</p>}
      {pode && semConfig && <p id={idNota} className="text-sm text-muted-foreground">{t(`${C}noConfig`)}</p>}
      {!pode && <p className="text-sm text-muted-foreground">{t(`${C}readOnlyNote`)}</p>}
      <Table>
        <TableCaption className="sr-only">{t(`${C}caption`)}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{t(`${C}col.event`)}</TableHead>
            <TableHead scope="col">{t(`${C}col.deal`)}</TableHead>
            <TableHead scope="col">{t(`${C}col.next`)}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.map((l) => (
            <TableRow key={l.chave}>
              <TableHead scope="row" className="h-auto align-top font-medium text-foreground">{t(`${C}ev.${l.evento}`)}</TableHead>
              <TableCell className="align-top">{l.negocio}</TableCell>
              <TableCell className="align-top">{l.seguinte}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {erro && (
        <div role="alert" className="space-y-1 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm">
          <p className="flex items-center gap-1.5 font-medium">
            <AlertCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
            {t(`${N}error.title`)}
          </p>
          <p>{t(erro)}</p>
        </div>
      )}
      <div role="status" aria-live="polite" className="min-h-5 text-sm text-muted-foreground">{mensagem}</div>
    </section>
  );
}
