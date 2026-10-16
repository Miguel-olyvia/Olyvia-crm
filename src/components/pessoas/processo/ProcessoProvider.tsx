// Executa os passos da lead até ao negócio (Fase 3), a partir dos botões do "A fazer" do Quadro e da Lista. Monta UMA vez, ao nível
// da página, o que cada passo precisa: o diálogo da chamada, o de marcar a visita (o `MarcarVisitaProvider` que já existe), o
// de "A visita já foi feita?" e o painel "Novo negócio" (levantamento e criar o negócio). Tudo em memória, pelo estado da página.
// Os passos das Fases 4 e 5 (orçamento, proposta, contrato...) ainda não executam: os botões abrem a ficha.
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { NovoNegocioDialogo } from "@/components/negocio-metas/NovoNegocioDialogo";
import type { DadosCriarNegocio, PessoaOpcao, RascunhoLevantamento, ValoresIniciaisNegocio } from "@/components/negocio-metas/novoNegocio";
import { MarcarVisitaProvider } from "../MarcarVisita";
import { useMarcarVisita } from "../marcarVisitaContexto";
import { moradaDaLead } from "../moradaVisita";
import type { AcoesFicha } from "../PainelBase";
import type { PassoChamada, ResumoPessoa } from "../pessoasTipos";
import { valoresIniciaisDaVisita, visitaDaPessoa } from "../visitaProxima";
import type { DadosVisita } from "../visitaPessoa";
import { useAvisoAlternado } from "./avisoAlternado";
import { DialogoChamada } from "./DialogoChamada";
import { DialogoVisitaFeita } from "./DialogoVisitaFeita";
import { passoDoItem } from "./passosProcesso";
import { portaoCriarNegocio, portaoFazerLevantamento, portaoLevantamento, portaoVisitaFeita, type Portao } from "./portoesProcesso";
import { BloqueioContext, ProcessoContext, type BloqueioProcesso, type ProcessoValor } from "./processoContexto";
import type { ItemProcesso, PassoProcesso } from "./tiposProcesso";
import { useControloProcesso, type ControloProcesso } from "./useControloProcesso";

/** O que os passos mudam no estado da página (o `usePessoasEstado`). */
export interface AcoesProcesso extends AcoesFicha {
  marcarVisita: (id: string, dados: DadosVisita) => void;
  marcarVisitaFeita: (id: string, nota: string) => void;
  guardarLevantamento: (id: string, rascunho: RascunhoLevantamento) => void;
}

interface ProcessoProviderProps {
  /** O dia de hoje (AAAA-MM-DD). */
  hoje: string;
  /** Todas as pessoas, com os negócios (o passo procura aqui a pessoa do item). */
  resumos: readonly ResumoPessoa[];
  acoes: AcoesProcesso;
  /** As pessoas que o painel "Novo negócio" deixa escolher. */
  opcoesPessoa: readonly PessoaOpcao[];
  /** Cria o negócio e conclui a visita de onde veio (a página sabe como). */
  aoCriarNegocio: (dados: DadosCriarNegocio) => void;
  /** O aviso para o leitor de ecrã do que o passo fez (ou do que falta para avançar). */
  aoAnunciar: (texto: string) => void;
  children: ReactNode;
}

/** O painel "Novo negócio" aberto por um passo: a pessoa e os valores da visita (com o levantamento guardado, se houver). */
interface NegocioAberto {
  pessoaId: string;
  nome: string;
  /** O passo que o abriu: decide o título e a descrição do painel. */
  passo: "fazerLevantamento" | "criarNegocio";
  valores: ValoresIniciaisNegocio;
}

/** Os próximos passos da chamada que já trazem a sua frase (a visita marcada, a chamada agendada, a perdida): essa vale mais. */
const PASSOS_COM_FRASE: readonly PassoChamada[] = ["marcarVisita", "ligarData", "perder"];

type Interior = Omit<ProcessoProviderProps, "aoAnunciar"> & { controlo: ControloProcesso };

/** O que falta para o passo avançar, olhando para a pessoa (os passos que não têm condições passam sempre). */
function portaoDoPasso(passo: PassoProcesso, r: ResumoPessoa): Portao {
  const visita = visitaDaPessoa(r.pessoa, r.etapa);
  if (passo === "marcarVisitaFeita") return portaoVisitaFeita(visita);
  if (passo === "fazerLevantamento") return portaoFazerLevantamento(visita);
  if (passo === "criarNegocio") {
    return portaoCriarNegocio({ pessoaId: r.pessoa.id, visitaFeita: visita?.feita === true, linhas: visita?.levantamento?.linhas ?? [] });
  }
  return { ok: true, emFalta: [] };
}

function ProcessoInterior({ hoje, resumos, acoes, opcoesPessoa, aoCriarNegocio, controlo, children }: Interior) {
  const { t } = useTranslation();
  const marcarVisita = useMarcarVisita();
  const [chamada, setChamada] = useState<string | null>(null);
  const [visitaFeita, setVisitaFeita] = useState<string | null>(null);
  const [negocio, setNegocio] = useState<NegocioAberto | null>(null);
  // O que o painel mostrou da última vez: o título não volta ao de omissão enquanto o painel ainda está a sair.
  const ultimoNegocio = useRef<NegocioAberto | null>(null);
  if (negocio) ultimoNegocio.current = negocio;
  const doPainel = negocio ?? ultimoNegocio.current;
  const [bloqueio, setBloqueio] = useState<BloqueioProcesso | null>(null);
  const [motivoLevantamento, setMotivoLevantamento] = useState<string | null>(null);
  const alternar = useAvisoAlternado();
  const resumoDe = (id: string | null) => resumos.find((r) => r.pessoa.id === id) ?? null;

  /** O que falta para o passo avançar, numa frase: "Fazer o levantamento: ainda não é possível. Falta...". */
  const textoDoBloqueio = (passo: PassoProcesso, portao: Portao): string => {
    const reasons = portao.emFalta.map((falta) => t(`pessoasPagina.gate.${falta}`)).join(" ");
    return t("pessoasPagina.gate.blocked", { step: t(`pessoasPagina.todo.step.${passo}`), reasons });
  };

  /**
   * O botão não avança e nada abre: o que falta diz-se na região live (sem toast, que sumia em segundos) e fica escrito junto ao
   * botão até o utilizador agir.
   */
  const bloquear = (item: ItemProcesso, passo: PassoProcesso, portao: Portao) => {
    const texto = textoDoBloqueio(passo, portao);
    setBloqueio({ itemId: item.id, passo, texto });
    controlo.avisar(texto);
  };

  const abrirNegocio = (r: ResumoPessoa, passo: NegocioAberto["passo"]) => {
    const visita = visitaDaPessoa(r.pessoa, r.etapa);
    if (visita) setNegocio({ pessoaId: r.pessoa.id, nome: r.pessoa.nome, passo, valores: valoresIniciaisDaVisita(r.pessoa, visita) });
  };

  const executar = (item: ItemProcesso, origem: HTMLElement | null) => {
    setBloqueio(null);
    const r = resumoDe(item.pessoaId);
    if (!r) return;
    const passo = passoDoItem(item).id;
    const portao = portaoDoPasso(passo, r);
    if (!portao.ok) { bloquear(item, passo, portao); return; }
    controlo.guardarFoco({ itemId: item.id, pessoaId: item.pessoaId, origem });
    if (passo === "registarChamada") setChamada(r.pessoa.id);
    else if (passo === "marcarVisita") {
      marcarVisita?.pedir({ pessoaId: r.pessoa.id, nome: r.pessoa.nome, servico: item.trabalho ?? "", moradaLead: moradaDaLead(r.pessoa) });
    } else if (passo === "marcarVisitaFeita") setVisitaFeita(r.pessoa.id);
    else if (passo === "fazerLevantamento" || passo === "criarNegocio") abrirNegocio(r, passo);
  };
  // O valor do contexto é o mesmo a vida toda: abrir e fechar diálogos (estado deste componente) não re-renderiza os cartões.
  // O `executar` do render mais recente fica num ref, por isso lê sempre as pessoas e os estados de agora.
  const executarAtual = useRef(executar);
  executarAtual.current = executar;
  const valor = useMemo<ProcessoValor>(() => ({ executar: (item, origem) => executarAtual.current(item, origem) }), []);

  /**
   * Guarda o levantamento do painel; devolve `false` (o painel fica aberto) se ainda falta algo. O motivo diz-se DENTRO do painel
   * (alerta): o toast e a região live ficam fora do modal e o leitor de ecrã não os ouve enquanto ele está aberto.
   */
  const guardarLevantamento = (rascunho: RascunhoLevantamento): boolean => {
    const r = resumoDe(negocio?.pessoaId ?? null);
    if (!r) return false;
    const portao = portaoLevantamento({ visitaFeita: visitaDaPessoa(r.pessoa, r.etapa)?.feita === true, linhas: rascunho.linhas });
    if (!portao.ok) {
      // O texto alterna um espaço inseparável: um segundo clique com o mesmo motivo volta a ser anunciado.
      setMotivoLevantamento(alternar(textoDoBloqueio("fazerLevantamento", portao)));
      return false;
    }
    setMotivoLevantamento(null);
    acoes.guardarLevantamento(r.pessoa.id, rascunho);
    controlo.registar("levantamento", r.pessoa.id);
    return true;
  };

  const feita = resumoDe(visitaFeita);
  const nomeDoPainel = doPainel ? { name: doPainel.nome } : { name: "" };
  const textosDoPainel = doPainel && {
    titulo: t(`pessoasPagina.process.${doPainel.passo === "fazerLevantamento" ? "survey" : "deal"}.title`, nomeDoPainel),
    descricao: t(`pessoasPagina.process.${doPainel.passo === "fazerLevantamento" ? "survey" : "deal"}.description`, nomeDoPainel),
  };
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
      <DialogoVisitaFeita
        pessoa={feita ? { id: feita.pessoa.id, nome: feita.pessoa.nome } : null} aoFechar={() => setVisitaFeita(null)}
        aoDevolverFoco={controlo.aoDevolverFoco}
        aoConfirmar={(id, nota) => { acoes.marcarVisitaFeita(id, nota); controlo.registar("visitaFeita", id); setVisitaFeita(null); }}
      />
      <NovoNegocioDialogo
        pessoas={opcoesPessoa} semBotao aberto={negocio !== null} abaInicial="visita" pessoaInicialId={negocio?.pessoaId}
        valoresIniciais={negocio?.valores} aoDevolverFoco={controlo.aoDevolverFoco}
        titulo={textosDoPainel?.titulo} descricao={textosDoPainel?.descricao}
        aoMudarAberto={(aberto) => { if (!aberto) { setNegocio(null); setMotivoLevantamento(null); } }}
        guardarLevantamento={{ texto: t("pessoasPagina.process.survey.save"), aoGuardar: guardarLevantamento, motivo: motivoLevantamento }}
        aoCriar={(dados) => { aoCriarNegocio(dados); controlo.registar("negocio", dados.pessoa.id); }}
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
  return (
    <MarcarVisitaProvider
      hoje={p.hoje} aoDevolverFoco={controlo.aoDevolverFoco}
      aoMarcar={(id, dados) => { p.acoes.marcarVisita(id, dados); controlo.registar("visita", id); }}
    >
      <ProcessoInterior {...p} controlo={controlo}>{children}</ProcessoInterior>
    </MarcarVisitaProvider>
  );
}
