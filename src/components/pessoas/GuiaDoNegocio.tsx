// O guia do passo seguinte de um NEGÓCIO aberto: liga o ecrã de apresentação (`GuiaDoPasso`) ao que o negócio já tem. O botão primário faz o passo
// no próprio ecrã: criar o orçamento abre o editor real (o mesmo executor do Quadro e da Lista), «Fazer o levantamento» abre o painel «Visita e
// levantamento» ligado ao negócio e à pessoa, e «Ganhar o negócio» leva ao bloco de fecho que já existe. Enviar a proposta, a resposta do cliente,
// criar o contrato e a assinatura abrem o seu diálogo por cima do guia (`DocumentosDoNegocioReal`), sem navegar. Nada se grava aqui: o guia só
// escolhe qual painel abrir.
import { useMemo, type MouseEvent, type ReactNode } from "react";
import { useFechoV4 } from "@/components/negocio-metas/bandeiraFecho";
import { useRegistosPessoa } from "@/components/negocio-metas/registosPessoa";
import { registosDoNegocio } from "@/components/negocio-metas/acoesRegistos";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { SaudeTag } from "@/components/negocio-metas/SaudeTag";
import { useFontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { useTranslation } from "@/hooks/useTranslation";
import { useDocumentosDoNegocio } from "@/components/pessoas-processo/DocumentosDoNegocioReal";
import { ehPassoDeDocumento } from "@/components/pessoas-processo/documentosGuia";
import { useLevantamentoDoNegocio } from "@/components/pessoas-processo/LevantamentoDoNegocioReal";
import type { FaseDoNegocio } from "./fasesDoNegocio";
import { GuiaDoPasso } from "./GuiaDoPasso";
import { acontecimentosDoGuia, clienteDoGuia, dadosDoGuia } from "./guiaDados";
import type { ItemAtividade, Pessoa } from "./pessoasTipos";
import { calcularPassoGuiado, fasesDoNegocioParaGuia } from "./processo/passoGuiado";
import { passoDoItem } from "./processo/passosProcesso";
import { useAcaoDoPasso } from "./processo/processoContexto";
import type { ItemProcesso, PassoProcesso } from "./processo/tiposProcesso";
import { Prazo } from "./SeccoesResumo";

export const ATRIBUTO_BLOCO_FECHO = "data-bloco-fecho";

interface GuiaDoNegocioProps {
  negocio: NegocioMes;
  hoje: string;
  item: ItemProcesso;
  /** As fases do negócio (as reais: sem Financeiro nem Obra), com a atual marcada. */
  fases: readonly FaseDoNegocio[];
  /** Pode agir neste negócio (aberto e com permissão de editar): sem isto os passos de escrita ficam desativados com a razão. */
  podeEditar: boolean;
  /** A pessoa e a atividade da ficha: o cartão do cliente e os últimos acontecimentos. Sem elas (o exemplo) vale o que o negócio traz. */
  pessoa?: Pessoa;
  atividade?: readonly ItemAtividade[];
  /** «Perder negócio», quando se pode. */
  acaoPerder?: ReactNode;
}

/** Leva o foco ao bloco de fecho do negócio (onde se dá como ganho), no mesmo ecrã. */
function irParaFecho(): void {
  const bloco = document.querySelector<HTMLElement>(`[${ATRIBUTO_BLOCO_FECHO}]`);
  bloco?.scrollIntoView?.({ block: "center" });
  bloco?.focus();
}

export function GuiaDoNegocio({ negocio, hoje, item, fases, podeEditar, pessoa, atividade, acaoPerder }: GuiaDoNegocioProps) {
  const { t } = useTranslation();
  const fonte = useFontePessoas();
  const fechoV4 = useFechoV4();
  const registos = useRegistosPessoa();
  const levantamento = useLevantamentoDoNegocio();
  const documentos = useDocumentosDoNegocio();
  const acao = useAcaoDoPasso(item, () => undefined);
  const permissoesFecho = fonte.modo === "real" ? fonte.permissoesFecho : undefined;
  const passoAtual = passoDoItem(item).id;
  const comDocumento = ehPassoDeDocumento(passoAtual) && documentos?.pode(passoAtual, negocio.id) === true;
  const doPasso = calcularPassoGuiado(item, {
    dados: dadosDoGuia(pessoa ?? { nome: negocio.pessoa, contacto: negocio.contacto }, registosDoNegocio(registos, negocio.id)),
    fases: fasesDoNegocioParaGuia(fases),
    podeEditar, podeCriar: false, permissoesFecho, pessoaFechada: false,
    ligados: ligadosDoNegocio(item, acao.executa, levantamento?.pode === true, fechoV4 && negocio.prontoAGanhar === true, comDocumento),
  });
  const aoAcao = (e: MouseEvent<HTMLElement>): void => {
    if (doPasso.passo === "fazerLevantamento") levantamento?.abrir(negocio.id, e.currentTarget);
    else if (doPasso.passo === "ganharNegocio") irParaFecho();
    else if (ehPassoDeDocumento(doPasso.passo)) documentos?.abrir(doPasso.passo, negocio.id);
    else acao.aoClicar(e);
  };
  const { cliente, local } = clienteDoGuia(pessoa ?? { contacto: negocio.contacto }, negocio.servico);
  const acontecimentos = useMemo(() => acontecimentosDoGuia(t, atividade ?? []), [t, atividade]);
  return (
    <GuiaDoPasso
      passo={doPasso} fases={fasesDoNegocioParaGuia(fases)} aoAcao={aoAcao} atributosAcao={acao.atributos} acaoPerder={acaoPerder}
      explicacao={acao.bloqueio && acao.idBloqueio ? { id: acao.idBloqueio, texto: acao.bloqueio } : null}
      cabecalho={{ nome: pessoa?.nome ?? negocio.pessoa, telefone: cliente.telefone, local }} cliente={cliente} acontecimentos={acontecimentos}
      tituloSecao={t("pessoasPagina.deal.next")}
      extra={<div className="space-y-2"><Prazo prazo={negocio.proximoPrazo} hoje={hoje} /><SaudeTag negocio={negocio} hoje={hoje} /></div>}
    />
  );
}

/**
 * Os passos que este ecrã sabe fazer: os que o processo executa, o levantamento (com o painel ligado ao negócio), ganhar (leva ao bloco de fecho) e os
 * de documento (diálogo por cima do guia, quando o negócio tem o documento). O levantamento, o ganho e os documentos têm o seu caminho: o executor do
 * processo não conta para eles (e, para os documentos, é ele que levava a /proposals e /client-contracts).
 */
function ligadosDoNegocio(item: ItemProcesso, executa: boolean, levantamento: boolean, ganhar: boolean, documento: boolean): ReadonlySet<PassoProcesso> {
  const ligados = new Set<PassoProcesso>();
  const passo = passoDoItem(item).id;
  if (executa && passo !== "fazerLevantamento" && passo !== "ganharNegocio" && !ehPassoDeDocumento(passo)) ligados.add(passo);
  if (levantamento) ligados.add("fazerLevantamento");
  if (ganhar) ligados.add("ganharNegocio");
  if (documento) ligados.add(passo);
  return ligados;
}
