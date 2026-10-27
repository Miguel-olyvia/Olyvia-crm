// A navegação pelo endereço (26/10/2026). Antes, tudo vivia no mesmo URL: mudar de página e voltar para trás era impossível, e quem
// ia de um negócio para o Inventário caía na lista inteira. Agora cada ecrã tem um endereço (#/negocio/1046, #/obra/1046,
// #/inventario/po?q=EC-1046&de=Obra%20%231046): as setas do browser andam para trás e para a frente, recarregar fica no mesmo sítio, e
// quem vem de outra página traz o contexto (a lista já filtrada e "Voltar a …").
// Este ficheiro não usa React: o motor pede uma rota (pedirRota) e a moldura do protótipo (PrototipoNegocios.tsx) aplica-a.
import type { Estado, Vista } from "./motor";

/** Os módulos que vivem fora do Estado (os separadores guardam-se na moldura). */
export type Modulo = "inv" | "frota" | "rh";

export interface Rota {
  /** O ecrã principal. */
  v: Vista;
  /** O negócio aberto (v = "negocio") ou a obra aberta nas Operações (v = "operacoes"). */
  deal: number | null;
  op: number | null;
  /** O módulo aberto e o seu separador (Inventário, Frota, RH). */
  mod: Modulo | null;
  aba: string | null;
  /** O filtro de texto com que a lista abre (ex.: a encomenda de cliente da obra). */
  q: string;
  /** O detalhe a abrir logo ("po:PO-2026-0146", "ec:EC-1046"). */
  det: string;
  /** De onde se veio, para o "Voltar" ("Obra #1046") e o endereço de lá ("/obra/1046"). */
  de: string;
  volta: string;
  /** O filtro do quadro de Negócios (S.filtro: "faturar", "atraso", …). */
  filtro: string;
  /** Os filtros com que a lista do módulo abre, em JSON ({"status":"late"}). */
  f: string;
}

export const ROTA_VAZIA: Rota = { v: "hoje", deal: null, op: null, mod: null, aba: null, q: "", det: "", de: "", volta: "", filtro: "", f: "" };

const VISTAS: Vista[] = ["hoje", "negocios", "negocio", "leads", "pessoas", "clientes", "operacoes", "inventario", "catalogo", "marketing", "formularios",
  "campanhas", "origens", "submissoes", "definicoes", "campos", "numeros", "utilizadores", "organizacoes", "comunicacoes"];
const NOME_MOD: Record<Modulo, string> = { inv: "inventario", frota: "frota", rh: "rh" };

/** O caminho da rota, sem o contexto ("/obra/1046", "/inventario/po"). */
export function caminhoDe(r: Pick<Rota, "v" | "deal" | "op" | "mod" | "aba">): string {
  if (r.mod) return `/${NOME_MOD[r.mod]}${r.aba ? "/" + r.aba : ""}`;
  if (r.v === "operacoes" && r.op != null) return `/obra/${r.op}`;
  if (r.v === "negocio" && r.deal != null) return `/negocio/${r.deal}`;
  return `/${r.v}`;
}

/** A rota como endereço: o caminho e, se houver, o contexto (q, det, de, volta). */
export function rotaParaHash(r: Rota): string {
  const p = new URLSearchParams();
  if (r.q) p.set("q", r.q);
  if (r.f) p.set("f", r.f);
  if (r.filtro) p.set("filtro", r.filtro);
  if (r.det) p.set("det", r.det);
  if (r.de) p.set("de", r.de);
  if (r.volta) p.set("volta", r.volta);
  const s = p.toString();
  return "#" + caminhoDe(r) + (s ? "?" + s : "");
}

/** O endereço como rota (null: não é um endereço da app). */
export function hashParaRota(h: string): Rota | null {
  const m = /^#?(\/[^?]*)(?:\?(.*))?$/.exec(h || "");
  if (!m) return null;
  const partes = m[1].split("/").filter(Boolean).map(decodeURIComponent);
  const p = new URLSearchParams(m[2] ?? "");
  const r: Rota = { ...ROTA_VAZIA, q: p.get("q") ?? "", det: p.get("det") ?? "", de: p.get("de") ?? "", volta: p.get("volta") ?? "", filtro: p.get("filtro") ?? "", f: p.get("f") ?? "" };
  const [a, b] = partes;
  if (!a) return null;
  if (a === "inventario" || a === "frota" || a === "rh") return { ...r, v: "inventario", mod: a === "inventario" ? "inv" : a, aba: b ?? null };
  if (a === "obra" && b && /^\d+$/.test(b)) return { ...r, v: "operacoes", op: Number(b) };
  if (a === "negocio" && b && /^\d+$/.test(b)) return { ...r, v: "negocio", deal: Number(b) };
  if ((VISTAS as string[]).includes(a)) return { ...r, v: a as Vista };
  return null;
}

/** Os parâmetros que são da rota; os outros são das páginas (?sec=, ?passo=, ?pessoa=: usarParamUrl.ts). */
const CHAVES_ROTA = ["q", "f", "det", "de", "volta", "filtro"];
/** O endereço novo com os parâmetros das páginas que o atual tem (ficam enquanto se está no mesmo ecrã). */
export function juntarExtras(novo: string, atual: string, so?: string[]): string {
  const i = atual.indexOf("?");
  if (i < 0) return novo;
  const extra = new URLSearchParams(atual.slice(i + 1));
  for (const k of CHAVES_ROTA) extra.delete(k);
  if (so) for (const k of [...extra.keys()]) if (!so.includes(k)) extra.delete(k);
  if (![...extra.keys()].length) return novo;
  const j = novo.indexOf("?"), p = new URLSearchParams(j >= 0 ? novo.slice(j + 1) : "");
  extra.forEach((v, k) => p.set(k, v));
  return (j >= 0 ? novo.slice(0, j) : novo) + "?" + p.toString();
}

/** Duas rotas no mesmo ecrã (só o contexto muda): o histórico substitui em vez de juntar uma entrada. */
export const mesmoEcra = (a: Rota, b: Rota): boolean => caminhoDe(a) === caminhoDe(b);

/** De onde se está agora, para o "Voltar" de quem vai para outra página: o texto e o caminho. */
export function origemAtual(S: { view: Vista; deal: number | null; op: number | null }): { de: string; volta: string } {
  if (S.view === "operacoes" && S.op != null) return { de: `Obra #${S.op}`, volta: `/obra/${S.op}` };
  if (S.view === "negocio" && S.deal != null) return { de: `Negócio #${S.deal}`, volta: `/negocio/${S.deal}` };
  return { de: "", volta: "" };
}

/** Põe o ecrã principal da rota no Estado (o negócio ou a obra têm de existir: false se não existem, por exemplo ainda a carregar). */
export function aplicarNoEstado(S: Pick<Estado, "view" | "deal" | "op" | "deals" | "filtro">, r: Rota): boolean {
  if (r.mod) return true;
  if (r.deal != null && !S.deals.some((d) => d.id === r.deal)) return false;
  if (r.op != null && !S.deals.some((d) => d.id === r.op && d.obra.plano)) return false;
  S.view = r.v; S.deal = r.deal; S.op = r.op;
  if (r.v === "negocios" && r.filtro) S.filtro = r.filtro;
  return true;
}

/* ------------------------------------------------------------------ o título do separador do browser */
const NOME_VISTA: Partial<Record<Vista, string>> = {
  hoje: "Hoje", negocios: "Negócios", negocio: "Negócio", leads: "Leads", pessoas: "Pessoas", clientes: "Clientes", operacoes: "Operações",
  inventario: "Inventário", catalogo: "Catálogo e custos", marketing: "Marketing", formularios: "Formulários", campanhas: "Campanhas",
  origens: "Origens", submissoes: "Submissões", definicoes: "Definições", campos: "Campos", numeros: "Números", utilizadores: "Utilizadores",
  organizacoes: "Organizações", comunicacoes: "Comunicações",
};
const NOME_ABA_INV: Record<string, string> = {
  hoje: "Hoje", po: "Encomendas a fornecedor", sup: "Fornecedores", stock: "Existências", mov: "Movimentos", ec: "Saídas para clientes",
  guia: "Receção", cont: "Contagens", wh: "Armazéns",
};
/** 26/10: o título do separador do browser para a rota ("Olyvia · Obra · Anabela …"). Antes ficava às vezes "Inventário" depois de
 *  sair dele (cada página punha o seu e repunha o anterior ao sair). Agora a moldura põe-no sempre, a partir da rota. */
export function tituloDaRota(r: Rota, nomeNegocio: (id: number) => string | undefined): string {
  const t = r.mod === "inv" ? ["Inventário", NOME_ABA_INV[r.aba ?? ""]].filter(Boolean).join(" · ")
    : r.mod === "frota" ? "Frota" : r.mod === "rh" ? "Recursos Humanos"
    : r.op != null ? `Obra · ${nomeNegocio(r.op) ?? "#" + r.op}`
    : r.deal != null ? nomeNegocio(r.deal) ?? `Negócio #${r.deal}`
    : NOME_VISTA[r.v] ?? "";
  return t ? `Olyvia · ${t}` : "Olyvia";
}

/* ------------------------------------------------------------------ os pedidos do motor */
// O motor (sem React) pede para ir para um módulo com contexto; a moldura tira o pedido depois da ação e aplica-o.
let pedido: Partial<Rota> | null = null;
export function pedirRota(r: Partial<Rota>): void { pedido = r; }
export function tirarPedidoRota(): Partial<Rota> | null { const r = pedido; pedido = null; return r; }
