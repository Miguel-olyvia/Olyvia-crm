// O painel «Visita e levantamento» ao nível da página: o mesmo painel lateral de «Novo negócio», no modo `registos`, que guarda as visitas e o
// levantamento nos registos da PESSOA (nunca num pedido). Abre de três sítios: o passo «Marcar a visita como feita» e o menu «Visita e
// levantamento» da ficha (tudo da pessoa) e o passo «Fazer o levantamento» de um negócio em Levantamento (guarda e liga o levantamento ao
// negócio). Só exemplo, em memória.
import { useRef, useState, type ReactNode } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { NovoNegocioDialogo } from "@/components/negocio-metas/NovoNegocioDialogo";
import { guardarNegocio } from "@/components/negocio-metas/negociosAlterados";
import type { NegocioMes, VisitaNegocio } from "@/components/negocio-metas/negocioMetas";
import type { PessoaOpcao, RascunhoLevantamento, ValoresIniciaisNegocio } from "@/components/negocio-metas/novoNegocio";
import { ligarRegisto, registosAtuais } from "@/components/negocio-metas/registosPessoa";
import type { PedidoGuardarRegistos } from "../usePessoasEstado";
import type { ResumoPessoa } from "../pessoasTipos";
import { valoresIniciaisDosRegistos } from "../valoresRegistos";
import { idCartaoPessoa } from "../quadro/cartoesQuadroPessoas";
import { portaoFazerLevantamento, portaoLevantamento, type FaltaProcesso } from "./portoesProcesso";
import type { PassoProcesso } from "./tiposProcesso";
import type { ControloProcesso } from "./useControloProcesso";

/** O painel aberto: de visita e levantamento da pessoa (`visita`) ou o levantamento de um negócio (`levantamento`, com o negócio). */
interface Aberto {
  tipo: "visita" | "levantamento";
  pessoaId: string;
  nome: string;
  valores: ValoresIniciaisNegocio;
  /** O negócio a que o levantamento se liga (só em `levantamento`). */
  negocio?: { id: string; nome: string };
}

interface Entrada {
  resumos: readonly ResumoPessoa[];
  opcoesPessoa: readonly PessoaOpcao[];
  guardarRegistos: (pessoaId: string, dados: PedidoGuardarRegistos) => void;
  controlo: ControloProcesso;
  /** "<passo>: ainda não é possível. <o que falta>": o mesmo texto dos portões da página. */
  textoDoBloqueio: (passo: PassoProcesso, faltas: FaltaProcesso[]) => string;
}

const MARCADA_FEITA = (visitas: readonly VisitaNegocio[]): boolean => visitas.some((v) => v.estado === "feita");

/** O levantamento mais recente da pessoa que ainda não está ligado a nenhum negócio (lê o store de agora). */
function levantamentoPorLigar(pessoaId: string): { id: string } | undefined {
  return [...registosAtuais().levantamentos].filter((l) => l.pessoaId === pessoaId && l.negocioId === null).sort((a, b) => b.data.localeCompare(a.data))[0];
}

export function usePainelRegistos({ resumos, opcoesPessoa, guardarRegistos, controlo, textoDoBloqueio }: Entrada): {
  abrir: (r: ResumoPessoa, tipo: Aberto["tipo"], negocio?: NegocioMes) => void;
  dialogo: ReactNode;
} {
  const { t } = useTranslation();
  const [painel, setPainel] = useState<Aberto | null>(null);
  // O que o painel mostrou da última vez: o título não volta ao de omissão enquanto o painel ainda está a sair.
  const ultimo = useRef<Aberto | null>(null);
  if (painel) ultimo.current = painel;
  const doPainel = painel ?? ultimo.current;
  const [motivo, setMotivo] = useState<string | null>(null);
  // Cada recusa conta uma tentativa: o painel remonta o alerta (e o leitor de ecrã volta a lê-lo) mesmo com o mesmo texto.
  const [tentativa, setTentativa] = useState(0);
  const recusar = (texto: string) => { setMotivo(texto); setTentativa((n) => n + 1); };

  const abrir = (r: ResumoPessoa, tipo: Aberto["tipo"], negocio?: NegocioMes) => {
    setPainel({
      tipo, pessoaId: r.pessoa.id, nome: r.pessoa.nome, valores: valoresIniciaisDosRegistos(r.pessoa, r.registos),
      ...(negocio ? { negocio: { id: negocio.id, nome: negocio.servico || t("pessoasPagina.board.dealName") } } : {}),
    });
  };

  /** O levantamento do negócio guardou-se na pessoa: liga-se ao negócio (que passa a ter o levantamento ligado) e o aviso diz a fase. */
  const ligarAoNegocio = (aberto: Aberto, resumo: ResumoPessoa) => {
    const negocio = aberto.negocio && resumo.abertos.find((n) => n.id === aberto.negocio?.id);
    const livre = levantamentoPorLigar(aberto.pessoaId);
    if (!negocio || !livre) return;
    ligarRegisto({ tipo: "levantamento", id: livre.id }, negocio.id);
    if (negocio.decisaoLevantamento !== "ligado") guardarNegocio({ ...negocio, decisaoLevantamento: "ligado" });
    controlo.registar("levantamento", aberto.pessoaId, undefined, negocio.id);
  };

  /**
   * Guarda as visitas e o levantamento do painel numa só gravação; devolve `false` (o painel fica aberto) se ainda falta algo. O motivo diz-se
   * DENTRO do painel (alerta): o toast e a região live ficam fora do modal e o leitor de ecrã não os ouve enquanto ele está aberto.
   */
  const guardar = (rascunho: RascunhoLevantamento, visitas: VisitaNegocio[], comercial: string): boolean => {
    if (!painel) return false;
    // O estado de agora, não o de quando o painel abriu: a pessoa pode ter ficado perdida ou encerrada entretanto. Guardar não faria nada
    // e o aviso de sucesso seria falso.
    const atual = resumos.find((r) => r.pessoa.id === painel.pessoaId);
    if (!atual) return false;
    const passo: PassoProcesso = painel.tipo === "levantamento" ? "fazerLevantamento" : "marcarVisitaFeita";
    if (atual.pessoa.perdida || atual.pessoa.encerrada) {
      recusar(textoDoBloqueio(passo, ["pessoaPerdida"]));
      return false;
    }
    const portao = painel.tipo === "levantamento"
      ? portaoFazerLevantamento({
        linhas: rascunho.linhas, observacoes: rascunho.observacoes, temPorLigar: atual.registos.levantamentos.some((l) => l.negocioId === null),
      })
      : portaoLevantamento({ visitas, linhas: rascunho.linhas });
    if (!portao.ok) {
      recusar(textoDoBloqueio(passo, portao.emFalta));
      return false;
    }
    setMotivo(null);
    guardarRegistos(painel.pessoaId, { visitas, levantamento: rascunho, comercial });
    if (painel.tipo === "levantamento") ligarAoNegocio(painel, atual);
    else controlo.registar(MARCADA_FEITA(visitas) ? "visitaFeita" : "visitaGuardada", painel.pessoaId, undefined, idCartaoPessoa(painel.pessoaId));
    return true;
  };

  const aoDoNegocio = doPainel?.tipo === "levantamento";
  const nome = { name: doPainel?.nome ?? "" };
  const titulo = doPainel && t(aoDoNegocio ? "pessoasPagina.survey.title" : "pessoasPagina.process.visitSurvey.title", nome);
  const descricao = doPainel && (aoDoNegocio
    ? t("pessoasPagina.survey.description", { deal: doPainel.negocio?.nome ?? "" })
    : t("pessoasPagina.process.visitSurvey.description"));
  const dialogo = (
    <NovoNegocioDialogo
      pessoas={opcoesPessoa} modo="registos" semBotao aberto={painel !== null} abaInicial="visita"
      seccaoInicial={doPainel?.tipo === "visita" ? "visitas" : undefined} pessoaInicialId={painel?.pessoaId} valoresIniciais={painel?.valores}
      aoDevolverFoco={controlo.aoDevolverFoco} titulo={titulo ?? undefined} descricao={descricao ?? undefined}
      aoMudarAberto={(aberto) => { if (!aberto) { setPainel(null); setMotivo(null); } }}
      guardarLevantamento={{ texto: t(aoDoNegocio ? "pessoasPagina.survey.save" : "pessoasPagina.process.visitSurvey.save"), aoGuardar: guardar, motivo, tentativa }}
    />
  );
  return { abrir, dialogo };
}
