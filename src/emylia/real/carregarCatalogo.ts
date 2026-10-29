// CRM: lê o Catálogo e custos da organização (cat_ler_catalogo), monta-o e põe-o onde o motor e os ecrãs da Emylia o leem
// (as stores dos custos e do Catálogo, o Catálogo inteiro, os técnicos e os serviços e as margens do Estado). Usam-no a página do
// Catálogo e a dos Negócios. Devolve o "antes" das comparações (para gravar o que mudar no Catálogo) e os ids dos serviços.
import type { SupabaseClient } from "@supabase/supabase-js";
import { seed, type Estado } from "../motor";
import { aplicarTodos } from "../v2/custosModelo";
import { catalogo0 } from "../v2/catalogoModelo";
import { ligarCustos } from "../v2/custosStore";
import { porCatalogo } from "../v2/catalogoStore";
import { substituirCatalogoTodo } from "../catalogo";
import { usarTecnicos } from "../equipa/tecnicos";
import { montarCatalogo, type CatalogoMontado, type LinhaProduto } from "./catalogoReal";
import { lerCatalogo } from "./lerCatalogo";
import { fotografar, type FotoCatalogo } from "./gravarCatalogo";
import { carregarLinhasModelo } from "./linhasModelo";

export interface CatalogoCarregado { org: string; M: CatalogoMontado; produtos: LinhaProduto[]; foto: FotoCatalogo }

/** Põe o Catálogo montado nas stores e no Estado; devolve o "antes" das comparações. */
export function aplicarCatalogo(org: string, M: CatalogoMontado, produtos: LinhaProduto[], S: Estado): CatalogoCarregado {
  substituirCatalogoTodo(M.itens);
  // 28/10: os técnicos do RH e os custos da base ficam no Estado. Antes ficavam só na lista viva e numa store presa a um objeto de passagem:
  // o S.custos e o S.tecnicos do seed() (os de exemplo) continuavam a contar no orçamento (custosDe) e o garantirTecnicos do Hoje repunha os
  // técnicos de exemplo. `semExemplos`: numa organização sem técnicos a lista fica vazia (não volta a de exemplo).
  S.tecnicos = M.tecnicos;
  S.semExemplos = true;
  usarTecnicos(S.tecnicos);
  for (const k of Object.keys(S.svc)) if (!M.svc[k]) delete S.svc[k];
  Object.assign(S.svc, M.svc);
  S.cfg.min = M.margens.min;
  S.cfg.alvo = M.margens.alvo;
  S.custos = M.C;
  ligarCustos(S);
  porCatalogo(M.K);
  aplicarTodos(S, M.C);
  return { org, M, produtos, foto: fotografar({ C: M.C, K: M.K, svc: S.svc, margens: M.margens }) };
}

/** Lê da base e aplica. 29/10: também as linhas de negócio (linhasModelo.ts); se falharem, ficam as do código. */
export async function carregarCatalogo(sb: SupabaseClient, org: string, S: Estado): Promise<CatalogoCarregado> {
  const [L] = await Promise.all([lerCatalogo(sb, org), carregarLinhasModelo(sb, org).catch(() => [])]);
  return aplicarCatalogo(org, montarCatalogo(L, catalogo0(), seed().svc), L.produtos, S);
}
