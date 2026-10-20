import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { resultadoEncerra, type ResultadoVisita } from "@/components/negocio-metas/registosTipos";
import type { MotivoEncerramento, ResultadoEncerramento } from "@/components/pessoas/pessoasTipos";
import { chamarNeg, ErroNeg } from "./chamarNeg";
import { CHAVE_ERRO_GENERICO } from "./errosNeg";
import { CHAVES_ENTRADA_VISITA, chaveErroVisita, traduzirErroVisita, type DialogoVisita, type OpcoesErroVisita } from "./errosVisita";
import type { FichaDb } from "./fichaTipos";
import { invalidarPessoas } from "./invalidarPessoas";
import { leadDaAbordagem } from "./leadDaAbordagem";
import { paramsEncerrar } from "./paramsEncerrar";
import { agendaVisitaQueryKey } from "./useAgendaVisita";
import { useFontePessoas } from "./useFontePessoas";
import { paraAlterarVisita, paraGuardarVisita, type EntradaVisita, type ErroEntradaVisita } from "./visitaDb";

const CHAVE_VISITA_PARCIAL = "pessoasPagina.real.ficha.partialVisit";

export interface ResultadoMarcar {
  visitaId: string | null;
  mudou: boolean;
}

export interface ResultadoAlterar {
  mudou: boolean;
  recursosMudaram: boolean;
  /** Trocar os recursos de uma visita futura mudou o responsável da lead. */
  donoAlterado: boolean;
  /** O `anew_users.id` do novo responsável. */
  novoDono: string | null;
  /** As outras visitas futuras que passaram para ele. */
  outrasVisitas: string[];
  /** Mudar as horas de uma visita confirmada deixou-a por confirmar. */
  desconfirmada: boolean;
}

export interface ResultadoCancelar {
  /** `false` se a visita já estava cancelada (sucesso silencioso). */
  mudou: boolean;
}

/** O que se guarda do resultado de uma visita; `resultado: null` só dá a visita como feita. */
export interface DadosResultado {
  resultado: ResultadoVisita | null;
  motivo?: MotivoEncerramento;
  motivoOutro?: string;
}

/**
 * As ações da visita ligadas às funções neg_*. Cada uma lança um ErroNeg já lido para o seu diálogo, invalida a ficha e as listas depois
 * de escrever e, ao repetir o mesmo pedido enquanto o primeiro corre (duplo clique), devolve a mesma resposta em vez de ir outra vez à
 * base (que não é idempotente por id: duas marcações dariam duas visitas). Marcar uma visita NÃO conta como contacto.
 */
export interface AcoesVisita {
  marcar: (entrada: EntradaVisita) => Promise<ResultadoMarcar>;
  /**
   * Reenvia todos os campos; `recursosAtuais` (os da ficha) evita revalidar os recursos quando não mudaram. O chamador tem de os passar SEMPRE
   * que a visita os tem: sem eles `p_recursos` vai sempre preenchido, a base revalida-os e pode mudar o responsável da lead (ou dar 42501)
   * sem o utilizador ter mexido nos recursos.
   */
  alterar: (visitaId: string, entrada: EntradaVisita, recursosAtuais?: readonly string[]) => Promise<ResultadoAlterar>;
  cancelar: (visitaId: string) => Promise<ResultadoCancelar>;
  resultado: (visitaId: string, dados: DadosResultado) => Promise<void>;
}

const generico = (): ErroNeg => new ErroNeg(null, null, CHAVE_ERRO_GENERICO);
const entradaInvalida = (erro: ErroEntradaVisita | "visitaNaoCarregada"): ErroNeg => new ErroNeg(null, null, CHAVES_ENTRADA_VISITA[erro]);

const texto = (v: unknown): string | null => (typeof v === "string" ? v : null);
const listaDeTextos = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export function useAcoesVisita(pessoaId: string, ficha: FichaDb | null): AcoesVisita {
  const fonte = useFontePessoas();
  const client = useQueryClient();
  const organizationId = fonte.modo === "real" ? fonte.organizationId : null;
  // A ficha mais recente sem refazer as ações a cada leitura (atualiza-se depois de cada render, nunca durante).
  const fichaRef = useRef(ficha);
  useEffect(() => {
    fichaRef.current = ficha;
  });
  const [emCurso] = useState(() => new Map<string, Promise<unknown>>());
  return useMemo(
    () => criarAcoes({ organizationId, pessoaId, client, emCurso, ficha: () => fichaRef.current }),
    [organizationId, pessoaId, client, emCurso],
  );
}

interface Contexto {
  organizationId: string | null;
  pessoaId: string;
  client: QueryClient;
  emCurso: Map<string, Promise<unknown>>;
  ficha: () => FichaDb | null;
}

function criarAcoes(c: Contexto): AcoesVisita {
  const org = (): string => {
    if (!c.organizationId) throw generico();
    return c.organizationId;
  };
  const invalidar = (): void => { void invalidarPessoas(c.client, c.organizationId, c.pessoaId); };

  /**
   * Um pedido igual a um que ainda corre não vai outra vez à base: partilha a resposta (ou o erro). A pessoa conta na assinatura: o mapa vive
   * mais do que a troca de pessoa, e uma resposta de uma ação iniciada por outra pessoa não pode chegar ao diálogo novo.
   * Isto vale só dentro desta instância do hook: cada diálogo tem a sua (e o seu `useExecutarAcao` com `ocupado`), e é essa a proteção real do
   * duplo clique entre ecrãs; a de `partilhar` cobre o duplo clique no mesmo diálogo.
   */
  function partilhar<T>(assinatura: string, correr: () => Promise<T>): Promise<T> {
    const chave = `${c.pessoaId}|${assinatura}`;
    const existente = c.emCurso.get(chave);
    if (existente) return existente as Promise<T>;
    const promessa = correr().finally(() => { c.emCurso.delete(chave); });
    c.emCurso.set(chave, promessa);
    return promessa;
  }

  /** O erro lido para o diálogo; um NG008 ao marcar ou alterar quer dizer que a agenda mudou: refaz os quadros e os recursos. */
  function falha(erro: unknown, dialogo: DialogoVisita, opcoes?: OpcoesErroVisita): ErroNeg {
    const traduzido = traduzirErroVisita(erro, dialogo, opcoes);
    if (traduzido.codigo === "NG008" && (dialogo === "marcar" || dialogo === "alterar")) {
      void c.client.invalidateQueries({ queryKey: agendaVisitaQueryKey(c.organizationId) });
    }
    return traduzido;
  }

  async function marcar(entrada: EntradaVisita): Promise<ResultadoMarcar> {
    const pedido = paraGuardarVisita(org(), c.pessoaId, entrada);
    if (!pedido.ok) throw entradaInvalida(pedido.erro);
    return partilhar(`marcar:${JSON.stringify(pedido.params)}`, async () => {
      let resposta: { visita_id?: unknown; mudou?: unknown } | null;
      try {
        resposta = await chamarNeg("neg_guardar_visita", pedido.params);
      } catch (erro) {
        throw falha(erro, "marcar");
      }
      invalidar();
      return { visitaId: texto(resposta?.visita_id), mudou: resposta?.mudou === true };
    });
  }

  async function alterar(visitaId: string, entrada: EntradaVisita, recursosAtuais?: readonly string[]): Promise<ResultadoAlterar> {
    org();
    const pedido = paraAlterarVisita(visitaId, entrada, recursosAtuais);
    if (!pedido.ok) throw entradaInvalida(pedido.erro);
    return partilhar(`alterar:${JSON.stringify(pedido.params)}`, async () => {
      let r: Record<string, unknown> | null;
      try {
        r = await chamarNeg("neg_alterar_visita", pedido.params);
      } catch (erro) {
        // O 42501 só quer dizer «mudaria o responsável» se o pedido trocou os recursos (p_recursos preenchido).
        throw falha(erro, "alterar", { trocouRecursos: pedido.params.p_recursos !== null });
      }
      invalidar();
      return {
        mudou: r?.mudou === true,
        recursosMudaram: r?.recursos_mudaram === true,
        donoAlterado: r?.dono_alterado === true,
        novoDono: texto(r?.novo_dono),
        outrasVisitas: listaDeTextos(r?.outras_visitas),
        desconfirmada: r?.desconfirmada === true,
      };
    });
  }

  async function cancelar(visitaId: string): Promise<ResultadoCancelar> {
    org();
    if (!visitaId) throw entradaInvalida("visitaEmFalta");
    return partilhar(`cancelar:${visitaId}`, async () => {
      let r: { mudou?: unknown } | null;
      try {
        r = await chamarNeg("neg_cancelar_visita", { p_visita_id: visitaId });
      } catch (erro) {
        throw falha(erro, "cancelar");
      }
      invalidar();
      return { mudou: r?.mudou === true };
    });
  }

  async function resultado(visitaId: string, dados: DadosResultado): Promise<void> {
    const o = org();
    const visita = c.ficha()?.visitas?.itens.find((v) => v.id === visitaId);
    // Sem a ficha (a recarregar) ou com a ficha de outra pessoa a visita não aparece: pede para recarregar em vez do erro genérico, que parece rede.
    if (!visita) throw entradaInvalida("visitaNaoCarregada");
    // Sem resultado só se dá a visita como feita (a base recusa se ainda é futura); com resultado, feita se já começou.
    const feita = dados.resultado === null || Date.parse(visita.inicio) <= Date.now();
    const encerra = dados.resultado !== null && resultadoEncerra(dados.resultado);
    return partilhar(`resultado:${visitaId}:${JSON.stringify(dados)}`, async () => {
      // A ordem é obrigatória: se neg_resultado_visita corresse primeiro encerraria com a nota fixa «Resultado da visita» e o motivo perdia-se.
      if (encerra) {
        const ficha = c.ficha();
        const leadId = ficha ? leadDaAbordagem(ficha)?.id ?? null : null;
        try {
          await chamarNeg("neg_encerrar_abordagem", paramsEncerrar(o, c.pessoaId, leadId, {
            resultado: dados.resultado as ResultadoEncerramento, motivo: dados.motivo ?? "outro", motivoOutro: dados.motivoOutro,
          }));
        } catch (erro) {
          // Lido para o diálogo do resultado (NG018 visita cancelada, NG004, NG009); o que não tem leitura própria, como o NG011, fica com a geral.
          // Nada se escreveu: pára aqui, sem invalidar.
          throw falha(erro, "resultado");
        }
      }
      try {
        await chamarNeg("neg_resultado_visita", { p_visita_id: visitaId, p_resultado: dados.resultado, p_feita: feita });
      } catch (erro) {
        if (!encerra) throw falha(erro, "resultado");
        // O encerramento já ficou gravado: refaz o que se vê e avisa das duas coisas. Repetir é seguro (encerrar de novo devolve mudou=false).
        invalidar();
        const daBase = erro instanceof ErroNeg ? erro : null;
        throw new ErroNeg(erro, daBase?.codigo ?? null, CHAVE_VISITA_PARCIAL, daBase?.codigo ? chaveErroVisita(daBase, "resultado") : undefined);
      }
      invalidar();
    });
  }

  return { marcar, alterar, cancelar, resultado };
}
