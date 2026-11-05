// 4/11 (Rúben): «Tudo na chamada» com a transcrição em direto: a lógica das propostas, do que o motor
// (as funções Supabase chamada-transcrever e chamada-campos, em chamadaNuvem.ts) devolve para o formulário.
// Só lógica, sem React, para se testar à parte.
import { listaVarios, type Def, type Grupo } from "./campos";

/** Uma fala transcrita, como o motor a manda. */
export interface Fala { inicio: number; fim: number; texto: string; falante: "comercial" | "cliente"; confianca_falante: number }

/** Um campo extraído pelo motor (a forma de extrair.py). */
export interface CampoExtraido {
  chave: string; rotulo: string; tipo: string; valor: string | number | boolean | null; valor_rotulo: string | null;
  confianca: number; excerto: string; estado: "preenchido" | "rever" | "em_falta";
}
export interface Extracao { resumo: string; motor: string; fichas: { campos: CampoExtraido[] }[];
  /** 5/11: quem disse cada linha, revisto pelo sentido da conversa no fim (uma entrada por linha enviada). */
  falantes?: ("comercial" | "cliente")[] }

/** Os campos que se mandam ao motor: os Def dos grupos (k, l, t, op, ajuda, un), sem os ocultos. */
export function camposParaMotor(grupos: Grupo[]): Pick<Def, "k" | "l" | "t" | "op" | "ajuda" | "un">[] {
  return grupos.filter((g) => !g.oculto).flatMap((g) => g.campos.map(({ k, l, t, op, ajuda, un }) => ({ k, l, t, op, ajuda, un })));
}

const limpo = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** O valor de um campo extraído no formato que o formulário guarda (texto), ou null se não serve. */
export function valorParaCampo(c: Def, x: CampoExtraido): string | null {
  if (x.valor === null || x.valor === undefined || x.estado === "em_falta") return null;
  const v = x.valor;
  switch (c.t) {
    case "sim_nao": return v === true ? "Sim" : v === false ? "Não" : null;
    case "escolha": { const op = (c.op ?? []).find((o) => limpo(o) === limpo(String(v))); return op ?? null; }
    case "varios": {
      // cada opção conta se aparece inteira (palavra a palavra) no que foi dito: «b, c e também d» dá B e C, não A
      const dito = " " + limpo(String(v)).replace(/[,;]/g, " ") + " ";
      const op = (c.op ?? []).filter((o) => dito.includes(" " + limpo(o) + " "));
      return op.length ? op.join(", ") : null;
    }
    case "numero": case "contador": {
      const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
      if (!Number.isFinite(n)) return null;
      if (c.t === "contador") { const i = Math.round(n); if (c.min !== undefined && i < c.min) return null; if (c.max !== undefined && i > c.max) return null; return String(i); }
      return String(n);
    }
    case "data": return /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : null;
    default: return String(v).trim() || null;
  }
}

export interface Proposta { k: string; l: string; valor: string; confianca: number; excerto: string; estado: CampoExtraido["estado"]; jaTinha: string }

/** O que a extração propõe para cada campo do formulário, com o que o campo já tinha (para não escrever por cima sem querer). */
export function propostas(extracao: Extracao | null | undefined, grupos: Grupo[], f: Record<string, string>): Proposta[] {
  if (!extracao) return [];
  // pela ordem do formulário (grupos e campos), não pela ordem em que o motor os devolveu
  const extraidos = new Map(extracao.fichas.flatMap((fi) => fi.campos).map((x) => [x.chave, x] as const));
  const out: Proposta[] = [];
  for (const c of grupos.filter((g) => !g.oculto).flatMap((g) => g.campos)) {
    const x = extraidos.get(c.k);
    if (!x) continue;
    const valor = valorParaCampo(c, x);
    if (valor === null) continue;
    out.push({ k: c.k, l: c.l, valor, confianca: x.confianca, excerto: x.excerto, estado: x.estado, jaTinha: f[c.k] || "" });
  }
  return out;
}

/** As propostas que entram: as de campos vazios e, se `substituir`, também as que mudam um valor já escrito. */
export const aAplicar = (p: Proposta[], substituir: boolean) =>
  p.filter((x) => x.jaTinha.trim() === "" ? true : substituir && x.jaTinha !== x.valor);

/** Para os `varios` já com valor: junta em vez de substituir (nunca perde o que a pessoa marcou). */
export function juntarVarios(c: Def | undefined, antigo: string, novo: string): string {
  if (!c || c.t !== "varios" || !antigo) return novo;
  const lista = listaVarios(antigo);
  for (const o of listaVarios(novo)) if (!lista.includes(o)) lista.push(o);
  return lista.join(", ");
}
