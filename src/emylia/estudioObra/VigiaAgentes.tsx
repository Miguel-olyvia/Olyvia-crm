// 25/11 (plano «Obra Viva», etapa 3a): os agentes vigiam todas as obras em curso, não só a que tem o Estúdio aberto. Enquanto alguém das
// Operações (negocios.obra.planear) tiver a Olyvia aberta, em qualquer ecrã, de 2 em 2 minutos: as propostas novas ficam vistas (o prazo
// do degrau 2 começa a contar aí) e as que chegaram ao prazo aplicam-se, pelas mesmas regras e pelas mesmas ações da fita (agentes.ts e
// A.agentesObra): tudo fica no histórico, em «Desde a última visita» e desfaz-se. Sem ninguém com a Olyvia aberta, nada corre: é a etapa
// 3b (o servidor). Com o separador escondido também não corre (o browser adormece os temporizadores e o trabalho fica para quem volta).
import { useEffect, useRef } from "react";
import type { Ctx } from "../pecas";
import { podeNeg } from "../permissoes";
import { lerInventario } from "../inventario/loja";
import { resumoEcNegocio } from "../inventario/ponteNegocios";
import { ocupacaoDosTecnicos } from "../preparacaoObra";
import { aAplicarAgora, agente, propostasDosAgentes } from "./agentes";
import { registarAgentesVoz } from "./agentesPorVoz";
import { supabase } from "@/integrations/supabase/client";
import { lerEstadoVivo } from "../estadoVivo";
import { gravarConhecimento, itensDoConhecimento } from "../conhecimentoOlyvia";

/** 26/11: de quanto em quanto tempo a página dos Negócios atualiza a base de conhecimento da Olyvia (o servidor faz de 15 em 15 min). */
// 27/11: de 30 em 30 min (era 10): com 30 obras, a base inteira leva ~2 s; o servidor vai pondo as obras em dia à vez
export const CONHECIMENTO_MS = 30 * 60_000;
let ultimoConhecimento = 0;
/** Grava a base de conhecimento a partir do que a página tem carregado (só quem planeia obras; falhas não incomodam ninguém). */
export async function atualizarConhecimento(ctx: Pick<Ctx, "S">, agora = Date.now()): Promise<boolean> {
  const v = lerEstadoVivo();
  if (!v?.org || !podeNeg(ctx.S.role, "obra.planear") || agora - ultimoConhecimento < CONHECIMENTO_MS) return false;
  ultimoConhecimento = agora;
  try { await gravarConhecimento(supabase, v.org, itensDoConhecimento(ctx.S as Parameters<typeof itensDoConhecimento>[0], new Date(agora), "pagina")); return true; }
  catch (e) { console.warn("base de conhecimento", e); return false; }
}

export const VIGIA_INTERVALO_MS = 120000;
/** 27/11: quantas obras vê cada volta da página, e a vez (roda pelas obras em curso e aprovadas). */
export const OBRAS_POR_VOLTA_PAGINA = 4;
let vezPagina = 0;
export function proximasObras(S: Pick<Ctx["S"], "deals">): Set<number> {
  const ativas = (S.deals ?? []).filter((d) => d.obra?.plano && !d.perdido && (d.obra.plano.estado === "em curso" || d.obra.plano.estado === "aprovado")).map((d) => d.id).sort((a, b) => a - b);
  if (ativas.length <= OBRAS_POR_VOLTA_PAGINA) return new Set(ativas);
  const ini = (vezPagina * OBRAS_POR_VOLTA_PAGINA) % ativas.length;
  vezPagina++;
  return new Set([...ativas, ...ativas].slice(ini, ini + OBRAS_POR_VOLTA_PAGINA));
}
export const VIGIA_PRIMEIRA_MS = 8000;

/** Uma volta dos agentes por todas as obras em curso ou aprovadas. Devolve quantas propostas se aplicaram. */
export function voltaDosAgentes(ctx: Pick<Ctx, "S" | "A" | "run">, agora = new Date(), so?: Set<number>): number {
  const { S, A, run } = ctx;
  if (!podeNeg(S.role, "obra.planear")) return 0;
  let db: ReturnType<typeof lerInventario> | null = null;
  try { db = lerInventario(); } catch { /* sem inventário */ }
  let aplicadas = 0;
  for (const d of S.deals ?? []) {
    const p = d.obra?.plano;
    if (!p || d.perdido || (p.estado !== "em curso" && p.estado !== "aprovado")) continue;
    if (so && !so.has(d.id)) continue;
    let L;
    try { L = propostasDosAgentes(d, S, ocupacaoDosTecnicos(S, d.id), db && d.obra.ec?.ref ? resumoEcNegocio(db, d.obra.ec.ref) : null); } catch { continue; }
    const v = d.obra.agentes?.vistos ?? {}, ids = L.map((x) => x.id);
    if (ids.some((x) => !v[x]) || Object.keys(v).some((x) => !ids.includes(x))) run(() => { A.agentesObra(d.id, { k: "vistos", ids }); });
    for (const x of aAplicarAgora(L, d.obra.agentes, agora)) {
      if (!x.auto) continue;
      let ok = false;
      run(() => { ok = A.agentesObra(d.id, { k: "aplicar", pid: x.id, agente: x.agente, nomeAgente: agente(x.agente).nome, texto: x.auto!.texto, acao: x.auto!.acao, auto: true }); });
      if (ok) aplicadas++;
    }
  }
  return aplicadas;
}

/** Montado uma vez na página dos Negócios: corre as voltas enquanto a página está à vista. Não desenha nada. */
export function VigiaAgentes({ ctx }: { ctx: Ctx }) {
  const atual = useRef(ctx);
  atual.current = ctx;
  // 26/11 (etapa 6): a voz (OlyviaComando) pergunta daqui o que os agentes veem e decide por quem fala
  useEffect(() => registarAgentesVoz(atual), []);
  const ativo = podeNeg(ctx.S.role, "obra.planear");
  useEffect(() => {
    if (!ativo) return;
    const volta = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      // 27/11 (Rúben: «sinto o estúdio lento»): com 30 obras, uma volta a todas bloqueava a página ~1 s de 2 em 2 min; agora vê
      // OBRAS_POR_VOLTA_PAGINA de cada vez, à vez (todas em ~15 min)
      try { voltaDosAgentes(atual.current, new Date(), proximasObras(atual.current.S)); } catch (e) { console.warn("agentes", e); }
      void atualizarConhecimento(atual.current);
    };
    const t0 = window.setTimeout(volta, VIGIA_PRIMEIRA_MS);
    const t = window.setInterval(volta, VIGIA_INTERVALO_MS);
    return () => { window.clearTimeout(t0); window.clearInterval(t); };
  }, [ativo]);
  return null;
}
