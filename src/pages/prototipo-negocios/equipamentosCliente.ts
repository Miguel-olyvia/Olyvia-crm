// Os equipamentos que o cliente pode pedir ou fornecer, a partir dos serviços escolhidos (13/10/2026).
// Vêm do Catálogo (V2): os produtos classificados no nó do serviço (ou abaixo dele), tirando os
// consumíveis das receitas (sacos, discos, fita…), que não são escolha do cliente. Funções puras.
import type { Catalogo, Produto } from "./v2/catalogoModelo";
import { RECEITAS } from "./receitas";

export interface EquipServico { sid: string; produtos: Produto[] }

export const CONSUMIVEIS = new Set(Object.values(RECEITAS).flatMap((r) => r.cons.map((c) => c.n)));

/** O nó e tudo o que está abaixo dele na árvore. */
function abaixo(K: Catalogo, no: string): Set<string> {
  const r = new Set([no]);
  for (let mudou = true; mudou; ) {
    mudou = false;
    for (const n of K.arvore) if (n.pai && r.has(n.pai) && !r.has(n.id)) { r.add(n.id); mudou = true; }
  }
  return r;
}

/** Por serviço escolhido, os equipamentos do Catálogo (sem repetir o mesmo produto em dois serviços). */
export function equipamentosDosServicos(K: Catalogo, sids: string[]): EquipServico[] {
  const vistos = new Set<string>();
  const r: EquipServico[] = [];
  for (const sid of sids) {
    const no = K.classe[sid];
    if (!no) continue;
    const nos = abaixo(K, no);
    const produtos = K.produtos.filter((p) => p.no && nos.has(p.no) && !CONSUMIVEIS.has(p.n) && !vistos.has(p.id));
    produtos.forEach((p) => vistos.add(p.id));
    if (produtos.length) r.push({ sid, produtos });
  }
  return r;
}

/** Custo dos materiais que o cliente fornece (para sair do orçamento). */
export const custoDosNomes = (K: Catalogo, nomes: string[]) =>
  Math.round(K.produtos.filter((p) => nomes.includes(p.n)).reduce((a, p) => a + p.custo, 0) * 100) / 100;
