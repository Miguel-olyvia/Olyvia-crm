import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { somarDias, type DadosChamada } from "@/components/pessoas/acoesPessoa";
import { entradaDaVisita } from "@/components/pessoas/agendaVisitaForm";
import { moradaDaLead } from "@/components/pessoas/moradaVisita";
import type { PedidoEncerrar } from "@/components/pessoas/acoesEncerrar";
import type { DadosResultadoVisita } from "@/components/pessoas/acoesVisitaPessoa";
import type { AcoesFicha, CapacidadesFicha } from "@/components/pessoas/PainelBase";
import type { DadosAlterarVisita } from "@/components/pessoas/visitaPessoa";
import { textoOuNull } from "./adaptarComum";
import { adaptarPessoa } from "./adaptarFichaPessoa";
import { adaptarRegistos } from "./adaptarRegistos";
import { chamarNeg, ErroNeg, type NomeNeg } from "./chamarNeg";
import { CHAVE_ERRO_GENERICO } from "./errosNeg";
import { CHAVES_ENTRADA_VISITA } from "./errosVisita";
import type { FichaDb } from "./fichaTipos";
import { invalidarPessoas } from "./invalidarPessoas";
import { leadDaAbordagem } from "./leadDaAbordagem";
import { paramsEncerrar } from "./paramsEncerrar";
import { hojeLisboa, inicioDoDiaLisboa, instanteLisboa } from "./tempoLisboa";
import { useAcoesVisita, type AcoesVisita } from "./useAcoesVisita";
import { useFontePessoas } from "./useFontePessoas";
import { paraGuardarVisita, type EntradaVisita } from "./visitaDb";

/** neg_registar_nota e neg_adiar_contacto (M8) já estão aplicadas na base (confirmado a 20/10): liga a Nota e o Adiar na ficha. */
const FUNCOES_M8_APLICADAS = true;

/**
 * O que a ficha real consegue fazer hoje. Alterar e cancelar as visitas já marcadas (`gerirVisitas`) grava na base pelos diálogos; marcar uma visita
 * pela chamada (`visita`) grava por `useAcoesVisita`. O painel «Visita e levantamento» (o levantamento é do P5) ainda não grava na base: o
 * `ProcessoProviderReal` não o abre e o menu «Mais» não o mostra. O negócio (detalhe, perder, ganhar, ligar e criar) é do P3.
 */
export const CAPACIDADES_FICHA_REAL: CapacidadesFicha = {
  chamada: true, encerrar: true, adiar: FUNCOES_M8_APLICADAS, nota: FUNCOES_M8_APLICADAS, visita: true, negocios: true, gerirVisitas: true,
};

const CHAVE_CHAMADA_PARCIAL = "pessoasPagina.real.ficha.partialCall";
const CHAVE_CHAMADA_VISITA_PARCIAL = "pessoasPagina.real.ficha.partialCallVisit";
export type AcoesFichaReal = AcoesFicha & { capacidades: CapacidadesFicha };

const generico = (): ErroNeg => new ErroNeg(null, null, CHAVE_ERRO_GENERICO);

/** O aviso de falha parcial, com a mensagem do código que falhou ao lado (só se o código é conhecido: nada de «genérico» a mais). */
function parcial(erro: unknown, chaveAviso: string): ErroNeg {
  const daBase = erro instanceof ErroNeg ? erro : null;
  return new ErroNeg(erro, daBase?.codigo ?? null, chaveAviso, daBase?.codigo ? daBase.chave : undefined);
}

/** Dados de uma chamada, como o formulário os dá (o dia de hoje sabe-o esta camada). */
type DadosChamadaForm = Omit<DadosChamada, "hoje">;

/**
 * A visita que o passo «marcar visita» pede. Sem a agenda, ou com uma que a base não aceitaria (sem quadro, recursos ou hora), recusa-se ANTES de
 * gravar o contacto: a chamada não fica a meio por um erro que o formulário já podia ter apanhado.
 */
function visitaDoPasso(organizationId: string, pessoaId: string, d: DadosChamadaForm): EntradaVisita {
  if (!d.visita) throw generico();
  const pedido = paraGuardarVisita(organizationId, pessoaId, d.visita);
  if (!pedido.ok) throw new ErroNeg(null, null, CHAVES_ENTRADA_VISITA[pedido.erro]);
  return d.visita;
}

/** O instante (ISO) da próxima ação que o passo deixa: o escolhido, amanhã ou hoje em Lisboa; `null` sem próxima ação. */
function proximaAcaoDoPasso(d: DadosChamadaForm, hoje: string): string | null {
  if (d.passo === "ligarData") {
    const instante = instanteLisboa(d.data ?? "", d.hora ?? "");
    if (!instante) throw generico();
    return instante;
  }
  if (d.passo === "ligarAmanha") return inicioDoDiaLisboa(somarDias(hoje, 1));
  if (d.passo === "ligarHoje") return inicioDoDiaLisboa(hoje);
  return null;
}

/**
 * As ações da ficha real, ligadas às funções neg_*. Cada ação lança ErroNeg se falhar (a ficha traduz-lhe a chave) e, depois de
 * escrever (por inteiro ou em parte), invalida a ficha e as listas. O `p_id` de uma escrita idempotente vem de `crypto.randomUUID()`,
 * guardado por assinatura dos dados: repetir o mesmo pedido depois de uma falha reutiliza o id; só se esquece depois de um sucesso.
 */
export function useAcoesFichaReal(pessoaId: string, ficha: FichaDb | null): AcoesFichaReal {
  const fonte = useFontePessoas();
  const client = useQueryClient();
  const organizationId = fonte.modo === "real" ? fonte.organizationId : null;
  // A ficha mais recente sem refazer as ações a cada leitura (atualiza-se depois de cada render, nunca durante).
  const fichaRef = useRef(ficha);
  useEffect(() => {
    fichaRef.current = ficha;
  });
  // Um só mapa para toda a vida do hook (um `useRef(new Map())` criava um Map novo, deitado fora, a cada render).
  const [ids] = useState(() => new Map<string, string>());
  // O resultado e o cancelamento das visitas vivem em `useAcoesVisita` (erros lidos por diálogo, duplo clique, encerrar antes do resultado).
  const visita = useAcoesVisita(pessoaId, ficha);
  // O `anew_users.id` do responsável: o recurso dele é o escolhido por omissão ao marcar a visita da chamada.
  const responsavelUserId = ficha?.pessoa.responsavel_id ?? null;

  return useMemo(
    () => ({ ...criarAcoes({ organizationId, pessoaId, client, ids, visita, ficha: () => fichaRef.current }), responsavelUserId }),
    [organizationId, pessoaId, client, ids, visita, responsavelUserId],
  );
}

interface Contexto {
  organizationId: string | null;
  pessoaId: string;
  client: QueryClient;
  ids: Map<string, string>;
  visita: AcoesVisita;
  ficha: () => FichaDb | null;
}

function criarAcoes(c: Contexto): AcoesFichaReal {
  const org = (id?: string): string => {
    if (!c.organizationId || (id !== undefined && id !== c.pessoaId)) throw generico();
    return c.organizationId;
  };
  // A lead da abordagem (a que tem o encerramento, ou a aberta mais recente): a lead mais recente da ficha pode estar morta.
  const leadId = (): string | null => {
    const ficha = c.ficha();
    return ficha ? leadDaAbordagem(ficha)?.id ?? null : null;
  };
  const idEstavel = (assinatura: string): string => {
    const existente = c.ids.get(assinatura);
    if (existente) return existente;
    const novo = crypto.randomUUID();
    c.ids.set(assinatura, novo);
    return novo;
  };
  const invalidar = (): void => { void invalidarPessoas(c.client, c.organizationId, c.pessoaId); };
  const encerrarAbordagem = (o: string, p: PedidoEncerrar) => chamarNeg("neg_encerrar_abordagem", paramsEncerrar(o, c.pessoaId, leadId(), p));
  /** Uma escrita idempotente por `p_id`: o id fica guardado até haver sucesso. */
  async function escreverComId(nome: NomeNeg, assinatura: string, params: (pId: string) => Record<string, unknown>): Promise<void> {
    await chamarNeg(nome, params(idEstavel(assinatura)));
    c.ids.delete(assinatura);
    invalidar();
  }

  async function registarChamada(id: string, d: DadosChamadaForm): Promise<void> {
    const o = org(id);
    const visitaAMarcar = d.passo === "marcarVisita" ? visitaDoPasso(o, id, d) : null;
    const proxima = proximaAcaoDoPasso(d, hojeLisboa());
    // O dia entra na assinatura: um pedido repetido no dia seguinte já não é «o mesmo» (o id de ontem não se reutiliza).
    // A data e a hora só entram quando decidem a próxima ação («ligar numa data»): no passo «marcar visita» são as da visita, e mudá-las ao repetir
    // depois de uma falha (a hora estava ocupada) não pode dar outro id, senão o contacto gravava-se duas vezes.
    const quando = d.passo === "ligarData" ? [d.data ?? null, d.hora ?? null] : [null, null];
    const assinatura = `chamada:${id}:${hojeLisboa()}:${JSON.stringify([d.resultado, d.nota.trim(), d.passo, ...quando, d.motivo ?? null, d.motivoOutro ?? null])}`;
    const pId = idEstavel(assinatura);
    await chamarNeg("neg_registar_contacto", {
      p_id: pId, p_organization_id: o, p_entity_id: id, p_resultado: d.resultado, p_nota: textoOuNull(d.nota),
      p_quando: new Date().toISOString(), p_proxima_acao_em: proxima, p_negocio_id: null,
    });
    if (d.passo === "perder") {
      try {
        await encerrarAbordagem(o, { resultado: "semInteresse", motivo: d.motivo ?? "outro", motivoOutro: d.motivoOutro });
      } catch (erro) {
        // O contacto já ficou gravado: refaz o que se vê e avisa das duas coisas. O id fica guardado: repetir não duplica o contacto.
        invalidar();
        throw parcial(erro, CHAVE_CHAMADA_PARCIAL);
      }
    }
    if (visitaAMarcar) {
      // O contacto é a chamada e já ficou gravado; a visita é à parte (marcá-la NÃO conta como contacto e não leva a nota da chamada).
      try {
        await c.visita.marcar(visitaAMarcar);
      } catch (erro) {
        // Repetir é seguro: o id do contacto fica guardado (não se duplica) e a visita, que falhou, volta a pedir-se.
        invalidar();
        throw parcial(erro, CHAVE_CHAMADA_VISITA_PARCIAL);
      }
    }
    c.ids.delete(assinatura);
    invalidar();
  }

  async function encerrar(id: string, p: PedidoEncerrar): Promise<void> {
    await encerrarAbordagem(org(id), p);
    invalidar();
  }

  async function reativar(id: string): Promise<void> {
    await chamarNeg("neg_reabrir_abordagem", { p_organization_id: org(id), p_entity_id: id, p_motivo: null, p_lead_id: leadId() });
    invalidar();
  }

  /** O resultado da visita: encerrar a abordagem antes (se for o caso), depois o resultado; a falha parcial e os erros por diálogo vêm de `useAcoesVisita`. */
  async function registarResultadoVisita(visitaId: string, d: DadosResultadoVisita): Promise<void> {
    org(c.pessoaId);
    await c.visita.resultado(visitaId, d);
  }

  async function cancelarVisita(visitaId: string): Promise<void> {
    org(c.pessoaId);
    await c.visita.cancelar(visitaId);
  }

  const juntarNota = async (id: string, texto: string): Promise<void> => {
    const o = org(id);
    const limpo = texto.trim();
    await escreverComId("neg_registar_nota", `nota:${id}:${hojeLisboa()}:${limpo}`, (pId) => ({ p_id: pId, p_organization_id: o, p_entity_id: id, p_texto: limpo }));
  };

  const adiar = async (id: string, dias: 1 | 3 | 7): Promise<void> => {
    const o = org(id);
    const proxima = inicioDoDiaLisboa(somarDias(hojeLisboa(), dias));
    await escreverComId("neg_adiar_contacto", `adiar:${id}:${hojeLisboa()}:${dias}`, (pId) => ({
      p_id: pId, p_organization_id: o, p_entity_id: id, p_proxima_acao_em: proxima,
    }));
  };

  /**
   * Muda o dia, a hora e a morada de uma visita da ficha. Reenvia TODOS os outros campos como a ficha os lê (quadro, quem vai, duração, tipo, quem vai
   * estar e a nota): um campo omitido apagar-se-ia na base. Sem quadro ou sem recursos lidos não há com que reenviar e recusa-se em vez de apagar.
   * O título vai NULL de propósito: em `neg_alterar_visita` um título NULL MANTÉM o atual (só as notas, o local, o tipo e os detalhes se limpam
   * com NULL). A nota que segue é a de acesso do destino (`destino.notaAcesso`, que o diálogo preenche com a nota da visita): esvaziá-la limpa-a.
   * O diálogo da ficha real (`AlterarVisitaReal`) faz o mesmo com mais campos, por `useAcoesVisita`.
   */
  async function alterarVisita(visitaId: string, dados: DadosAlterarVisita): Promise<void> {
    org(c.pessoaId);
    const ficha = c.ficha();
    const visita = ficha ? adaptarRegistos(ficha).visitas.find((v) => v.id === visitaId) : undefined;
    const recursos = visita?.agenda?.recursos.map((r) => r.id) ?? [];
    if (!ficha || !visita?.agenda?.boardId || recursos.length === 0) throw generico();
    const minutos = visita.agenda.duracaoMinutos;
    const entrada = entradaDaVisita({
      agenda: {
        boardId: visita.agenda.boardId, recursos, data: dados.data, hora: dados.hora, duracao: visita.duracao,
        ...(minutos !== null ? { duracaoMinutos: minutos } : {}),
      },
      nome: "", tipo: visita.tipo, tituloTipo: "", destino: dados.destino, moradaLead: moradaDaLead(adaptarPessoa(ficha, hojeLisboa())), nota: "",
      quemVaiEstar: visita.quemVaiEstar,
    });
    await c.visita.alterar(visitaId, entrada, recursos);
  }

  return { registarChamada, adiar, encerrar, reativar, juntarNota, alterarVisita, cancelarVisita, registarResultadoVisita, capacidades: CAPACIDADES_FICHA_REAL };
}
