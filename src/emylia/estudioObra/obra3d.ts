// 12/11 (Rúben: «ter também a parte do 3D para ver»). O projeto aprovado no Estúdio do projeto (f.estudio) em 3D, no Estúdio da obra,
// só para consulta, com o que já está feito marcado: a cores o que está feito (as tarefas feitas ou validadas), transparente o que falta.
// As paredes e o chão ficam com a cor de antes enquanto o revestimento e o pavimento não estiverem feitos. Pela tarefa do ofício de cada
// peça (as louças, os móveis, os equipamentos), pelo nome; sem tarefa que lhe corresponda, a peça conta como feita só com a obra acabada.
import type { Negocio, Plano, Tarefa } from "../motor";
import type { TipoPeca } from "../planta";
import { cenaDe } from "@/pages/prototipo-estudio/cenaDoProjeto";
import { projetoDoNegocio } from "@/pages/prototipo-estudio/daVisita";
import type { Cena } from "@/pages/prototipo-estudio/geometria3d";
import { ID_ESPELHO_CONTRATO, espacoDoEstudio } from "@/pages/prototipo-estudio/estudioNo3D";
import { produto } from "@/pages/prototipo-estudio/catalogoFake";
import type { Projeto } from "@/pages/prototipo-estudio/necessidadesEstudio";
import { produtosPedidosDoProjeto, type PedidoProduto } from "@/pages/prototipo-estudio/produtosDoProjeto";
import type { ResLegado } from "@/emylia/planta3d/ligacao";
import { estadoVivo } from "./planoVivo";

type Grupo = "paredes" | "chao" | "loucas" | "moveis" | "equipamentos";
const DE_QUE: Record<Grupo, RegExp> = {
  paredes: /revest|azulej|parede|pintur/i,
  chao: /paviment|ch[ãa]o/i,
  loucas: /lou[çc]|sanit|banheira|base de duche|base do duche/i,
  moveis: /m[óo]ve|mobili|bancada|arm[áa]rio|acess[óo]rio|montagem final/i,
  equipamentos: /eletrodom|equipament|placa|forno|exaustor/i,
};
const GRUPO_DA_PECA: Partial<Record<TipoPeca, Grupo>> = {
  base: "loucas", banheira: "loucas", sanita: "loucas", bide: "loucas", lava: "loucas",
  movel: "moveis", coluna: "moveis", espelho: "moveis", toalheiro: "moveis", bancada: "moveis", armario: "moveis",
  placa: "equipamentos", forno: "equipamentos", frigorifico: "equipamentos", maquina: "equipamentos", exaustor: "equipamentos",
};
const feita = (t: Tarefa, p: Plano) => { const v = estadoVivo(t, p); return v === "feita" || v === "validada"; };

/** O que está feito, por grupo (null: não há tarefa desse ofício no plano). */
export function feitoPorGrupo(p: Plano): Record<Grupo, boolean | null> {
  const acabou = p.estado === "concluída";
  const out = {} as Record<Grupo, boolean | null>;
  for (const g of Object.keys(DE_QUE) as Grupo[]) {
    const ts = p.tasks.filter((t) => DE_QUE[g].test(t.nome));
    out[g] = acabou ? true : ts.length ? ts.every((t) => feita(t, p)) : null;
  }
  return out;
}

export interface Obra3D { cena: Cena; antes: Cena; feitas: number; total: number; nome?: string }
/** A cena do depois com o feito marcado, e a de antes. Null sem projeto do Estúdio no negócio. */
export function obraEm3D(d: Negocio): Obra3D | null {
  const pr = projetoDoNegocio(d.f), p = d.obra.plano;
  if (!pr) return null;
  const depois = cenaDe(pr.depois, pr, true), antes = cenaDe(pr.antes, pr, false);
  if (!p) return { cena: depois, antes, feitas: 0, total: depois.caixas.length, nome: pr.nome };
  const F = feitoPorGrupo(p), acabou = p.estado === "concluída";
  const tipoDe = new Map(pr.depois.pecas.map((pc) => [pc.id, pc.tipo] as const));
  let feitas = 0, total = 0;
  const caixas = depois.caixas.map((c) => {
    const tipo = tipoDe.get(c.id.replace(/-resguardo$/, "")), g = tipo ? GRUPO_DA_PECA[tipo] : undefined;
    if (!g) return c; // portas e janelas: estão lá
    total++;
    const ok = F[g] ?? acabou;
    if (ok) { feitas++; return c; }
    return { ...c, vidro: true, nome: `${c.nome} · por fazer` };
  });
  return {
    cena: { ...depois, caixas, corParede: F.paredes === false ? antes.corParede : depois.corParede, corChao: F.chao === false ? antes.corChao : depois.corChao },
    antes, feitas, total, nome: pr.nome,
  };
}

// ------------------------------------------------------------------ 23/11: o 3D com modelos (o mesmo do passo «3D» do Estúdio)
// Rúben: «o 3D ainda é genérico: caixas cinzentas sem os produtos nem os materiais». O 3D da obra passa a ser o do Estúdio (os modelos,
// os produtos do contrato, o revestimento e o pavimento como materiais), com o mesmo «a cores o feito, transparente o que falta».

/** O que o contrato tem e a planta não desenha como peça (vem de «Mais produtos» das Necessidades): o espelho, a porta e a janela. */
export interface ExtrasDoContrato { espelho?: string; porta?: string; janela?: string }
export function extrasDoContrato(d: Negocio): ExtrasDoContrato {
  const out: ExtrasDoContrato = {};
  for (const x of d.visita.prod ?? []) {
    if (x.cliente || !x.id) continue;
    const n = x.n ?? "";
    if (!out.espelho && /espelho/i.test(n) && !/arm[áa]rio/i.test(n)) out.espelho = x.id;
    else if (!out.porta && /^\s*porta\b/i.test(n) && !/porta[\s-]*(rolos|toalhas|elixir|sab|escovas)/i.test(n)) out.porta = x.id;
    else if (!out.janela && /janela/i.test(n)) out.janela = x.id;
  }
  return out;
}
/** Os extras como pedidos de produtos (para os ler pelo id). */
export function pedidosDosExtras(e: ExtrasDoContrato): PedidoProduto[] {
  return ([["espelho", e.espelho], ["porta", e.porta], ["janela", e.janela]] as const).flatMap(([cat, id]) => (id ? [{ id, cat }] : []));
}
/** Os pedidos com o nome do produto do contrato (os produtos das Necessidades), para os mostrar logo, antes da leitura da base. */
export function comNomesDoContrato(d: Negocio, pedidos: readonly PedidoProduto[]): PedidoProduto[] {
  const nomes = new Map((d.visita.prod ?? []).filter((x) => x.id && x.n).map((x) => [x.id, x.n] as const));
  return pedidos.map((x) => (nomes.has(x.id) ? { ...x, n: nomes.get(x.id) } : x));
}

/** O grupo (o ofício) de cada peça do 3D com modelos: as da planta pelo tipo; o resguardo e a coluna de duche com a base; o espelho do contrato com os móveis. */
function grupoDaPeca3D(id: string, tipoDe: ReadonlyMap<string, TipoPeca>): Grupo | undefined {
  if (id === ID_ESPELHO_CONTRATO) return "moveis";
  const base = id.replace(/-(resguardo|coluna-duche)$/, "");
  const tipo = tipoDe.get(base);
  return tipo ? GRUPO_DA_PECA[tipo] : undefined;
}

export interface Obra3DModelos {
  /** `final`: o projeto todo feito (como vai ficar); `hoje`: com o revestimento e o pavimento só quando feitos. */
  projeto: Projeto; hoje: ResLegado; antes: ResLegado; final: ResLegado; porFazer: Set<string>; feitas: number; total: number;
  /** Os produtos a ler pelo id (as peças, o que vai com elas, os materiais e os extras do contrato). */
  pedidos: PedidoProduto[];
}
/** A obra em 3D com modelos: o depois com os produtos do contrato e o feito marcado (`porFazer`: as peças transparentes), e o antes. */
export function obraEm3DComModelos(d: Negocio): Obra3DModelos | null {
  const pr = projetoDoNegocio(d.f), p = d.obra.plano;
  if (!pr) return null;
  const ex = extrasDoContrato(d), F = p ? feitoPorGrupo(p) : null, acabou = p?.estado === "concluída";
  const hoje = espacoDoEstudio(pr, "depois", {
    semRevestimento: F?.paredes === false, semPavimento: F?.chao === false,
    espelho: produto(ex.espelho), porta: produto(ex.porta), janela: produto(ex.janela),
  });
  const antes = espacoDoEstudio(pr, "antes");
  const tipoDe = new Map(pr.depois.pecas.map((pc) => [pc.id, pc.tipo] as const));
  const porFazer = new Set<string>();
  let feitas = 0, total = 0;
  if (hoje.ok) {
    for (const pc of hoje.espaco.pecas) {
      const g = grupoDaPeca3D(pc.id, tipoDe);
      if (!g) continue;
      total++;
      if (!F) continue; // sem plano: o projeto todo a cores, nada contado como feito
      if (F[g] ?? acabou) feitas++; else porFazer.add(pc.id);
    }
  }
  const final = espacoDoEstudio(pr, "depois", { espelho: produto(ex.espelho), porta: produto(ex.porta), janela: produto(ex.janela) });
  return { projeto: pr, hoje, antes, final, porFazer, feitas, total, pedidos: comNomesDoContrato(d, produtosPedidosDoProjeto(pr, pedidosDosExtras(ex))) };
}
