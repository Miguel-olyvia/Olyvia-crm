// "Números" no V1 (16/10/2026): o que a Direção vem ver, no lugar dos dashboards que saíram do ecrã do comercial.
// Só lógica, sem React, e só com os negócios do Estado (nada de exemplo, nada inventado: guidelines P9 e E12).
import { proximo, tot, type Estado, type Negocio } from "./motor";
import { docFase, ehGanho } from "./negociosApp";

/** As etapas do funil, pela ordem do percurso. Cada negócio conta em todas as que já alcançou (também os perdidos). */
export const ETAPAS_FUNIL = ["Chegaram", "Contactados", "Com visita", "Com orçamento", "Proposta enviada", "Ganhos"] as const;

const alcancou = (d: Negocio, i: number): boolean => {
  if (i === 0) return true;
  if (i === 1) return d.fase >= 1;
  if (i === 2) return d.fase >= 2;
  if (i === 3) return d.fase >= 3;
  if (i === 4) return d.fase >= 4 || !!d.orc?.enviada;
  return ehGanho(d);
};

export interface Etapa { nome: string; n: number; /** em relação à primeira etapa, 0–1 */ parte: number }
export interface Motivo { nome: string; n: number }

export interface Numeros {
  /** € em propostas enviadas à espera do cliente (abertas). */
  emProposta: number; nProposta: number;
  /** € dos negócios ganhos (contrato assinado, ou proposta aceite sem contrato). */
  ganho: number; nGanhos: number;
  /** Ganhos sobre os que chegaram (0–1); null sem nenhum. */
  conversao: number | null;
  /** Margem média dos ganhos e das propostas em curso (0–1, como `tot().m`); null sem nenhum. */
  margem: number | null;
  funil: Etapa[];
  perdas: Motivo[]; nPerdidos: number;
  origens: { nome: string; n: number; ganhos: number }[];
  /** O que pede a decisão da Direção: exceções à margem por aprovar. */
  decidir: Negocio[];
  /** Negócios abertos à espera de alguém de fora (cliente) há mais tempo: só a contagem. */
  aEspera: number;
}

const comOrcamento = (d: Negocio): boolean => !!d.orc && d.orc.linhas.length > 0;

export function numeros(S: Estado): Numeros {
  const ds = S.deals;
  const proposta = ds.filter((d) => !d.perdido && docFase(d) === "proposta" && comOrcamento(d));
  const ganhos = ds.filter((d) => ehGanho(d) && comOrcamento(d));
  const perdidos = ds.filter((d) => d.perdido);
  const comMargem = [...ganhos, ...proposta];
  const funil = ETAPAS_FUNIL.map((nome, i) => ({ nome, n: ds.filter((d) => alcancou(d, i)).length, parte: 0 }));
  const base = funil[0].n || 1;
  for (const e of funil) e.parte = e.n / base;

  const motivos = new Map<string, number>();
  for (const d of perdidos) { const m = d.motivoPerda || "Motivo não registado"; motivos.set(m, (motivos.get(m) ?? 0) + 1); }
  const origens = new Map<string, { n: number; ganhos: number }>();
  for (const d of ds) {
    const o = rotuloOrigem(d.origem);
    const x = origens.get(o) ?? { n: 0, ganhos: 0 };
    x.n++; if (ehGanho(d)) x.ganhos++;
    origens.set(o, x);
  }
  return {
    emProposta: proposta.reduce((a, d) => a + tot(d, S).pf, 0), nProposta: proposta.length,
    ganho: ganhos.reduce((a, d) => a + tot(d, S).pf, 0), nGanhos: ganhos.length,
    conversao: ds.length ? ds.filter(ehGanho).length / ds.length : null,
    margem: comMargem.length ? comMargem.reduce((a, d) => a + tot(d, S).m, 0) / comMargem.length : null,
    funil,
    perdas: [...motivos].map(([nome, n]) => ({ nome, n })).sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome)),
    nPerdidos: perdidos.length,
    origens: [...origens].map(([nome, x]) => ({ nome, ...x })).sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome)),
    decidir: ds.filter((d) => !d.perdido && d.fase === 3 && d.orc?.aprov === "pedida"),
    aEspera: ds.filter((d) => !d.perdido && proximo(d, S).wait).length,
  };
}

/** A origem como se diz: primeira letra maiúscula ("site" → "Site", "à mão" → "Registada à mão"). */
export function rotuloOrigem(o: string): string {
  const t = (o || "").trim();
  if (!t) return "Sem origem";
  if (t === "à mão") return "Registada à mão";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** "3 de 11 chegaram a ganho": a frase do funil para o leitor de ecrã e para o título. */
export const fraseFunil = (f: Etapa[]): string => `${f[f.length - 1].n} de ${f[0].n} ${f[0].n === 1 ? "negócio chegou" : "negócios chegaram"} a ganho`;
