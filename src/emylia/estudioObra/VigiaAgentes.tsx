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
export const CONHECIMENTO_MS = 10 * 60_000;
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
export const VIGIA_PRIMEIRA_MS = 8000;

/** Uma volta dos agentes por todas as obras em curso ou aprovadas. Devolve quantas propostas se aplicaram. */
export function voltaDosAgentes(ctx: Pick<Ctx, "S" | "A" | "run">, agora = new Date()): number {
  const { S, A, run } = ctx;
  if (!podeNeg(S.role, "obra.planear")) return 0;
  let db: ReturnType<typeof lerInventario> | null = null;
  try { db = lerInventario(); } catch { /* sem inventário */ }
  let aplicadas = 0;
  for (const d of S.deals ?? []) {
    const p = d.obra?.plano;
    if (!p || d.perdido || (p.estado !== "em curso" && p.estado !== "aprovado")) continue;
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
      try { voltaDosAgentes(atual.current); } catch (e) { console.warn("agentes", e); }
      void atualizarConhecimento(atual.current);
    };
    const t0 = window.setTimeout(volta, VIGIA_PRIMEIRA_MS);
    const t = window.setInterval(volta, VIGIA_INTERVALO_MS);
    return () => { window.clearTimeout(t0); window.clearInterval(t); };
  }, [ativo]);
  return null;
}
