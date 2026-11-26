// 26/11 (plano «Obra Viva», etapa 6: falar com a obra). A Olyvia por voz sabe o que os agentes veem em todas as obras, e decide por
// quem fala: «o que se passa na 1048?» (responde e abre o Estúdio da obra, com os cartões da fita), «aceita a do Luís», «recusa essa»,
// «desfaz o que o agente fez», «resumo do dia». A frase vai à IA (função olyvia-comando) com este contexto; as decisões fazem-se aqui,
// pelas mesmas ações da fita (A.agentesObra): ficam no histórico e desfazem-se.
// Quem tem os dados é a página dos Negócios (o VigiaAgentes regista-se aqui ao montar); fora dela, a voz não tem obras e vai lá primeiro.
import type { Ctx } from "../pecas";
import { podeNeg } from "../permissoes";
import { ocupacaoDosTecnicos, rotuloDia } from "../preparacaoObra";
import { fimDe } from "../ajustesPlano";
import { agente, modoDa, propostasDosAgentes } from "./agentes";

type CtxVoz = Pick<Ctx, "S" | "A" | "run">;
let atual: { current: CtxVoz } | null = null;

/** O VigiaAgentes (página dos Negócios) regista o seu ctx; devolve a função para sair. */
export function registarAgentesVoz(ref: { current: CtxVoz }): () => void {
  atual = ref;
  return () => { if (atual === ref) atual = null; };
}

export interface PropostaVoz { ref: string; agente: string; titulo: string; sub: string; modo: "ver" | "pede" | "prazo" | "ja"; aceitar: boolean }
export interface FeitoVoz { ref: string; texto: string; quem: string; quando: string }
export interface ObraVoz { id: number; nome: string; estado: string; fim: string | null; propostas: PropostaVoz[]; feitos: FeitoVoz[] }

const curto = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const mesmoDia = (iso: string, agora: Date) => new Date(iso).toDateString() === agora.toDateString();

/** As obras em curso ou aprovadas, com o que os agentes propõem e o que fizeram hoje. Vazio fora da página dos Negócios. */
export function obrasParaVoz(agora = new Date(), c: CtxVoz | null = atual?.current ?? null): ObraVoz[] {
  if (!c) return [];
  const out: ObraVoz[] = [];
  for (const d of c.S.deals ?? []) {
    const p = d.obra?.plano;
    if (!p || d.perdido || (p.estado !== "em curso" && p.estado !== "aprovado")) continue;
    let L: ReturnType<typeof propostasDosAgentes> = [];
    try { L = propostasDosAgentes(d, c.S, ocupacaoDosTecnicos(c.S, d.id)); } catch { L = []; }
    const e = d.obra.agentes;
    let fim: string | null = null;
    try { fim = rotuloDia(p, fimDe(p.tasks) - 1); } catch { fim = null; }
    out.push({
      id: d.id, nome: curto(d.nome, 60), estado: p.estado, fim,
      propostas: L.slice(0, 10).map((x) => ({ ref: `${d.id}:${x.id}`, agente: agente(x.agente).nome, titulo: curto(x.titulo, 150), sub: curto(x.auto ? `${x.sub} Proposta: ${x.auto.texto}` : x.sub, 220), modo: modoDa(x, e, agora), aceitar: !!x.auto })),
      feitos: (e?.feitos ?? []).filter((f) => !f.desfeito && mesmoDia(f.q, agora)).slice(0, 6)
        .map((f) => ({ ref: `${d.id}:f:${f.id}`, texto: curto(f.texto, 160), quem: f.auto ? "sozinho" : `aceite por ${f.quem}`, quando: new Date(f.q).toTimeString().slice(0, 5) })),
    });
    if (out.length >= 30) break;
  }
  return out;
}

export type OpDecisao = "aceitar" | "recusar" | "desfazer";

/** Faz a decisão dita (pela referência que a IA devolveu). Devolve o que aconteceu, para dizer em voz alta. */
export function decidirPorVoz(ref: string, op: OpDecisao, c: CtxVoz | null = atual?.current ?? null): { ok: boolean; texto: string } {
  if (!c) return { ok: false, texto: "Abre os Negócios ou as Operações para eu decidir nas obras." };
  if (!podeNeg(c.S.role, "obra.planear")) return { ok: false, texto: "Não tens permissão para decidir no plano das obras." };
  const [idTxt, ...resto] = ref.split(":");
  const d = (c.S.deals ?? []).find((x) => x.id === Number(idTxt));
  if (!d?.obra?.plano) return { ok: false, texto: "Não encontrei essa obra." };
  let ok = false;
  if (op === "desfazer") {
    const fid = resto[0] === "f" ? resto[1] : resto.join(":");
    const f = (d.obra.agentes?.feitos ?? []).find((x) => x.id === fid && !x.desfeito);
    if (!f) return { ok: false, texto: "Não encontrei essa mudança para desfazer." };
    c.run(() => { ok = c.A.agentesObra(d.id, { k: "desfazer", fid: f.id }); });
    return ok ? { ok, texto: `Desfiz: ${f.texto}. O agente fica em pausa nesta obra até ao fim do dia.` } : { ok, texto: "Não consegui desfazer." };
  }
  const pid = resto.join(":");
  const x = propostasDosAgentes(d, c.S, ocupacaoDosTecnicos(c.S, d.id)).find((y) => y.id === pid);
  if (!x) return { ok: false, texto: "Essa proposta já não está na fita: a obra mudou entretanto." };
  if (op === "recusar") {
    c.run(() => { ok = c.A.agentesObra(d.id, { k: "recusar", pid: x.id, texto: x.titulo }); });
    return ok ? { ok, texto: `Recusei: ${x.titulo}.` } : { ok, texto: "Não consegui recusar." };
  }
  if (!x.auto) return { ok: false, texto: "Essa não se faz com um sim: abre a obra e decide no cartão." };
  c.run(() => { ok = c.A.agentesObra(d.id, { k: "aplicar", pid: x.id, agente: x.agente, nomeAgente: agente(x.agente).nome, texto: x.auto!.texto, acao: x.auto!.acao, auto: false }); });
  return ok ? { ok, texto: `Feito: ${x.auto.texto}. Podes desfazer na fita.` } : { ok, texto: "Não deu para aplicar: os técnicos já não estão livres. Abre a obra para ver." };
}

/** Abre o Estúdio da obra (nas Operações). Fora da página dos Negócios devolve false: quem chama navega pelo endereço. */
export function abrirObraPorVoz(id: number, c: CtxVoz | null = atual?.current ?? null): boolean {
  if (!c || !(c.S.deals ?? []).some((x) => x.id === id && x.obra?.plano)) return false;
  c.run(() => { c.A.abrirPlano(id); });
  return true;
}
