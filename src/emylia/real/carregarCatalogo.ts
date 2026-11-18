// CRM: lê o Catálogo e custos da organização (cat_ler_catalogo), monta-o e põe-o onde o motor e os ecrãs da Emylia o leem
// (as stores dos custos e do Catálogo, o Catálogo inteiro, os técnicos e os serviços e as margens do Estado). Usam-no a página do
// Catálogo e a dos Negócios. Devolve o "antes" das comparações (para gravar o que mudar no Catálogo) e os ids dos serviços.
import type { SupabaseClient } from "@supabase/supabase-js";
import { seed, type Estado } from "../motor";
import { aplicarTodos } from "../v2/custosModelo";
import { catalogo0 } from "../v2/catalogoModelo";
import { ligarCustos } from "../v2/custosStore";
import { marcarCatalogoAtualizado, porCatalogo } from "../v2/catalogoStore";
import { substituirCatalogoTodo } from "../catalogo";
import { usarTecnicos } from "../equipa/tecnicos";
import { montarCatalogo, type CatalogoMontado, type LinhaProduto } from "./catalogoReal";
import { lerCatalogo, linhasDe } from "./lerCatalogo";
import { fotografar, type FotoCatalogo } from "./gravarCatalogo";
import { aplicarLinhasModelo, lerLinhasModelo } from "./linhasModelo";
import { definirArvoreProdutos, definirCatalogoLido } from "./catalogoLeve";

export interface CatalogoCarregado {
  org: string; M: CatalogoMontado; produtos: LinhaProduto[]; foto: FotoCatalogo;
  /** 11/11 (F1): com `tolerante`, a leitura falhou e montou-se um Catálogo vazio; o texto do erro. */
  erro?: string;
}

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
  marcarCatalogoAtualizado();
  aplicarTodos(S, M.C);
  return { org, M, produtos, foto: fotografar({ C: M.C, K: M.K, svc: S.svc, margens: M.margens }) };
}

/** Lê da base e aplica. 29/10: também as linhas de negócio (linhasModelo.ts); se falharem, ficam as do código. */
/** 17/11: a leitura chegou depois de outra mais nova (`descartar`): não se aplicou ao Catálogo. Quem chamou ignora-a. */
export class LeituraAtrasada extends Error {
  constructor() { super("Leitura do Catálogo atrasada: descartada."); this.name = "LeituraAtrasada"; }
}

export async function carregarCatalogo(sb: SupabaseClient, org: string, S: Estado,
  opcoes: { semLinhasModelo?: boolean; tolerante?: boolean; leve?: boolean; soServicos?: boolean; descartar?: () => boolean } = {}): Promise<CatalogoCarregado> {
  // 11/11 (F1): nos Negócios (`tolerante`), um erro a ler o Catálogo não para o ecrã: monta-se vazio e devolve-se o erro (quem chama
  // avisa e não grava os negócios, que sem o Catálogo perdiam os serviços). Na página do Catálogo o erro continua a subir.
  let erro: string | undefined;
  // 17/11: `leve` lê cat_ler_catalogo_servicos (só os produtos dos consumos dos serviços): Negócios, Serviços e Estúdio. Os produtos escolhem-se por pesquisa no servidor.
  // 18/11: `soServicos` (páginas de Serviços): sem atributos nem modelos. As linhas de negócio (neg_ler_linhas_modelo) ficam: o LINHAS do motor diz a que pacotes e medidas pertence cada serviço.
  const lerOp = { leve: opcoes.leve, soServicos: opcoes.soServicos };
  const ler = opcoes.tolerante ? lerCatalogo(sb, org, lerOp).catch((e: Error) => { erro = e.message || "Não foi possível ler o Catálogo."; return linhasDe(null); }) : lerCatalogo(sb, org, lerOp);
  // 09/11 (20270111100000): quem só lê as obras não pode ler as linhas de negócio (neg_ler_linhas_modelo): ficam as do código
  const [L, linhasNegocio] = await Promise.all([ler, opcoes.semLinhasModelo ? Promise.resolve([]) : lerLinhasModelo(sb, org).catch(() => [])]);
  // 17/11: uma leitura atrasada (já há outra mais nova) não se aplica por cima: uma leve não pode ficar sobre uma inteira
  if (opcoes.descartar?.()) throw new LeituraAtrasada();
  // 18/11: as linhas de negócio (LINHAS global) só se aplicam depois do descartar: uma leitura atrasada de outra organização não as deixa no global
  aplicarLinhasModelo(linhasNegocio);
  const M = montarCatalogo(L, catalogo0(), seed().svc);
  // 17/11: os ecrãs sabem assim que K.produtos é parcial (leve) e de que organização pesquisar os outros; e como se converte a árvore dos produtos
  definirCatalogoLido(org, !!opcoes.leve && !erro);
  definirArvoreProdutos(M.K.arvore, L.tabelas?.categoriasProduto);
  const c = aplicarCatalogo(org, M, L.produtos, S);
  return erro ? { ...c, erro } : c;
}
