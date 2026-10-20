import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { resultadoEncerra } from "@/components/negocio-metas/registosTipos";
import { somarDias, type DadosChamada } from "@/components/pessoas/acoesPessoa";
import type { PedidoEncerrar } from "@/components/pessoas/acoesEncerrar";
import type { DadosResultadoVisita } from "@/components/pessoas/acoesVisitaPessoa";
import type { AcoesFicha, CapacidadesFicha } from "@/components/pessoas/PainelBase";
import { textoOuNull } from "./adaptarComum";
import { chamarNeg, ErroNeg, type NomeNeg } from "./chamarNeg";
import { CHAVE_ERRO_GENERICO } from "./errosNeg";
import type { FichaDb } from "./fichaTipos";
import { invalidarPessoas } from "./invalidarPessoas";
import { leadDaAbordagem } from "./leadDaAbordagem";
import { hojeLisboa, inicioDoDiaLisboa, instanteLisboa } from "./tempoLisboa";
import { useFontePessoas } from "./useFontePessoas";

/** neg_registar_nota e neg_adiar_contacto (M8) já estão aplicadas na base (confirmado a 20/10): liga a Nota e o Adiar na ficha. */
const FUNCOES_M8_APLICADAS = true;

/** O que a ficha real consegue fazer hoje. A visita (marcar e alterar) é do P6; o negócio (detalhe, perder, ganhar, ligar e criar) é do P3. */
export const CAPACIDADES_FICHA_REAL: CapacidadesFicha = {
  chamada: true, encerrar: true, adiar: FUNCOES_M8_APLICADAS, nota: FUNCOES_M8_APLICADAS, visita: false, negocios: true,
};

const CHAVE_CHAMADA_PARCIAL = "pessoasPagina.real.ficha.partialCall";
const CHAVE_VISITA_PARCIAL = "pessoasPagina.real.ficha.partialVisit";
export type AcoesFichaReal = AcoesFicha & { capacidades: CapacidadesFicha };

const generico = (): ErroNeg => new ErroNeg(null, null, CHAVE_ERRO_GENERICO);

/** O aviso de falha parcial, com a mensagem do código que falhou ao lado (só se o código é conhecido: nada de «genérico» a mais). */
function parcial(erro: unknown, chaveAviso: string): ErroNeg {
  const daBase = erro instanceof ErroNeg ? erro : null;
  return new ErroNeg(erro, daBase?.codigo ?? null, chaveAviso, daBase?.codigo ? daBase.chave : undefined);
}

/** Dados de uma chamada, como o formulário os dá (o dia de hoje sabe-o esta camada). */
type DadosChamadaForm = Omit<DadosChamada, "hoje">;

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

function paramsEncerrar(org: string, pessoaId: string, leadId: string | null, p: PedidoEncerrar): Record<string, unknown> {
  return {
    p_organization_id: org,
    p_entity_id: pessoaId,
    p_resultado: p.resultado,
    p_motivo: p.motivo ?? null,
    p_motivo_outro: p.motivo === "outro" ? textoOuNull(p.motivoOutro) : null,
    p_lead_id: leadId,
  };
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

  return useMemo(() => criarAcoes({ organizationId, pessoaId, client, ids, ficha: () => fichaRef.current }), [organizationId, pessoaId, client, ids]);
}

interface Contexto {
  organizationId: string | null;
  pessoaId: string;
  client: QueryClient;
  ids: Map<string, string>;
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
    if (d.passo === "marcarVisita") throw generico(); // Marcar visita é do P6.
    const proxima = proximaAcaoDoPasso(d, hojeLisboa());
    // O dia entra na assinatura: um pedido repetido no dia seguinte já não é «o mesmo» (o id de ontem não se reutiliza).
    const assinatura = `chamada:${id}:${hojeLisboa()}:${JSON.stringify([d.resultado, d.nota.trim(), d.passo, d.data ?? null, d.hora ?? null, d.motivo ?? null, d.motivoOutro ?? null])}`;
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

  async function registarResultadoVisita(visitaId: string, d: DadosResultadoVisita): Promise<void> {
    const o = org(c.pessoaId);
    const visita = c.ficha()?.visitas?.itens.find((v) => v.id === visitaId);
    if (!visita) throw generico();
    // A ordem é obrigatória: se neg_resultado_visita corresse primeiro encerraria com a nota fixa «Resultado da visita» e o motivo perdia-se.
    if (resultadoEncerra(d.resultado)) {
      await encerrarAbordagem(o, { resultado: d.resultado, motivo: d.motivo ?? "outro", motivoOutro: d.motivoOutro });
    }
    try {
      await chamarNeg("neg_resultado_visita", {
        p_visita_id: visitaId, p_resultado: d.resultado, p_feita: new Date(visita.inicio).getTime() <= Date.now(),
      });
    } catch (erro) {
      // Se o encerramento já ficou gravado, refaz o que se vê e avisa das duas coisas. Repetir é seguro: encerrar de novo o mesmo
      // resultado não faz mal (a função devolve mudou=false) e o passo seguinte volta a correr.
      if (!resultadoEncerra(d.resultado)) throw erro;
      invalidar();
      throw parcial(erro, CHAVE_VISITA_PARCIAL);
    }
    invalidar();
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

  // Alterar a visita é do P6: a capacidade `visita` está desligada e o botão não aparece.
  const alterarVisita = (): Promise<void> => Promise.reject(generico());

  return { registarChamada, adiar, encerrar, reativar, juntarNota, alterarVisita, registarResultadoVisita, capacidades: CAPACIDADES_FICHA_REAL };
}
