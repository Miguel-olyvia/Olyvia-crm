// 09/11/2026 (20270111870000): os materiais da obra para quem tem negocios.obra.materiais mas não vê as encomendas de cliente
// (client_orders.view): o gestor de obra sem Inventário e o técnico. A base devolve-os por obra_materiais_ler(p_org, p_negocio), sem
// preços, custos nem fornecedores, com a mesma regra de quantidades e de estado de rpc_get_client_order_document (o caminho de quem vê
// as encomendas, encomendaReal.ts, que fica como está). Aqui monta-se o que materiaisPorFase (obraOps.ts) desenha: as linhas e um
// resumo no formato dos ecrãs (ResumoEcNeg), com as encomendas a fornecedor de cada linha só pela fase (sem número nem fornecedor).
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { EC_ESTADOS, type EstadoEc, type EstadoLinhaEc } from "../inventario/ec";
import type { LinhaResumoNeg, PoResumoNeg, ResumoEcNeg } from "../inventario/ponteNegocios";
import type { Negocio } from "../motor";
import type { Ctx } from "../pecas";
import { podeNeg } from "../permissoes";
import { orgDoModoReal } from "../acessosPortal";

/** Uma linha de obra_materiais_ler (só os campos que se usam). */
export interface LinhaMateriaisBase {
  id?: string | null; produto?: string | null; linha?: string | null; componente?: number | null;
  n?: string | null; q?: number | string | null; un?: string | null; ec?: string | null; adenda?: string | null;
  pronto?: number | string | null; saida?: number | string | null; a_chegar?: number | string | null;
  prometida?: string | null; prevista?: string | null; po_por_aprovar?: boolean | null;
  estado?: string | null; st?: string | null;
}
export interface MateriaisBase { negocio_id?: string; ecs?: { ec: string | null; adenda: string | null }[]; linhas?: LinhaMateriaisBase[] }

/** Uma linha para materiaisPorFase: o produto (para a fase pelo Catálogo), o nome, a quantidade e a encomenda de cliente. */
export interface LinhaMatLida { id?: string | null; n: string; q: number; un: string; falta: number; ec: string }
export interface MateriaisLidos { ecs: string[]; linhas: LinhaMatLida[]; inv: ResumoEcNeg }

const num = (x: unknown): number => { const v = Number(x); return Number.isFinite(v) ? v : 0; };
const ST: ReadonlySet<string> = new Set<EstadoLinhaEc>(["served", "recvpo", "waitpo", "ready", "partial", "missing", "nosup", "service", "void"]);

/** O que a base devolveu, no formato de materiaisPorFase. Sem fornecedor: a encomenda a fornecedor da linha só diz a fase e a data. */
export function materiaisDaBase(r: MateriaisBase | null | undefined): MateriaisLidos {
  const ecs = (r?.ecs ?? []).map((e) => e.ec ?? "Encomenda de cliente");
  const base = Array.isArray(r?.linhas) ? r!.linhas : [];
  const resumo: LinhaResumoNeg[] = base.map((l, i) => {
    const q = num(l.q), pronto = num(l.pronto), saida = num(l.saida), aChegar = Math.max(0, num(l.a_chegar));
    const st = (l.st && ST.has(l.st) ? l.st : "missing") as EstadoLinhaEc;
    const prometida = l.prometida ? l.prometida.slice(0, 10) : null;
    const pos: PoResumoNeg[] = l.po_por_aprovar == null && !prometida ? []
      : [{ id: "", forn: "", estado: l.estado ?? "", fase: l.po_por_aprovar ? "por aprovar" : "no portal", prometida, prevista: (l.prevista ?? prometida ?? "").slice(0, 10) }];
    return {
      ec: l.ec ?? "Encomenda de cliente", id: l.linha ? `${l.linha}:${l.componente ?? 0}` : String(i), sku: "", n: l.n ?? "Produto", q, un: l.un ?? "un",
      st, rotulo: l.estado ?? st, aBordo: false, saida, pronto, aChegar, semForn: st === "nosup" ? Math.max(0, q - pronto - saida) : 0, pos,
    };
  });
  const linhas: LinhaMatLida[] = base.map((l, i) => ({
    id: l.id ?? l.produto ?? null, n: resumo[i].n, q: resumo[i].q, un: resumo[i].un, ec: resumo[i].ec,
    falta: Math.max(0, resumo[i].q - resumo[i].pronto - resumo[i].saida),
  }));
  const servidas = resumo.filter((l) => l.st === "served").length, prontas = resumo.filter((l) => l.st === "ready" || l.st === "recvpo").length;
  const aFornecedor = resumo.filter((l) => l.aChegar > 0).length, semForn = resumo.filter((l) => l.semForn > 0).length;
  const estado: EstadoEc = resumo.length && servidas === resumo.length ? "full" : semForn ? "nosup" : aFornecedor ? "waiting" : "partial";
  const pronta = resumo.every((l) => l.st === "served" || l.st === "ready" || l.st === "recvpo");
  const inv: ResumoEcNeg = {
    id: ecs[0] ?? "Encomenda de cliente", eliminada: false, estado, rotulo: EC_ESTADOS[estado], linhas: resumo, ajustes: ecs.slice(1),
    tot: { linhas: resumo.length, servidas, prontas, aBordo: 0, aFornecedor, semForn },
    // as encomendas a fornecedor não vão no resumo: sem número nem fornecedor (a base não os dá a quem não vê as encomendas)
    pos: [], pronta,
  };
  return { ecs, linhas, inv };
}

/** Lê os materiais da obra. A mensagem da base (CT001 sem permissão) volta no erro. */
export async function lerMateriaisObra(org: string, negocio: string): Promise<MateriaisLidos> {
  const { data, error } = await supabase.rpc("obra_materiais_ler" as never, { p_org: org, p_negocio: negocio } as never);
  if (error) throw new Error((error as { message?: string }).message || "Não foi possível ler os materiais.");
  return materiaisDaBase(data as MateriaisBase | null);
}

// a mesma obra aberta em vários sítios (a página da obra, as tarefas do Hoje do técnico) lê-se uma vez por minuto
const CACHE_MS = 60_000;
const cache = new Map<string, { em: number; p: Promise<MateriaisLidos> }>();
export const esquecerMateriaisObra = (): void => cache.clear();
function lerComCache(org: string, negocio: string): Promise<MateriaisLidos> {
  const k = `${org}|${negocio}`, c = cache.get(k);
  if (c && Date.now() - c.em < CACHE_MS) return c.p;
  const p = lerMateriaisObra(org, negocio);
  cache.set(k, { em: Date.now(), p });
  p.catch(() => { if (cache.get(k)?.p === p) cache.delete(k); });
  return p;
}

export type LeituraMateriais = { k: "fora" } | { k: "a ler" } | { k: "lidos"; m: MateriaisLidos } | { k: "erro" };

/** Os materiais da obra pela base. Sem `org` ou sem `negocio` (quem vê as encomendas, ou sem a permissão): não lê ({ k: "fora" }). */
export function useMateriaisObra(org: string | null | undefined, negocio: string | null | undefined): LeituraMateriais {
  const [r, setR] = useState<{ chave: string; l: LeituraMateriais }>({ chave: "", l: { k: "fora" } });
  const chave = org && negocio ? `${org}|${negocio}` : "";
  useEffect(() => {
    if (!org || !negocio) return;
    let vivo = true;
    lerComCache(org, negocio).then(
      (m) => { if (vivo) setR({ chave: `${org}|${negocio}`, l: { k: "lidos", m } }); },
      () => { if (vivo) setR({ chave: `${org}|${negocio}`, l: { k: "erro" } }); },
    );
    return () => { vivo = false; };
  }, [org, negocio]);
  if (!chave) return { k: "fora" };
  return r.chave === chave ? r.l : { k: "a ler" };
}

/** Os materiais da obra `d` pela base, só para quem não vê as encomendas de cliente (ctx.podeVerInventario === false) e tem
 *  negocios.obra.materiais; os outros ficam como estavam ({ k: "fora" }, sem pedido à base). */
export function useMateriaisDaObra(ctx: Ctx, d: Negocio): LeituraMateriais {
  const usar = ctx.podeVerInventario === false && podeNeg(ctx.S.role, "obra.materiais");
  const org = usar ? orgDoModoReal() : null;
  const negocio = org ? ctx.idNegocioBase?.(d.id) ?? null : null;
  return useMateriaisObra(org, negocio);
}
