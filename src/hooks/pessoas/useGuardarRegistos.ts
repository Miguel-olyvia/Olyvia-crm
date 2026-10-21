// Gravar o painel «Visita e levantamento» da ficha real. Faz o plano (`planoGravacao`) e executa-o por ordem: as visitas (criar, alterar, concluir,
// cancelar) e só depois o levantamento, ligado ao id que a base deu à visita. A primeira falha pára. Se já havia coisas gravadas, o erro diz o que
// ficou e o que falhou (`ErroGuardarParcial`) e repetir só retoma o que falta: as visitas criadas ficam guardadas na sessão do hook, por isso não
// se criam duas vezes. Um pedido durante outro devolve o que já está em curso (duplo clique). Marcar uma visita NÃO grava nota nem conta como contacto.
import { useCallback, useMemo, useRef, useState } from "react";
import { useQuestionario } from "@/components/negocio-metas/QuestionarioContexto";
import type { VisitaNegocio } from "@/components/negocio-metas/negocioMetas";
import type { RascunhoLevantamento } from "@/components/negocio-metas/novoNegocio";
import type { VisitaPessoa } from "@/components/negocio-metas/registosTipos";
import { useTranslation } from "@/hooks/useTranslation";
import { adaptarRegistos } from "./adaptarRegistos";
import { ErroNeg } from "./chamarNeg";
import { CHAVE_ERRO_GENERICO } from "./errosNeg";
import { CHAVES_ENTRADA_VISITA } from "./errosVisita";
import type { FichaDb } from "./fichaTipos";
import {
  CHAVE_NAO_PRONTO, paramsGuardarLevantamento, useGuardarLevantamento, type EntradaGuardarLevantamento, type ResultadoGuardarLevantamento,
} from "./guardarLevantamento";
import { levantamentoLivreDaFicha } from "./livreDaFicha";
import { planoGravacao, type BaseVisita, type FaltaGravacao, type Passo, type PassoLevantamento } from "./planoGravacao";
import { hojeLisboa } from "./tempoLisboa";
import { useAcoesVisita } from "./useAcoesVisita";
import { useAgendaVisita } from "./useAgendaVisita";
import { useFontePessoas } from "./useFontePessoas";
import { minutosDaDuracao, type EntradaVisita } from "./visitaDb";

const R = "pessoasPagina.real.records.";
const CHAVE_PARCIAL = `${R}partial`;

/** A que parte da gravação se refere um aviso (a chave de tradução é `pessoasPagina.real.records.part.<parte>`). */
export type ParteGravacao = Passo["tipo"];

const CHAVE_DA_FALTA: Readonly<Record<FaltaGravacao, string>> = {
  dataEmFalta: `${R}err.dateMissing`,
  horaEmFalta: `${R}err.timeMissing`,
  feitaNoFuturo: `${R}err.doneInFuture`,
  quadroEmFalta: `${R}err.noAgenda`,
  recursoEmFalta: `${R}err.noAgenda`,
  horaInvalida: CHAVES_ENTRADA_VISITA.horaInvalida,
  duracaoInvalida: CHAVES_ENTRADA_VISITA.duracaoInvalida,
  visitaEmFalta: CHAVES_ENTRADA_VISITA.visitaEmFalta,
};

/** A gravação parou a meio: `feitos` ficaram na base e `falhou` não; a causa (o código e a mensagem dele) vem em `chaveExtra`. */
export class ErroGuardarParcial extends ErroNeg {
  readonly feitos: readonly ParteGravacao[];
  readonly falhou: ParteGravacao;

  constructor(causa: unknown, feitos: readonly ParteGravacao[], falhou: ParteGravacao) {
    const daBase = causa instanceof ErroNeg ? causa : null;
    super(daBase?.causa ?? causa, daBase?.codigo ?? null, CHAVE_PARCIAL, daBase?.codigo ? daBase.chave : undefined);
    this.name = "ErroGuardarParcial";
    this.feitos = feitos;
    this.falhou = falhou;
  }
}

export interface ResultadoGuardarRegistos {
  /** O que se gravou, por ordem (vazio se não havia nada a gravar). */
  feitos: ParteGravacao[];
  levantamento: ResultadoGuardarLevantamento | null;
}

export interface GuardarRegistosHook {
  /** Grava. Lança `ErroNeg` (o primeiro passo falhou, ou o pedido nem chegou à base) ou `ErroGuardarParcial` (já havia coisas gravadas). */
  guardar: (visitas: readonly VisitaNegocio[], rascunho: RascunhoLevantamento, comercial: string) => Promise<ResultadoGuardarRegistos>;
  /**
   * Faz o plano em seco, sem escrever nada: lança `ErroNeg` pelo que a gravação recusaria (dia ou hora em falta, quadro, perguntas por carregar,
   * respostas inválidas). Serve para o criar negócio dizer o erro ANTES de criar o negócio, em vez de o deixar criado e a meio.
   */
  verificar: (visitas: readonly VisitaNegocio[], rascunho: RascunhoLevantamento, comercial: string) => void;
  aGuardar: boolean;
  /** Pode gravar-se: a base é a fonte, há ficha e as perguntas do questionário carregaram. */
  pronto: boolean;
}

interface Sessao {
  /** As visitas que este painel criou, pelo id local: o id da base e como ficaram gravadas. */
  criadas: Map<string, BaseVisita>;
  /** O id do levantamento novo: o mesmo até gravar, para repetir depois de uma falha não criar outro. */
  idLevantamento: string | null;
}

const generico = (): ErroNeg => new ErroNeg(null, null, CHAVE_ERRO_GENERICO);

/** A visita do painel como a base a ficou a ter depois de a criar (por fazer: dá-se como feita num passo a seguir). */
function comoCriada(v: VisitaNegocio, idReal: string, e: EntradaVisita, pessoaId: string): BaseVisita {
  return {
    idReal,
    visita: {
      ...v, estado: "porFazer", pessoaId, negocioId: e.negocioId ?? null,
      agenda: { boardId: e.boardId, recursos: e.recursos.map((id) => ({ id, nome: "" })), duracaoMinutos: e.duracaoMinutos ?? minutosDaDuracao(e.duracao) },
    },
  };
}

interface Contexto {
  organizationId: string;
  ficha: FichaDb;
  sessao: Sessao;
  acoes: ReturnType<typeof useAcoesVisita>;
  levantamento: ReturnType<typeof useGuardarLevantamento>;
  visitas: readonly VisitaNegocio[];
}

/** Corre um passo. `reais` leva o id da base de cada visita do painel (as que já existiam e as que este plano vai criando). */
async function correr(p: Passo, c: Contexto, reais: Map<string, string>): Promise<ResultadoGuardarLevantamento | null> {
  const pessoaId = c.ficha.pessoa.id;
  const doPainel = c.visitas.find((v) => v.id === ("id" in p ? p.id : ""));
  const criada = "id" in p ? c.sessao.criadas.get(p.id) : undefined;
  const guardarEstado = (estado: VisitaPessoa["estado"], parcial: Partial<VisitaPessoa> = {}): void => {
    if (criada && "id" in p) c.sessao.criadas.set(p.id, { ...criada, visita: { ...criada.visita, ...parcial, estado } });
  };
  switch (p.tipo) {
    case "criarVisita": {
      const r = await c.acoes.marcar(p.entrada);
      if (!r.visitaId || !doPainel) throw generico();
      reais.set(p.id, r.visitaId);
      c.sessao.criadas.set(p.id, comoCriada(doPainel, r.visitaId, p.entrada, pessoaId));
      return null;
    }
    case "alterarVisita":
      await c.acoes.alterar(p.idReal, p.entrada, p.recursosAtuais);
      if (doPainel) guardarEstado("porFazer", { ...doPainel, estado: "porFazer", pessoaId });
      return null;
    case "concluirVisita": {
      const id = p.idReal ?? reais.get(p.id);
      if (!id) throw generico();
      await c.acoes.concluir(id);
      guardarEstado("feita");
      return null;
    }
    case "cancelarVisita":
      await c.acoes.cancelar(p.idReal);
      guardarEstado("cancelada");
      return null;
    case "levantamento":
      return gravarLevantamento(p, c, reais);
  }
}

function gravarLevantamento(p: PassoLevantamento, c: Contexto, reais: Map<string, string>): Promise<ResultadoGuardarLevantamento> {
  const visitaId = p.visitaPainelId ? reais.get(p.visitaPainelId) : undefined;
  // Ligar a uma visita cujo id se não conhece gravaria o levantamento sem ligação: pára-se em vez disso.
  if (p.visitaPainelId && !visitaId) return Promise.reject(generico());
  return c.levantamento.guardar(paraEntrada(p, c.organizationId, c.ficha.pessoa.id, visitaId));
}

function paraEntrada(p: PassoLevantamento, organizationId: string, pessoaId: string, visitaId: string | undefined): EntradaGuardarLevantamento {
  return {
    id: p.levantamentoId, organizationId, entityId: pessoaId, negocioId: p.negocioId,
    dados: { ...p.dados, ...(visitaId ? { visita_id: visitaId } : {}) }, linhas: p.linhas, respostas: p.respostas,
  };
}

/**
 * `negocioId`: as visitas novas e o levantamento ficam ligados a ele. `ignorarLevantamentoLivre`: o levantamento que a pessoa já tem sem negócio
 * não se reescreve nem se liga (criar negócio: o levantamento que se grava é sempre um novo).
 */
export interface OpcoesGuardarRegistos {
  negocioId?: string | null;
  ignorarLevantamentoLivre?: boolean;
}

export function useGuardarRegistos(ficha: FichaDb | null, opcoes: OpcoesGuardarRegistos = {}): GuardarRegistosHook {
  const fonte = useFontePessoas();
  const organizationId = fonte.modo === "real" ? fonte.organizationId : null;
  const pessoaId = ficha?.pessoa.id ?? null;
  const acoes = useAcoesVisita(pessoaId ?? "", ficha);
  const levantamento = useGuardarLevantamento();
  const { omissao } = useAgendaVisita(ficha?.pessoa.responsavel_id ?? null);
  const { questionario } = useQuestionario();
  const { t } = useTranslation();
  const [aGuardar, setAGuardar] = useState(false);
  // O estado só muda no render seguinte: a referência é o que impede dois pedidos num duplo clique.
  const emCurso = useRef<Promise<ResultadoGuardarRegistos> | null>(null);
  // Trocar de pessoa esquece o que a sessão anterior criou.
  const sessao = useMemo<Sessao>(() => ({ criadas: new Map(), idLevantamento: null }), [pessoaId]);
  const negocioId = opcoes.negocioId ?? null;
  const ignorarLivre = opcoes.ignorarLevantamentoLivre === true;

  /** O plano de agora; lança o que a gravação recusaria antes de escrever (sem escrever nada). */
  const planear = useCallback((visitas: readonly VisitaNegocio[], rascunho: RascunhoLevantamento, comercial: string) => {
    if (!organizationId || !ficha) throw generico();
    const base = new Map<string, BaseVisita>(adaptarRegistos(ficha).visitas.map((v) => [v.id, { idReal: v.id, visita: v }]));
    sessao.criadas.forEach((b, id) => base.set(id, b));
    const plano = planoGravacao({
      organizationId, pessoaId: ficha.pessoa.id, nome: ficha.pessoa.nome ?? "", visitas, base, sessao: new Set(sessao.criadas.keys()), omissao,
      tituloDoTipo: (tipo) => (tipo ? t(`pessoasPagina.real.visit.kind.${tipo}`) : ""), agora: Date.now(), hoje: hojeLisboa(), comercial, negocioId,
      rascunho, levantamentoLivre: ignorarLivre ? null : levantamentoLivreDaFicha(ficha), novoIdLevantamento: () => (sessao.idLevantamento ??= crypto.randomUUID()),
    });
    if (!plano.ok) throw new ErroNeg(null, null, CHAVE_DA_FALTA[plano.falta]);
    const comLevantamento = plano.passos.find((p): p is PassoLevantamento => p.tipo === "levantamento");
    if (comLevantamento) {
      // O que impediria o levantamento de gravar diz-se ANTES de escrever as visitas: uma gravação a meio por uma razão que já se sabia é evitável.
      if (!levantamento.pronto) throw new ErroNeg(null, null, CHAVE_NAO_PRONTO);
      paramsGuardarLevantamento(paraEntrada(comLevantamento, organizationId, ficha.pessoa.id, undefined), questionario);
    }
    return { plano, base, organizationId, ficha };
  }, [organizationId, ficha, sessao, omissao, questionario, t, negocioId, ignorarLivre, levantamento.pronto]);

  const verificar = useCallback((visitas: readonly VisitaNegocio[], rascunho: RascunhoLevantamento, comercial: string): void => {
    planear(visitas, rascunho, comercial);
  }, [planear]);

  const executar = useCallback(async (visitas: readonly VisitaNegocio[], rascunho: RascunhoLevantamento, comercial: string): Promise<ResultadoGuardarRegistos> => {
    const { plano, base, organizationId: org, ficha: fichaDaPessoa } = planear(visitas, rascunho, comercial);
    const contexto: Contexto = { organizationId: org, ficha: fichaDaPessoa, sessao, acoes, levantamento, visitas };
    const reais = new Map<string, string>([...base].map(([id, b]) => [id, b.idReal]));
    const feitos: ParteGravacao[] = [];
    let gravado: ResultadoGuardarLevantamento | null = null;
    for (const passo of plano.passos) {
      try {
        gravado = (await correr(passo, contexto, reais)) ?? gravado;
      } catch (erro) {
        throw feitos.length > 0 ? new ErroGuardarParcial(erro, feitos, passo.tipo) : erro;
      }
      feitos.push(passo.tipo);
      if (passo.tipo === "levantamento") sessao.idLevantamento = null;
    }
    return { feitos, levantamento: gravado };
  }, [planear, sessao, acoes, levantamento]);

  const guardar = useCallback((visitas: readonly VisitaNegocio[], rascunho: RascunhoLevantamento, comercial: string): Promise<ResultadoGuardarRegistos> => {
    if (emCurso.current) return emCurso.current;
    setAGuardar(true);
    const voo = executar(visitas, rascunho, comercial).finally(() => {
      emCurso.current = null;
      setAGuardar(false);
    });
    emCurso.current = voo;
    return voo;
  }, [executar]);

  return { guardar, verificar, aGuardar, pronto: organizationId !== null && ficha !== null && levantamento.pronto };
}
