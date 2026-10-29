// CRM: as linhas de negócio (Casa de banho, Cozinha, Remodelação geral) vêm da base (neg_ler_linhas_modelo, migration 20270101300000):
// as necessidades, os serviços do pacote e a medida de cada um, as medidas da visita, a estimativa de materiais e os materiais do modelo,
// cada um com o produto do Catálogo que vai à encomenda de cliente. Substituem as do código (LINHAS do motor), que ficam quando a base
// não tem a linha (ou a função ainda não existe).
import type { SupabaseClient } from "@supabase/supabase-js";
import { LINHAS, nfmt, type LinhaId, type LinhaServico, type MedKey, type Medidas, type StockKey, type SvcId } from "../motor";

const IDS: LinhaId[] = ["wc", "coz", "geral"];
const MEDIDAS: MedKey[] = ["pav", "par", "pts", "pcs"];

export interface LinhaModeloBase {
  chave: LinhaId; nome: string; modelo: string; necessidades: string[];
  mat_descricao: string; mat_custo: number; mat_preco: number;
  medidas: { medida: MedKey; rotulo: string }[];
  servicos: { servico: string; medida: MedKey }[];
  partes: { descricao: string; peso: number; ramo_oficio: string | null; ramo_sub: string | null; manter: string[] }[];
  materiais: { id: string; nome: string; unidade: string; medidas: MedKey[]; fator: number; fixo: number; stock_chave: string; parte: string | null;
    produto: string | null; produto_nome: string | null }[];
}

const lista = <T>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);
const num = (x: unknown) => (typeof x === "number" ? x : Number(x) || 0);

/** As linhas que a função devolveu; o que não for uma linha conhecida fica de fora. */
export function linhasModeloDe(r: unknown): LinhaModeloBase[] {
  return lista<Partial<LinhaModeloBase>>(r).filter((l) => l && IDS.includes(l.chave as LinhaId) && typeof l.nome === "string").map((l) => ({
    chave: l.chave as LinhaId, nome: l.nome!, modelo: l.modelo ?? "", necessidades: lista<string>(l.necessidades),
    mat_descricao: l.mat_descricao ?? "materiais", mat_custo: num(l.mat_custo), mat_preco: num(l.mat_preco),
    medidas: lista<LinhaModeloBase["medidas"][number]>(l.medidas).filter((m) => MEDIDAS.includes(m.medida)),
    servicos: lista<LinhaModeloBase["servicos"][number]>(l.servicos).filter((s) => s.servico && MEDIDAS.includes(s.medida)),
    partes: lista<LinhaModeloBase["partes"][number]>(l.partes).map((p) => ({ ...p, peso: num(p.peso), manter: lista<string>(p.manter) })),
    materiais: lista<LinhaModeloBase["materiais"][number]>(l.materiais).map((m) => ({
      ...m, medidas: lista<MedKey>(m.medidas).filter((k) => MEDIDAS.includes(k)), fator: num(m.fator), fixo: num(m.fixo),
    })),
  }));
}

/** A quantidade de um material: arredonda para cima o fixo mais o fator vezes a soma das medidas (a regra da base). */
export const regraQuantidade = (medidas: MedKey[], fator: number, fixo: number) => (m: Medidas) =>
  Math.ceil(Math.round((fixo + fator * medidas.reduce((a, k) => a + (m[k] || 0), 0)) * 1e6) / 1e6);

const ROTULO_MEDIDA: Record<MedKey, string> = { pav: "pavimento", par: "paredes", pts: "pontos de água", pcs: "peças" };
/** A regra da quantidade em palavras: "1,1 × paredes", "1 por obra", "0,25 × (paredes + pavimento)". */
export function textoRegra(m: Pick<LinhaModeloBase["materiais"][number], "medidas" | "fator" | "fixo" | "unidade">): string {
  const soma = m.medidas.map((k) => ROTULO_MEDIDA[k] ?? k).join(" + ");
  const parte = m.medidas.length && m.fator ? `${nfmt(m.fator)} × ${m.medidas.length > 1 ? `(${soma})` : soma}` : "";
  const fixo = m.fixo ? (parte ? ` + ${nfmt(m.fixo)}` : `${nfmt(m.fixo)} ${m.unidade} por obra`) : "";
  return (parte + fixo || "sem quantidade") + (parte ? `, em ${m.unidade}, arredondado para cima` : "");
}

/** Uma linha da base no formato do motor. */
export function linhaDoMotor(l: LinhaModeloBase): LinhaServico {
  return {
    n: l.nome, modelo: l.modelo, nec: l.necessidades,
    mat: {
      d: l.mat_descricao, custo: l.mat_custo, preco: l.mat_preco,
      partes: l.partes.map((p) => ({
        d: p.descricao, peso: p.peso,
        ...(p.ramo_oficio ? { ramo: (p.ramo_sub ? [p.ramo_oficio, p.ramo_sub] : [p.ramo_oficio]) as [string, string?] } : {}),
        ...(p.manter.length ? { manter: p.manter as SvcId[] } : {}),
      })),
    },
    map: l.servicos.map((s) => [s.servico as SvcId, s.medida]),
    med: Object.fromEntries(l.medidas.map((m) => [m.medida, m.rotulo])),
    mats: l.materiais.map((m) => [m.nome, m.unidade, regraQuantidade(m.medidas, m.fator, m.fixo), m.stock_chave as StockKey,
      { produto: m.produto, parte: m.parte }]),
  };
}

/** Põe as linhas da base no lugar das do código. */
export function aplicarLinhasModelo(L: LinhaModeloBase[]): void {
  for (const l of L) LINHAS[l.chave] = linhaDoMotor(l);
}

/** Lê da base e aplica. Sem a função (migration por aplicar) ou sem permissão, ficam as linhas do código. */
export async function carregarLinhasModelo(sb: SupabaseClient, org: string): Promise<LinhaModeloBase[]> {
  const { data, error } = await sb.rpc("neg_ler_linhas_modelo" as never, { p_org: org } as never);
  if (error) return [];
  const L = linhasModeloDe(data);
  aplicarLinhasModelo(L);
  return L;
}
