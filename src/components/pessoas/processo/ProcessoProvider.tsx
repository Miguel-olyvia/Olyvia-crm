// Executa os passos da pessoa até ao negócio, a partir dos botões do "A fazer" do Quadro e da Lista e dos da ficha. Monta UMA vez, ao nível da
// página, o que cada passo precisa: o diálogo da chamada, o de marcar a visita (o `MarcarVisitaProvider` que já existe), o painel de visita
// e levantamento da pessoa (`usePainelRegistos`) e o painel "Novo negócio", onde o negócio se cria à mão e liga registos da pessoa. A visita,
// o contacto e o levantamento são da PESSOA (não há pedidos). Tudo em memória, pelo estado da página.
// Os passos do orçamento e da proposta (criar, verificar, a Direção simulada e enviar) têm os seus diálogos em `useOrcamentoProcesso`;
// os do fim do percurso (a resposta do cliente e a assinatura) em `useContratoProcesso`. Todos os passos executam.
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { NovoNegocioDialogo } from "@/components/negocio-metas/NovoNegocioDialogo";
import type { DadosCriarNegocio, PessoaOpcao } from "@/components/negocio-metas/novoNegocio";
import { MarcarVisitaProvider } from "../MarcarVisita";
import { useMarcarVisita } from "../marcarVisitaContexto";
import { moradaDaLead } from "../moradaVisita";
import type { AcoesFicha } from "../PainelBase";
import type { PassoChamada, ResumoPessoa } from "../pessoasTipos";
import { idCartaoPessoa } from "../quadro/cartoesQuadroPessoas";
import type { PedidoGuardarRegistos } from "../usePessoasEstado";
import type { DadosVisitaPessoa } from "../visitaDaPessoa";
import { DialogoChamada } from "./DialogoChamada";
import { orcamentoDoNegocio, type ExtrasPorNegocio } from "./orcamentoDetalhado";
import { passoDoItem } from "./passosProcesso";
import {
  portaoCriarNegocio, portaoEnviarProposta, portaoVerificarOrcamento, portaoVisitaFeita, type FaltaProcesso, type Portao,
} from "./portoesProcesso";
import { BloqueioContext, ProcessoContext, type BloqueioProcesso, type ProcessoValor } from "./processoContexto";
import { useExtrasProcesso } from "./processoNegocios";
import type { ItemProcesso, PassoProcesso } from "./tiposProcesso";
import { useControloProcesso, type ControloProcesso } from "./useControloProcesso";
import { ehPassoDoOrcamento, useOrcamentoProcesso } from "./useOrcamentoProcesso";
import { ehPassoDoContrato, useContratoProcesso } from "./useContratoProcesso";
import { usePainelRegistos } from "./usePainelRegistos";

/** O que os passos mudam no estado da página (o `usePessoasEstado`). */
export interface AcoesProcesso extends AcoesFicha {
  /** Marca uma visita à pessoa (fica nos registos dela, por ligar). */
  marcarVisita: (pessoaId: string, dados: DadosVisitaPessoa, negocioId?: string) => void;
  /** Guarda as visitas e o levantamento da pessoa numa só gravação. */
  guardarRegistos: (pessoaId: string, dados: PedidoGuardarRegistos) => void;
}

interface ProcessoProviderProps {
  /** O dia de hoje (AAAA-MM-DD). */
  hoje: string;
  /** Todas as pessoas, com os negócios e os registos (o passo procura aqui a pessoa e o negócio do item). */
  resumos: readonly ResumoPessoa[];
  acoes: AcoesProcesso;
  /** As pessoas que o painel "Novo negócio" deixa escolher. */
  opcoesPessoa: readonly PessoaOpcao[];
  /** Cria o negócio (a página sabe como: cria-o e liga os registos escolhidos) e devolve o id dele. */
  aoCriarNegocio: (dados: DadosCriarNegocio) => string;
  /** O aviso para o leitor de ecrã do que o passo fez (ou do que falta para avançar). */
  aoAnunciar: (texto: string) => void;
  children: ReactNode;
}

/** Os próximos passos da chamada que já trazem a sua frase (a visita marcada, a chamada agendada, a abordagem encerrada): essa vale mais. */
const PASSOS_COM_FRASE: readonly PassoChamada[] = ["marcarVisita", "ligarData", "perder"];

type Interior = Omit<ProcessoProviderProps, "aoAnunciar"> & { controlo: ControloProcesso };

/**
 * O que falta para o passo avançar, olhando para a pessoa e para o orçamento do negócio do item (os passos que não têm condições passam
 * sempre). Uma proposta que já estava em rascunho, sem orçamento detalhado (o exemplo), conta como já verificada.
 */
function portaoDoPasso(passo: PassoProcesso, r: ResumoPessoa, item: ItemProcesso, extras: ExtrasPorNegocio): Portao {
  const negocio = r.abertos.find((n) => n.id === item.id);
  const orcamento = negocio && orcamentoDoNegocio(negocio, extras);
  if (passo === "verificarOrcamento") return portaoVerificarOrcamento(orcamento);
  if (passo === "enviarProposta" || passo === "criarProposta") return portaoEnviarProposta({ verificado: orcamento?.verificado ?? true });
  if (passo === "marcarVisitaFeita") return portaoVisitaFeita({ visitas: r.porLigar.visitas });
  if (passo === "criarNegocio") return portaoCriarNegocio({ pessoaId: r.pessoa.id });
  return { ok: true, emFalta: [] };
}

function ProcessoInterior({ hoje, resumos, acoes, opcoesPessoa, aoCriarNegocio, controlo, children }: Interior) {
  const { t } = useTranslation();
  const marcarVisita = useMarcarVisita();
  const [chamada, setChamada] = useState<string | null>(null);
  // A pessoa cujo negócio se cria (o painel «Novo negócio», com ela já escolhida).
  const [negocioDe, setNegocioDe] = useState<{ pessoaId: string; comercial: string } | null>(null);
  const [bloqueio, setBloqueio] = useState<BloqueioProcesso | null>(null);
  const extras = useExtrasProcesso();
  const resumoDe = (id: string | null) => resumos.find((r) => r.pessoa.id === id) ?? null;

  /** O que falta para o passo avançar, numa frase: "Marcar a visita como feita: ainda não é possível. Falta...". */
  const textoDoBloqueio = (passo: PassoProcesso, faltas: FaltaProcesso[]): string => {
    const reasons = faltas.map((falta) => t(`pessoasPagina.gate.${falta}`)).join(" ");
    return t("pessoasPagina.gate.blocked", { step: t(`pessoasPagina.todo.step.${passo}`), reasons });
  };
  const orcamento = useOrcamentoProcesso({ hoje, resumos, controlo, textoDoBloqueio });
  const contrato = useContratoProcesso({ hoje, resumos, controlo, textoDoBloqueio });
  const registos = usePainelRegistos({ resumos, opcoesPessoa, guardarRegistos: acoes.guardarRegistos, controlo, textoDoBloqueio });

  /**
   * O botão não avança e nada abre: o que falta diz-se na região live (sem toast, que sumia em segundos) e fica escrito junto ao
   * botão até o utilizador agir.
   */
  const bloquear = (item: ItemProcesso, passo: PassoProcesso, portao: Portao) => {
    const texto = textoDoBloqueio(passo, portao.emFalta);
    setBloqueio({ itemId: item.id, passo, texto });
    controlo.avisar(texto);
  };

  const executar = (item: ItemProcesso, origem: HTMLElement | null) => {
    setBloqueio(null);
    const r = resumoDe(item.pessoaId);
    if (!r) return;
    const passo = passoDoItem(item).id;
    // Uma pessoa perdida ou com a abordagem encerrada não avança nada (um botão velho, ou um painel aberto antes): explica-se em vez de falhar calado.
    if (r.pessoa.perdida || r.pessoa.encerrada) { bloquear(item, passo, { ok: false, emFalta: ["pessoaPerdida"] }); return; }
    const portao = portaoDoPasso(passo, r, item, extras);
    if (!portao.ok) { bloquear(item, passo, portao); return; }
    controlo.guardarFoco({ itemId: item.id, pessoaId: item.pessoaId, origem });
    if (passo === "registarChamada") setChamada(r.pessoa.id);
    else if (passo === "marcarVisita") marcarVisita?.pedir({ pessoaId: r.pessoa.id, nome: r.pessoa.nome, moradaLead: moradaDaLead(r.pessoa) });
    else if (passo === "marcarVisitaFeita") registos.abrir(r, "visita");
    else if (passo === "fazerLevantamento") registos.abrir(r, "levantamento", r.abertos.find((n) => n.id === item.id));
    else if (passo === "criarNegocio") setNegocioDe({ pessoaId: r.pessoa.id, comercial: r.pessoa.comercial });
    else if (ehPassoDoOrcamento(passo)) orcamento.abrir(item, passo);
    else if (ehPassoDoContrato(passo)) contrato.abrir(item, passo);
  };

  /** «Visita e levantamento» (o menu «Mais» da ficha): abre o painel dos registos da pessoa. */
  const abrirVisitaLevantamento = (pessoaId: string, origem: HTMLElement | null) => {
    const r = resumoDe(pessoaId);
    if (!r || r.pessoa.perdida || r.pessoa.encerrada) return;
    controlo.guardarFoco({ itemId: idCartaoPessoa(pessoaId), pessoaId, origem });
    registos.abrir(r, "visita");
  };

  // O valor do contexto é o mesmo a vida toda: abrir e fechar diálogos (estado deste componente) não re-renderiza os cartões.
  // O `executar` do render mais recente fica num ref, por isso lê sempre as pessoas e os estados de agora.
  const executarAtual = useRef(executar);
  executarAtual.current = executar;
  const visitaAtual = useRef(abrirVisitaLevantamento);
  visitaAtual.current = abrirVisitaLevantamento;
  const valor = useMemo<ProcessoValor>(() => ({
    executar: (item, origem) => executarAtual.current(item, origem),
    abrirVisitaLevantamento: (pessoaId, origem) => visitaAtual.current(pessoaId, origem),
  }), []);

  /** O negócio criado à mão: a página cria-o e liga os registos escolhidos; o aviso diz a fase em que a pessoa ficou. */
  const criarNegocio = (dados: DadosCriarNegocio) => {
    const id = aoCriarNegocio(dados);
    controlo.registar("negocio", dados.pessoa.id, undefined, id);
  };

  const nomeDoNegocio = resumoDe(negocioDe?.pessoaId ?? null)?.pessoa.nome ?? "";
  return (
    <ProcessoContext.Provider value={valor}>
      <BloqueioContext.Provider value={bloqueio}>{children}</BloqueioContext.Provider>
      <DialogoChamada
        resumo={resumoDe(chamada)} hoje={hoje} acoes={acoes} aoFechar={() => setChamada(null)} aoDevolverFoco={controlo.aoDevolverFoco}
        aoConcluir={(id, mensagem, passo) => {
          controlo.registar("chamada", id, passo && PASSOS_COM_FRASE.includes(passo) ? mensagem : undefined);
          setChamada(null);
        }}
      />
      {orcamento.dialogos}
      {contrato.dialogos}
      {registos.dialogo}
      <NovoNegocioDialogo
        pessoas={opcoesPessoa} semBotao aberto={negocioDe !== null} pessoaInicialId={negocioDe?.pessoaId}
        valoresIniciais={negocioDe ? { pessoaId: negocioDe.pessoaId, comercial: negocioDe.comercial } : undefined}
        aoDevolverFoco={controlo.aoDevolverFoco} titulo={t("pessoasPagina.process.deal.title", { name: nomeDoNegocio })}
        descricao={t("pessoasPagina.process.deal.description")} aoMudarAberto={(aberto) => { if (!aberto) setNegocioDe(null); }} aoCriar={criarNegocio}
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
  // O botão «Marcar visita» das submissões deixa de se mostrar a quem já tem uma visita por ligar.
  const jaComVisita = useMemo(
    () => new Set(p.resumos.filter((r) => r.porLigar.visitas.some((v) => v.estado !== "cancelada")).map((r) => r.pessoa.id)), [p.resumos],
  );
  return (
    <MarcarVisitaProvider
      hoje={p.hoje} aoDevolverFoco={controlo.aoDevolverFoco} jaComVisita={jaComVisita}
      aoMarcar={(pessoaId, dados, negocioId) => {
        p.acoes.marcarVisita(pessoaId, dados, negocioId);
        controlo.registar("visita", pessoaId, undefined, idCartaoPessoa(pessoaId));
      }}
    >
      <ProcessoInterior {...p} controlo={controlo}>{children}</ProcessoInterior>
    </MarcarVisitaProvider>
  );
}
