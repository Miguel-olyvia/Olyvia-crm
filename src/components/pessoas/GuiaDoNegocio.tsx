// O guia do passo seguinte de um NEGÓCIO aberto: liga o ecrã de apresentação (`GuiaDoPasso`) ao que o negócio já tem. O botão primário faz o passo
// no próprio ecrã: criar o orçamento abre o editor real (o mesmo executor do Quadro e da Lista), «Fazer o levantamento» abre o painel «Visita e
// levantamento» ligado ao negócio e à pessoa; no Pipeline não há «Ganhar o negócio» nem «Fechar agora». Enviar a proposta, a resposta do cliente,
// criar o contrato e a assinatura abrem o seu diálogo por cima do guia (`DocumentosDoNegocioReal`), sem navegar. Nada se grava aqui: o guia só
// escolhe qual painel abrir. Com `cabecalhoFicha` é o ÚNICO cabeçalho da ficha com o negócio aberto: o nome da pessoa e o serviço (a linha), o valor e o
// comercial no passo, e o paginador e as ações da pessoa (Email, Mais) no cabeçalho.
import { useMemo, type MouseEvent, type ReactNode, type Ref } from "react";
import { useRegistosPessoa } from "@/components/negocio-metas/registosPessoa";
import { registosDoNegocio } from "@/components/negocio-metas/acoesRegistos";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { saudeDoNegocio } from "@/components/negocio-metas/saudeNegocio";
import { SaudeTag } from "@/components/negocio-metas/SaudeTag";
import { useFontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { useTranslation } from "@/hooks/useTranslation";
import { useDocumentosDoNegocio } from "@/components/pessoas-processo/DocumentosDoNegocioReal";
import { ehPassoDeDocumento } from "@/components/pessoas-processo/documentosGuia";
import { useLevantamentoDoNegocio } from "@/components/pessoas-processo/LevantamentoDoNegocioReal";
import { ContactoDoGuia } from "./assistente/ContactoDoGuia";
import { VisitaDoGuia } from "./assistente/VisitaDoGuia";
import type { PecasCabecalhoFicha } from "./CabecalhoGuiaFicha";
import type { FaseDoNegocio } from "./fasesDoNegocio";
import { GuiaDoPasso } from "./GuiaDoPasso";
import { acontecimentosDoGuia, clienteDoGuia, dadosDoGuia } from "./guiaDados";
import { useMarcarVisita, type AberturaVisita } from "./marcarVisitaContexto";
import { moradaDaLead } from "./moradaVisita";
import type { ItemAtividade, Pessoa } from "./pessoasTipos";
import { itemComFaseDaAbordagem, ehFaseDeAbordagem, type LigadosDoNegocio } from "./processo/abordagemDoNegocio";
import { calcularPassoGuiado, fasesDaPessoa, fasesDoNegocioParaGuia } from "./processo/passoGuiado";
import { passoDoItem } from "./processo/passosProcesso";
import { useAcaoDoPasso } from "./processo/processoContexto";
import type { ItemProcesso, PassoProcesso } from "./processo/tiposProcesso";
import { Prazo } from "./SeccoesResumo";

interface GuiaDoNegocioProps {
  negocio: NegocioMes;
  hoje: string;
  /** O item do processo do negócio; sem ele (um negócio ganho ou perdido) o guia fica sem passo: o cabeçalho, a barra de fases e o cartão do cliente. */
  item?: ItemProcesso;
  /** As fases do negócio (as reais: sem Financeiro nem Obra), com a atual marcada. */
  fases: readonly FaseDoNegocio[];
  /** Pode agir neste negócio (aberto e com permissão de editar): sem isto os passos de escrita ficam desativados com a razão. */
  podeEditar: boolean;
  /** A pessoa e a atividade da ficha: o cartão do cliente e os últimos acontecimentos. Sem elas (o exemplo) vale o que o negócio traz. */
  pessoa?: Pessoa;
  atividade?: readonly ItemAtividade[];
  /** «Perder negócio», quando se pode. */
  acaoPerder?: ReactNode;
  /** O cabeçalho único da ficha (título, selos, paginador, Email e Mais): sem isto o guia desenha o nome da pessoa. */
  cabecalhoFicha?: PecasCabecalhoFicha;
  /** O h3 que recebe o foco (a linha do serviço, ou o nome sem cabeçalho da ficha). */
  tituloRef?: Ref<HTMLHeadingElement>;
  /** Sem passo a fazer (negócio fechado, ou terminado) mesmo que haja item. */
  semPasso?: boolean;
  /** A faixa fina por baixo do cabeçalho (a perda, os avisos do negócio e os alertas da pessoa); sem isto vale a do cabeçalho da ficha. */
  faixa?: ReactNode;
  /** Abre o registo da chamada da ficha (o passo «Registar a chamada» de um negócio por contactar e o botão do assistente); `origem` é o botão a que o foco volta. */
  aoRegistarChamada?: (origem: HTMLElement | null) => void;
}

export function GuiaDoNegocio({ negocio, hoje, item, fases, podeEditar, pessoa, atividade, acaoPerder, cabecalhoFicha, tituloRef, semPasso = false, faixa, aoRegistarChamada }: GuiaDoNegocioProps) {
  const { t } = useTranslation();
  const fonte = useFontePessoas();
  const registos = useRegistosPessoa();
  const levantamento = useLevantamentoDoNegocio();
  const documentos = useDocumentosDoNegocio();
  // A fase da abordagem DO NEGÓCIO (Por contactar, Contactado, Visita): o Pipeline só tem negócios, e um negócio sem orçamento está onde o que tem ligado o põe.
  const doNegocio = registosDoNegocio(registos, negocio.id);
  const ligados: LigadosDoNegocio = {
    contactos: doNegocio.contactos.length, visitasMarcadas: doNegocio.visitas.filter((v) => v.estado !== "cancelada").length,
    levantamentos: doNegocio.levantamentos.length, comLevantamentoEscrito: Boolean(negocio.levantamento),
  };
  const itemGuia = item ? itemComFaseDaAbordagem(item, ligados) : item;
  const acao = useAcaoDoPasso(itemGuia, () => undefined);
  const permissoesFecho = fonte.modo === "real" ? fonte.permissoesFecho : undefined;
  const passoAtual = itemGuia ? passoDoItem(itemGuia).id : null;
  const comDocumento = passoAtual !== null && ehPassoDeDocumento(passoAtual) && documentos?.pode(passoAtual, negocio.id) === true;
  // Na abordagem a barra é a da pessoa (Por contactar, Contactado, Visita, Negócio); em Levantamento (a decisão escrita no negócio) e depois, a do negócio.
  const naAbordagem = itemGuia !== undefined && ehFaseDeAbordagem(itemGuia.fase) && itemGuia.fase !== "levantamento";
  const fasesDoGuia = naAbordagem && itemGuia ? fasesDaPessoa(itemGuia.fase) : fasesDoNegocioParaGuia(fases);
  const doPasso = itemGuia && !semPasso ? calcularPassoGuiado(itemGuia, {
    dados: dadosDoGuia(pessoa ?? { nome: negocio.pessoa, contacto: negocio.contacto }, doNegocio, t),
    fases: fasesDoGuia,
    podeEditar, podeCriar: false, permissoesFecho, pessoaFechada: false,
    ligados: ligadosDoNegocio(itemGuia, acao.executa, levantamento?.pode === true && pessoa !== undefined, comDocumento, aoRegistarChamada !== undefined),
  }) : null;
  const aoAcao = (e: MouseEvent<HTMLElement>): void => {
    if (!doPasso) return;
    // O levantamento faz-se no assistente de passos (sem botão do passo): sem o assistente não há nada a abrir.
    if (doPasso.passo === "fazerLevantamento") return;
    if (doPasso.passo === "registarChamada") { aoRegistarChamada?.(e.currentTarget); return; }
    if (ehPassoDeDocumento(doPasso.passo)) documentos?.abrir(doPasso.passo, negocio.id);
    else acao.aoClicar(e);
  };
  const { cliente, local } = clienteDoGuia(pessoa ?? { contacto: negocio.contacto }, negocio.servico);
  const acontecimentos = useMemo(() => acontecimentosDoGuia(t, atividade ?? []), [t, atividade]);
  // O assistente de passos da fase Visita: no negócio em Levantamento, no lugar do «Fazer o levantamento» único. Os passos da secção e o último gravam
  // o levantamento do negócio (um por negócio) sem abrir o painel «Visita e levantamento».
  const marcar = useMarcarVisita();
  const nivel = cabecalhoFicha?.nomeEl !== undefined ? "h3" : "h2";
  const abrirAgenda = marcar && podeEditar && pessoa
    ? (preparar?: AberturaVisita["preparar"]) => marcar.pedir({
      pessoaId: pessoa.id, nome: pessoa.nome, moradaLead: moradaDaLead(pessoa), negocioId: negocio.id, ...(preparar ? { preparar } : {}),
    })
    : undefined;
  const assistente = doPasso && pessoa && itemGuia?.fase === "contactado"
    ? ({ aoVerFase, extra: extraDoGuia }: { aoVerFase: (id: string) => void; extra?: ReactNode }) => (
      <ContactoDoGuia
        pessoa={pessoa} negocio={{ id: negocio.id, pedidoCliente: negocio.pedidoCliente, qualificacaoGravada: negocio.qualificacaoGravada }}
        chamadas={ligados.contactos} visitaMarcada={ligados.visitasMarcadas > 0} ultimoResultado={dadosDoGuia(pessoa, doNegocio).ultimoResultado}
        podeEditar={podeEditar} podeRegistarChamada={aoRegistarChamada !== undefined} aoRegistarChamada={(origem) => aoRegistarChamada?.(origem)}
        aoMarcarVisita={abrirAgenda ? (preparar) => abrirAgenda(preparar) : undefined}
        faseRotuloChave={doPasso.faseRotuloChave} feitas={doPasso.feitas} aoVerFase={aoVerFase} nivel={nivel} extra={extraDoGuia}
      />
    )
    : doPasso && pessoa && doPasso.passo === "fazerLevantamento"
    ? ({ aoVerFase, extra: extraDoGuia }: { aoVerFase: (id: string) => void; extra?: ReactNode }) => (
      <VisitaDoGuia
        pessoa={pessoa} negocio={{ id: negocio.id }} visitas={doNegocio.visitas} levantamentoGuardado={doNegocio.levantamentos.length > 0 || Boolean(negocio.levantamento)}
        ficha={levantamento?.ficha ?? null} podeEditar={podeEditar}
        aoMarcarOutra={abrirAgenda ? () => abrirAgenda() : undefined}
        faseRotuloChave={doPasso.faseRotuloChave} feitas={doPasso.feitas} aoVerFase={aoVerFase} nivel={nivel} extra={extraDoGuia}
      />
    )
    : undefined;
  return (
    <GuiaDoPasso
      passo={doPasso} fases={fasesDoGuia} aoAcao={aoAcao} atributosAcao={acao.atributos} acaoPerder={acaoPerder} assistente={assistente}
      explicacao={acao.bloqueio && acao.idBloqueio ? { id: acao.idBloqueio, texto: acao.bloqueio } : null}
      cabecalho={{ nome: pessoa?.nome ?? negocio.pessoa, linha: negocio.servico, telefone: cliente.telefone, local }} cliente={cliente} acontecimentos={acontecimentos}
      tituloSecao={t("pessoasPagina.deal.next")} tituloRef={tituloRef} {...cabecalhoFicha} faixa={faixa ?? cabecalhoFicha?.faixa}
      extra={(
        <div className="space-y-2">
          <Prazo prazo={negocio.proximoPrazo} hoje={hoje} />
          {/* «Sem orçamento escolhido» é o normal de um negócio ainda na abordagem: não é um alerta a mostrar no guia. */}
          {saudeDoNegocio(negocio, hoje) !== "semOrcamento" && <SaudeTag negocio={negocio} hoje={hoje} />}
        </div>
      )}
    />
  );
}

/**
 * Os passos que este ecrã sabe fazer: os que o processo executa, o levantamento (com o painel ligado ao negócio) e os
 * de documento (diálogo por cima do guia, quando o negócio tem o documento). O levantamento, o ganho e os documentos têm o seu caminho: o executor do
 * processo não conta para eles (e, para os documentos, é ele que levava a /proposals e /client-contracts).
 */
function ligadosDoNegocio(item: ItemProcesso, executa: boolean, levantamento: boolean, documento: boolean, chamada: boolean): ReadonlySet<PassoProcesso> {
  const ligados = new Set<PassoProcesso>();
  const passo = passoDoItem(item).id;
  if (executa && passo !== "fazerLevantamento" && passo !== "ganharNegocio" && !ehPassoDeDocumento(passo)) ligados.add(passo);
  if (levantamento) ligados.add("fazerLevantamento");
  if (documento) ligados.add(passo);
  // «Registar a chamada» de um negócio por contactar abre o registo da ficha (o executor do processo não o conhece no Pipeline).
  if (chamada && passo === "registarChamada") ligados.add(passo);
  return ligados;
}
