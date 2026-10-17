// Executa os passos da lead até ao negócio (Fase 3), a partir dos botões do "A fazer" do Quadro e da Lista e dos da ficha. Monta UMA vez,
// ao nível da página, o que cada passo precisa: o diálogo da chamada, o de marcar a visita (o `MarcarVisitaProvider` que já existe) e o
// painel "Novo negócio" nos dois sítios onde o passo o pede: o painel de visita e levantamento (marcar a visita como feita e tirar as
// medidas são um só passo e uma só gravação) e o de criar o negócio. A visita e o levantamento são de cada pedido; o negócio criado
// substitui o pedido e herda o serviço dele. Tudo em memória, pelo estado da página.
// Os passos do orçamento e da proposta (Fase 4: criar, verificar, a Direção simulada e enviar) têm os seus diálogos em
// `useOrcamentoProcesso`; os da Fase 5 (escolher o orçamento, criar a proposta, contrato...) ainda não executam: os botões abrem a ficha.
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { NovoNegocioDialogo } from "@/components/negocio-metas/NovoNegocioDialogo";
import type { VisitaNegocio } from "@/components/negocio-metas/negocioMetas";
import type { DadosCriarNegocio, PessoaOpcao, RascunhoLevantamento, ValoresIniciaisNegocio } from "@/components/negocio-metas/novoNegocio";
import type { DadosGuardarPedido, DadosVisitaPedido, EscolhaPedido } from "../acoesPedido";
import { MarcarVisitaProvider } from "../MarcarVisita";
import { useMarcarVisita } from "../marcarVisitaContexto";
import { moradaDaLead } from "../moradaVisita";
import { valoresIniciaisDoPedido } from "../painelDoPedido";
import { faseDoPedido, nomeDoPedido, proximoIdPedido, type DadosPedido } from "../pedidoNegocio";
import type { AcoesFicha } from "../PainelBase";
import type { PassoChamada, PedidoNegocio, ResumoPessoa } from "../pessoasTipos";
import { DialogoChamada } from "./DialogoChamada";
import { orcamentoDoNegocio, type ExtrasPorNegocio } from "./orcamentoDetalhado";
import { passoDoItem } from "./passosProcesso";
import {
  portaoCriarNegocio, portaoEnviarProposta, portaoLevantamento, portaoVerificarOrcamento, portaoVisitaFeita, type FaltaProcesso, type Portao,
} from "./portoesProcesso";
import { BloqueioContext, ProcessoContext, type BloqueioProcesso, type ProcessoValor } from "./processoContexto";
import { useExtrasProcesso } from "./processoNegocios";
import type { ItemProcesso, PassoProcesso } from "./tiposProcesso";
import { useControloProcesso, type ControloProcesso } from "./useControloProcesso";
import { ehPassoDoOrcamento, useOrcamentoProcesso } from "./useOrcamentoProcesso";

/** O que os passos mudam no estado da página (o `usePessoasEstado`). */
export interface AcoesProcesso extends AcoesFicha {
  /** Marca a visita no pedido indicado, no primeiro ainda sem visita, ou num pedido novo (ver `marcarVisitaDaPessoa`). */
  marcarVisita: (pessoaId: string, escolha: EscolhaPedido, dados: DadosVisitaPedido) => void;
  /** Guarda as visitas e o levantamento de um pedido numa só gravação. */
  guardarPedido: (pedidoId: string, dados: DadosGuardarPedido) => void;
  /** Cria o pedido da pessoa já com as visitas e o levantamento. */
  criarPedidoComVisitas: (dados: DadosPedido, guardar: DadosGuardarPedido) => void;
  /** Tira o pedido (o negócio criado a partir dele substitui-o). */
  removerPedido: (pedidoId: string) => void;
}

interface ProcessoProviderProps {
  /** O dia de hoje (AAAA-MM-DD). */
  hoje: string;
  /** Todas as pessoas, com os negócios e os pedidos (o passo procura aqui a pessoa e o pedido do item). */
  resumos: readonly ResumoPessoa[];
  acoes: AcoesProcesso;
  /** As pessoas que o painel "Novo negócio" deixa escolher. */
  opcoesPessoa: readonly PessoaOpcao[];
  /** Cria o negócio (a página sabe como) e devolve o id dele. */
  aoCriarNegocio: (dados: DadosCriarNegocio) => string;
  /** O aviso para o leitor de ecrã do que o passo fez (ou do que falta para avançar). */
  aoAnunciar: (texto: string) => void;
  children: ReactNode;
}

/**
 * O painel "Novo negócio" aberto por um passo, sobre um pedido: o de visita e levantamento (`visita`, o pedido pode ainda não existir:
 * `pedidoId` nulo) ou o de criar o negócio (`negocio`). Leva a pessoa, o pedido, o serviço dele e os valores com que abre.
 */
interface PainelAberto {
  tipo: "visita" | "negocio";
  pessoaId: string;
  nome: string;
  pedidoId: string | null;
  servico: string;
  /** O nome do pedido (ver `nomeDoPedido`); vazio num pedido que ainda não existe. */
  pedidoNome: string;
  valores: ValoresIniciaisNegocio;
}

/** Os próximos passos da chamada que já trazem a sua frase (a visita marcada, a chamada agendada, a perdida): essa vale mais. */
const PASSOS_COM_FRASE: readonly PassoChamada[] = ["marcarVisita", "ligarData", "perder"];

type Interior = Omit<ProcessoProviderProps, "aoAnunciar"> & { controlo: ControloProcesso };

/**
 * O que falta para o passo avançar, olhando para o pedido do item e para o orçamento do negócio (os passos que não têm condições
 * passam sempre). Uma proposta que já estava em rascunho, sem orçamento detalhado (o exemplo), conta como já verificada.
 */
function portaoDoPasso(passo: PassoProcesso, r: ResumoPessoa, item: ItemProcesso, extras: ExtrasPorNegocio): Portao {
  const pedido = r.pedidos.find((p) => p.id === item.pedidoId) ?? null;
  const negocio = r.abertos.find((n) => n.id === item.id);
  const orcamento = negocio && orcamentoDoNegocio(negocio, extras);
  if (passo === "verificarOrcamento") return portaoVerificarOrcamento(orcamento);
  if (passo === "enviarProposta") return portaoEnviarProposta({ verificado: orcamento?.verificado ?? true });
  if (passo === "marcarVisitaFeita") return portaoVisitaFeita(pedido);
  if (passo === "criarNegocio") {
    return portaoCriarNegocio({ pessoaId: r.pessoa.id, visitas: pedido?.visitas ?? [], linhas: pedido?.levantamento?.linhas ?? [] });
  }
  return { ok: true, emFalta: [] };
}

function ProcessoInterior({ hoje, resumos, acoes, opcoesPessoa, aoCriarNegocio, controlo, children }: Interior) {
  const { t } = useTranslation();
  const marcarVisita = useMarcarVisita();
  const [chamada, setChamada] = useState<{ pessoaId: string; pedidoId?: string } | null>(null);
  const [painel, setPainel] = useState<PainelAberto | null>(null);
  // O que o painel mostrou da última vez: o título não volta ao de omissão enquanto o painel ainda está a sair.
  const ultimoPainel = useRef<PainelAberto | null>(null);
  if (painel) ultimoPainel.current = painel;
  const doPainel = painel ?? ultimoPainel.current;
  const [bloqueio, setBloqueio] = useState<BloqueioProcesso | null>(null);
  const [motivoPainel, setMotivoPainel] = useState<string | null>(null);
  // Cada recusa conta uma tentativa: o painel remonta o alerta (e o leitor de ecrã volta a lê-lo) mesmo com o mesmo texto.
  const [tentativaPainel, setTentativaPainel] = useState(0);
  const recusarNoPainel = (texto: string) => { setMotivoPainel(texto); setTentativaPainel((n) => n + 1); };
  const extras = useExtrasProcesso();
  const resumoDe = (id: string | null) => resumos.find((r) => r.pessoa.id === id) ?? null;

  /** O que falta para o passo avançar, numa frase: "Marcar a visita como feita: ainda não é possível. Falta...". */
  const textoDoBloqueio = (passo: PassoProcesso, faltas: FaltaProcesso[]): string => {
    const reasons = faltas.map((falta) => t(`pessoasPagina.gate.${falta}`)).join(" ");
    return t("pessoasPagina.gate.blocked", { step: t(`pessoasPagina.todo.step.${passo}`), reasons });
  };
  const orcamento = useOrcamentoProcesso({ hoje, resumos, controlo, textoDoBloqueio });

  /**
   * O botão não avança e nada abre: o que falta diz-se na região live (sem toast, que sumia em segundos) e fica escrito junto ao
   * botão até o utilizador agir.
   */
  const bloquear = (item: ItemProcesso, passo: PassoProcesso, portao: Portao) => {
    const texto = textoDoBloqueio(passo, portao.emFalta);
    setBloqueio({ itemId: item.id, passo, texto });
    controlo.avisar(texto);
  };

  const abrirPainel = (r: ResumoPessoa, pedido: PedidoNegocio | null, tipo: PainelAberto["tipo"]) => {
    setPainel({
      tipo, pessoaId: r.pessoa.id, nome: r.pessoa.nome, pedidoId: pedido?.id ?? null, servico: pedido?.servico ?? "",
      pedidoNome: pedido ? nomeDoPedido(t, pedido, r.pedidos) : "",
      valores: valoresIniciaisDoPedido(r.pessoa, pedido),
    });
  };

  const executar = (item: ItemProcesso, origem: HTMLElement | null) => {
    setBloqueio(null);
    const r = resumoDe(item.pessoaId);
    if (!r) return;
    const passo = passoDoItem(item).id;
    // Uma pessoa perdida não avança nada (um botão velho, ou um painel aberto antes de a perderem): explica-se em vez de falhar calado.
    if (r.pessoa.perdida) { bloquear(item, passo, { ok: false, emFalta: ["pessoaPerdida"] }); return; }
    const portao = portaoDoPasso(passo, r, item, extras);
    if (!portao.ok) { bloquear(item, passo, portao); return; }
    controlo.guardarFoco({ itemId: item.id, pessoaId: item.pessoaId, origem });
    const pedido = r.pedidos.find((p) => p.id === item.pedidoId) ?? null;
    if (passo === "registarChamada") setChamada({ pessoaId: r.pessoa.id, pedidoId: item.pedidoId ?? undefined });
    else if (passo === "marcarVisita") {
      marcarVisita?.pedir({
        pessoaId: r.pessoa.id, pedidoId: item.pedidoId ?? undefined, nome: r.pessoa.nome, servico: item.trabalho ?? "", moradaLead: moradaDaLead(r.pessoa),
        ...(pedido ? { pedidoNome: nomeDoPedido(t, pedido, r.pedidos) } : {}),
      });
    } else if (passo === "marcarVisitaFeita") abrirPainel(r, pedido, "visita");
    else if (passo === "criarNegocio") abrirPainel(r, pedido, "negocio");
    else if (ehPassoDoOrcamento(passo)) orcamento.abrir(item, passo);
  };

  /** "Novo negócio com visita" (um cliente): abre o painel de visita e levantamento para um pedido que ainda não existe. */
  const abrirNovoPedido = (pessoaId: string, origem: HTMLElement | null) => {
    const r = resumoDe(pessoaId);
    if (!r || r.pessoa.perdida) return;
    controlo.guardarFoco({ itemId: "pedido-novo", pessoaId, origem });
    abrirPainel(r, null, "visita");
  };

  // O valor do contexto é o mesmo a vida toda: abrir e fechar diálogos (estado deste componente) não re-renderiza os cartões.
  // O `executar` do render mais recente fica num ref, por isso lê sempre as pessoas e os estados de agora.
  const executarAtual = useRef(executar);
  executarAtual.current = executar;
  const novoPedidoAtual = useRef(abrirNovoPedido);
  novoPedidoAtual.current = abrirNovoPedido;
  const valor = useMemo<ProcessoValor>(() => ({
    executar: (item, origem) => executarAtual.current(item, origem),
    abrirNovoPedido: (pessoaId, origem) => novoPedidoAtual.current(pessoaId, origem),
  }), []);

  /**
   * Guarda as visitas e o levantamento do painel numa só gravação (um pedido novo cria-se aqui); devolve `false` (o painel fica
   * aberto) se ainda falta algo. O motivo diz-se DENTRO do painel (alerta): o toast e a região live ficam fora do modal e o leitor
   * de ecrã não os ouve enquanto ele está aberto.
   */
  const guardar = (rascunho: RascunhoLevantamento, visitas: VisitaNegocio[], comercial: string): boolean => {
    if (!painel) return false;
    // O estado de agora, não o de quando o painel abriu: a pessoa pode ter sido perdida, ou o pedido ter saído, entretanto. Guardar não
    // faria nada e o aviso de sucesso seria falso.
    const atual = resumoDe(painel.pessoaId);
    const faltaAgora: FaltaProcesso[] = atual?.pessoa.perdida
      ? ["pessoaPerdida"]
      : !atual || (painel.pedidoId !== null && !atual.pedidos.some((p) => p.id === painel.pedidoId)) ? ["pedidoDesapareceu"] : [];
    if (faltaAgora.length > 0) {
      recusarNoPainel(textoDoBloqueio("marcarVisitaFeita", faltaAgora));
      return false;
    }
    const portao = portaoLevantamento({ visitas, linhas: rascunho.linhas, exigirVisita: painel.pedidoId === null });
    if (!portao.ok) {
      recusarNoPainel(textoDoBloqueio("marcarVisitaFeita", portao.emFalta));
      return false;
    }
    setMotivoPainel(null);
    const dados: DadosGuardarPedido = { visitas, levantamento: rascunho, comercial };
    const novoId = proximoIdPedido(resumos.flatMap((r) => r.pedidos));
    if (painel.pedidoId === null) acoes.criarPedidoComVisitas({ pessoaId: painel.pessoaId, servico: "", comercial }, dados);
    else acoes.guardarPedido(painel.pedidoId, dados);
    const feita = visitas.some((v) => v.estado === "feita");
    controlo.registar(feita ? "visitaFeita" : "visitaGuardada", painel.pessoaId, undefined, `pedido-${painel.pedidoId ?? novoId}`);
    return true;
  };

  /**
   * O negócio criado pelo painel: herda o serviço do pedido, o pedido sai e o aviso diz a fase em que a pessoa ficou. Só se o negócio é
   * da mesma pessoa do painel: de outra, nem herda o serviço nem tira o pedido da primeira.
   */
  const criarNegocio = (dados: DadosCriarNegocio) => {
    const doPedido = doPainel && dados.pessoa.id === doPainel.pessoaId ? doPainel : null;
    const id = aoCriarNegocio(doPedido?.servico ? { ...dados, servico: doPedido.servico } : dados);
    if (doPedido?.pedidoId) acoes.removerPedido(doPedido.pedidoId);
    controlo.registar("negocio", dados.pessoa.id, undefined, id);
  };

  // O painel de visita e levantamento é de um pedido: o título diz qual («Visita e levantamento de Ana · Cozinha»).
  const nome = { name: doPainel?.nome ?? "" };
  const nomeComPedido = { name: doPainel?.pedidoNome ? `${nome.name} · ${doPainel.pedidoNome}` : nome.name };
  const textos = doPainel && {
    titulo: t(doPainel.tipo === "visita" ? "pessoasPagina.process.visitSurvey.title" : "pessoasPagina.process.deal.title", doPainel.tipo === "visita" ? nomeComPedido : nome),
    descricao: t(
      doPainel.tipo === "visita" ? "pessoasPagina.process.visitSurvey.description" : "pessoasPagina.process.deal.description",
      { ...nome, request: doPainel.pedidoNome || t("pessoasPagina.process.requestNew") },
    ),
  };
  return (
    <ProcessoContext.Provider value={valor}>
      <BloqueioContext.Provider value={bloqueio}>{children}</BloqueioContext.Provider>
      <DialogoChamada
        resumo={resumoDe(chamada?.pessoaId ?? null)} pedidoId={chamada?.pedidoId} hoje={hoje} acoes={acoes} aoFechar={() => setChamada(null)}
        aoDevolverFoco={controlo.aoDevolverFoco}
        aoConcluir={(id, mensagem, passo) => {
          controlo.registar("chamada", id, passo && PASSOS_COM_FRASE.includes(passo) ? mensagem : undefined);
          setChamada(null);
        }}
      />
      {orcamento.dialogos}
      <NovoNegocioDialogo
        pessoas={opcoesPessoa} semBotao aberto={painel !== null} abaInicial="visita" seccaoInicial={painel?.tipo === "visita" ? "visitas" : undefined}
        pessoaInicialId={painel?.pessoaId} valoresIniciais={painel?.valores} aoDevolverFoco={controlo.aoDevolverFoco}
        titulo={textos?.titulo} descricao={textos?.descricao}
        aoMudarAberto={(aberto) => { if (!aberto) { setPainel(null); setMotivoPainel(null); } }}
        guardarLevantamento={{ texto: t("pessoasPagina.process.visitSurvey.save"), aoGuardar: guardar, motivo: motivoPainel, tentativa: tentativaPainel }}
        aoCriar={criarNegocio}
      />
    </ProcessoContext.Provider>
  );
}

/**
 * O provider do processo. Envolve o `MarcarVisitaProvider` (o diálogo de marcar a visita já existia): assim a visita marcada a
 * partir do "A fazer" (ou de uma submissão) também avisa o que mudou e devolve o foco ao botão certo.
 */
export function ProcessoProvider({ aoAnunciar, children, ...p }: ProcessoProviderProps) {
  const controlo = useControloProcesso({ resumos: p.resumos, hoje: p.hoje, aoAnunciar });
  // O botão «Marcar visita» das submissões deixa de se mostrar a quem já tem um pedido em Visita.
  const jaComVisita = useMemo(
    () => new Set(p.resumos.filter((r) => r.pedidos.some((d) => faseDoPedido(d) === "visita")).map((r) => r.pessoa.id)), [p.resumos],
  );
  return (
    <MarcarVisitaProvider
      hoje={p.hoje} aoDevolverFoco={controlo.aoDevolverFoco} jaComVisita={jaComVisita}
      aoMarcar={(pessoaId, escolha, dados) => {
        p.acoes.marcarVisita(pessoaId, escolha, dados);
        controlo.registar("visita", pessoaId, undefined, escolha.pedidoId ? `pedido-${escolha.pedidoId}` : undefined);
      }}
    >
      <ProcessoInterior {...p} controlo={controlo}>{children}</ProcessoInterior>
    </MarcarVisitaProvider>
  );
}
