// 12/11 (Rúben: «quero voltar atrás e manda para a página inicial»): o ecrã da página dos Negócios no endereço.
// Antes, o Hoje, os Negócios, o negócio aberto e a obra nas Operações viviam só em memória (S.view, S.deal, S.op): para o browser era tudo
// a mesma página, e o «voltar» saía dela. Agora cada ecrã é uma entrada do histórico (/negocios?negocio=1026, ?vista=operacoes&obra=1026),
// e o que está dentro do ecrã (o passo, a fase que se lê, um Estúdio aberto) junta-se a ela (paramUrl.ts, modo "pesquisa").
import type { Estado } from "./motor";

export type VistaPrincipal = "hoje" | "negocios" | "negocio" | "operacoes";
export interface Ecra { view: VistaPrincipal; deal: number | null; op: number | null }

/** Os parâmetros que ficam ao mudar de ecrã (os outros são do ecrã que se deixa: ?passo=, ?estudio=, ?sec=…). */
const FICAM = ["teste"] as const;

const numero = (v: string | null): number | null => {
  const n = Number(v);
  return v && Number.isInteger(n) && n > 0 ? n : null;
};

/** O ecrã que o endereço pede. `omissao`: a vista sem ?vista= (/negocios abre nos Negócios; /home, no Hoje). */
export function ecraDoEndereco(p: URLSearchParams, omissao: VistaPrincipal = "negocios"): Ecra {
  const deal = numero(p.get("negocio"));
  if (deal != null) return { view: "negocio", deal, op: null };
  const v = p.get("vista");
  const view: VistaPrincipal = v === "hoje" || v === "negocios" || v === "operacoes" ? v : omissao === "negocio" ? "negocios" : omissao;
  return { view, deal: null, op: view === "operacoes" ? numero(p.get("obra")) : null };
}

/** O ecrã em que a página está; null nas vistas que não são desta página (essas abrem outra página da app). */
export function ecraDoEstado(S: Pick<Estado, "view" | "deal" | "op">): Ecra | null {
  if (S.view === "negocio") return S.deal != null ? { view: "negocio", deal: S.deal, op: null } : null;
  if (S.view === "operacoes") return { view: "operacoes", deal: null, op: S.op ?? null };
  if (S.view === "hoje" || S.view === "negocios") return { view: S.view, deal: null, op: null };
  return null;
}

export const mesmoEcra = (a: Ecra, b: Ecra): boolean => a.view === b.view && a.deal === b.deal && a.op === b.op;

/** O ecrã pedido, só com o que existe: um negócio que não está na lista abre os Negócios; uma obra sem plano abre as Operações. */
export function ecraValido(e: Ecra, S: Pick<Estado, "deals">): Ecra {
  if (e.view === "negocio" && !S.deals.some((d) => d.id === e.deal)) return { view: "negocios", deal: null, op: null };
  if (e.view === "operacoes" && e.op != null && !S.deals.some((d) => d.id === e.op && d.obra.plano)) return { ...e, op: null };
  return e;
}

/** A pesquisa do endereço para um ecrã (com "?" ou vazia). Os parâmetros do ecrã anterior saem; ficam só os de FICAM. */
export function pesquisaDoEcra(e: Ecra, atual: URLSearchParams, omissao: VistaPrincipal = "negocios"): string {
  const p = new URLSearchParams();
  for (const k of FICAM) { const v = atual.get(k); if (v != null) p.set(k, v); }
  if (e.view === "negocio" && e.deal != null) p.set("negocio", String(e.deal));
  else {
    if (e.view !== omissao) p.set("vista", e.view);
    if (e.view === "operacoes" && e.op != null) p.set("obra", String(e.op));
  }
  const s = p.toString();
  return s ? "?" + s : "";
}

/** Aplica um ecrã ao estado (as setas do browser, o menu, uma ligação). */
export function irParaEcra(S: Estado, e: Ecra): void {
  S.view = e.view; S.deal = e.deal; S.op = e.op; S.confirmPerda = null;
}
