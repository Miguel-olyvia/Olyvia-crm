// 12/11 (Rúben: «ter também a parte do 3D para ver»). O projeto aprovado no Estúdio do projeto (f.estudio) em 3D, no Estúdio da obra,
// só para consulta, com o que já está feito marcado: a cores o que está feito (as tarefas feitas ou validadas), transparente o que falta.
// As paredes e o chão ficam com a cor de antes enquanto o revestimento e o pavimento não estiverem feitos. Pela tarefa do ofício de cada
// peça (as louças, os móveis, os equipamentos), pelo nome; sem tarefa que lhe corresponda, a peça conta como feita só com a obra acabada.
import type { Negocio, Plano, Tarefa } from "../motor";
import type { TipoPeca } from "../planta";
import { cenaDe } from "@/pages/prototipo-estudio/cenaDoProjeto";
import { projetoDoNegocio } from "@/pages/prototipo-estudio/daVisita";
import type { Cena } from "@/pages/prototipo-estudio/geometria3d";
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
