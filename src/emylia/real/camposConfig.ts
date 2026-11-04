// CRM (3/11/2026, Rúben): os ajustes da organização aos campos das fases (S.campos, CfgCampos) e às regras do impacto no orçamento
// (CfgEfeitos), gravados em negocio_campos_config (migration 20270105300000). Lê-os neg_ler_campos_config; grava-os
// neg_guardar_campos_config (só o admin do Workflow de Pessoas, pessoas.config; grava-os useCamposConfig, no Workflow de Pessoas). Uma organização sem ajustes fica como sempre.
// O que vem da base passa por um filtro: só grupos e campos que existem, tipos conhecidos, e os campos de que o motor depende
// (os que têm `papel`) nunca saem (escondem-se, mas não se apagam: só os campos novos da empresa se apagam).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Estado } from "../motor";
import {
  AREA, CONTACTO, ESCOLHAS, EXTERIOR, FINANCEIRO, INTERIOR, LEAD, OBRA, PROPOSTA,
  type AjusteGrupo, type CfgCampos, type Def, type Grupo, type Tipo,
} from "../campos";
import { definirEfeitosCampos, lerCfgEfeitos, type CfgEfeitos } from "../efeitosLevantamento";

export interface CamposConfig { campos: CfgCampos; efeitos: CfgEfeitos }

/** Todos os grupos que a organização pode ajustar (os mesmos do editor). */
export const GRUPOS_AJUSTAVEIS: readonly Grupo[] = [...LEAD, ...CONTACTO, EXTERIOR, INTERIOR, AREA, ESCOLHAS, ...PROPOSTA, ...FINANCEIRO, ...OBRA];
const TIPOS: readonly Tipo[] = ["sim_nao", "escolha", "varios", "numero", "contador", "texto", "texto_longo", "data"];
const MAX_TEXTO = 120;

const texto = (x: unknown): string | null => (typeof x === "string" && x.trim() !== "" ? x.trim().slice(0, MAX_TEXTO) : null);
const textos = (x: unknown): string[] | null => {
  if (!Array.isArray(x)) return null;
  const r = [...new Set(x.map(texto).filter((s): s is string => !!s))];
  return r.length ? r : null;
};
const mapa = <T>(x: unknown, chaves: ReadonlySet<string>, ler: (v: unknown) => T | null): Record<string, T> | null => {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const r: Record<string, T> = {};
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
    const lido = chaves.has(k) ? ler(v) : null;
    if (lido !== null) r[k] = lido;
  }
  return Object.keys(r).length ? r : null;
};

/** Um campo novo da empresa, como veio da base (null se não serve). */
function lerNovo(x: unknown, usadas: Set<string>): Def | null {
  if (!x || typeof x !== "object") return null;
  const c = x as Record<string, unknown>;
  const k = typeof c.k === "string" && /^c_[a-z0-9_]{1,40}$/.test(c.k) ? c.k : null;
  const l = texto(c.l);
  const t = TIPOS.includes(c.t as Tipo) ? (c.t as Tipo) : null;
  if (!k || !l || !t || usadas.has(k)) return null;
  const op = textos(c.op);
  if ((t === "escolha" || t === "varios") && (!op || op.length < 2)) return null;
  usadas.add(k);
  const d: Def = { k, l, t, novo: true };
  if (op && (t === "escolha" || t === "varios")) d.op = op;
  if (typeof c.obrigatorio === "boolean") d.obrigatorio = c.obrigatorio;
  // 4/11: as opções que abrem a caixa de mais detalhe (só as que existem)
  const detalhe = textos(c.detalhe)?.filter((o) => d.op?.includes(o));
  if (detalhe?.length) d.detalhe = detalhe;
  const bloco = texto(c.bloco);
  if (bloco) d.bloco = bloco;
  if (t === "contador") { d.min = Number.isFinite(c.min) ? Number(c.min) : 0; d.max = Number.isFinite(c.max) ? Number(c.max) : 50; }
  return d;
}

/** Os ajustes de um grupo, limpos. */
function lerAjuste(g: Grupo, x: unknown): AjusteGrupo | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const a = x as Record<string, unknown>;
  const usadas = new Set(GRUPOS_AJUSTAVEIS.flatMap((y) => y.campos.map((c) => c.k)));
  const novos = Array.isArray(a.novos) ? a.novos.map((n) => lerNovo(n, usadas)).filter((n): n is Def => !!n) : [];
  const deSistema = new Set(g.campos.map((c) => c.k));
  const todos = new Set([...deSistema, ...novos.map((c) => c.k)]);
  const comOpcoes = new Set(g.campos.filter((c) => c.op).map((c) => c.k));
  const r: AjusteGrupo = {};
  const nome = texto(a.nome);
  if (nome && nome !== g.titulo) r.nome = nome;
  if (a.oculto === true) r.oculto = true;
  const ordem = textos(a.ordem)?.filter((k) => todos.has(k));
  if (ordem?.length) r.ordem = ordem;
  const ocultos = textos(a.ocultos)?.filter((k) => deSistema.has(k));
  if (ocultos?.length) r.ocultos = ocultos;
  const obrig = mapa(a.obrig, todos, (v) => (typeof v === "boolean" ? v : null));
  if (obrig) r.obrig = obrig;
  const rotulos = mapa(a.rotulos, deSistema, texto);
  if (rotulos) r.rotulos = rotulos;
  // uma escolha fica sempre com pelo menos duas opções
  const opcoes = mapa(a.opcoes, comOpcoes, (v) => { const o = textos(v); return o && o.length >= 2 ? o : null; });
  if (opcoes) r.opcoes = opcoes;
  // 4/11: nos campos de escolha do sistema, as opções que abrem a caixa de mais detalhe (das opções que o campo tem, com os ajustes)
  if (a.detalhes && typeof a.detalhes === "object" && !Array.isArray(a.detalhes)) {
    const detalhes: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(a.detalhes as Record<string, unknown>)) {
      if (!comOpcoes.has(k)) continue;
      const ops = r.opcoes?.[k] ?? g.campos.find((c) => c.k === k)?.op ?? [];
      const o = textos(v)?.filter((x) => ops.includes(x));
      if (o?.length) detalhes[k] = o;
    }
    if (Object.keys(detalhes).length) r.detalhes = detalhes;
  }
  if (novos.length) r.novos = novos;
  return Object.keys(r).length ? r : null;
}

/** O CfgCampos que veio da base, limpo: só grupos conhecidos (pelo título) e o que neles faz sentido. */
export function lerCfgCampos(x: unknown): CfgCampos {
  if (!x || typeof x !== "object" || Array.isArray(x)) return {};
  const r: CfgCampos = {};
  for (const g of GRUPOS_AJUSTAVEIS) {
    const a = lerAjuste(g, (x as Record<string, unknown>)[g.titulo]);
    if (a) r[g.titulo] = a;
  }
  return r;
}

/** A resposta de neg_ler_campos_config (e de neg_guardar_campos_config). */
export function lerCamposConfig(x: unknown): CamposConfig {
  const o = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
  return { campos: lerCfgCampos(o.campos), efeitos: lerCfgEfeitos(o.efeitos) };
}

/** Lê os ajustes da organização. Lança se a base falhar. */
export async function lerCamposConfigBase(sb: SupabaseClient, org: string): Promise<CamposConfig> {
  // `as never`: a função ainda não está nos tipos gerados
  const { data, error } = await sb.rpc("neg_ler_campos_config" as never, { p_org: org } as never);
  if (error) throw new Error(error.message);
  return lerCamposConfig(data);
}

/** Põe os ajustes onde o motor e os ecrãs os leem: S.campos (efetivo) e as regras do orçamento (efeitosDoLevantamento). */
export function aplicarCamposConfig(S: Estado, cfg: CamposConfig): void {
  S.campos = cfg.campos;
  definirEfeitosCampos(cfg.efeitos);
}

/** Lê e aplica. Se a base falhar (ex.: a migration ainda não foi aplicada), fica como sempre: sem ajustes, e diz-se na consola. */
export async function carregarCamposConfig(sb: SupabaseClient, org: string, S: Estado): Promise<CamposConfig> {
  try {
    const cfg = await lerCamposConfigBase(sb, org);
    aplicarCamposConfig(S, cfg);
    return cfg;
  } catch (e) {
    console.warn("[campos] os ajustes da organização não carregaram; ficam os campos de sempre:", (e as Error).message);
    const vazio: CamposConfig = { campos: {}, efeitos: {} };
    aplicarCamposConfig(S, vazio);
    return vazio;
  }
}
