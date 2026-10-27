// O arranque (/arranque no plano de 06/10, etapa 5): cinco perguntas com escolhas (setor, serviços,
// n.º de pessoas, como cobra, empresas) e o que fica aplicado. Regras puras, sem React.
import type { Papel } from "../motor";
import { AREA, ESCOLHAS, EXTERIOR, INTERIOR, camposAjustados } from "../campos";
import { RESUMO_SETOR, SETORES_V2, type Termos } from "./setoresV2";

export type Pessoas = "so_eu" | "2a5" | "6a15" | "mais15";
export type Cobranca = "obra" | "hora" | "mes" | "contrato";
export type Empresas = "uma" | "varias";

export interface Respostas { setor?: string; servicos: string[]; pessoas?: Pessoas; cobra?: Cobranca; empresas?: Empresas }
export const SEM_RESPOSTAS: Respostas = { servicos: [] };

export const OPCOES_PESSOAS: { id: Pessoas; nome: string }[] = [
  { id: "so_eu", nome: "Só eu" }, { id: "2a5", nome: "2 a 5" }, { id: "6a15", nome: "6 a 15" }, { id: "mais15", nome: "Mais de 15" },
];
export const OPCOES_COBRA: { id: Cobranca; nome: string }[] = [
  { id: "obra", nome: "Por obra" }, { id: "hora", nome: "Por hora" }, { id: "mes", nome: "Por mês" }, { id: "contrato", nome: "Por contrato" },
];
export const OPCOES_EMPRESAS: { id: Empresas; nome: string }[] = [{ id: "uma", nome: "Uma empresa" }, { id: "varias", nome: "Duas ou mais" }];

/** Os serviços que se podem escolher para um setor (as linhas de serviço do modelo). */
export const servicosDoSetor = (setor: string | undefined): string[] => (setor ? RESUMO_SETOR[setor]?.linhas ?? [] : []);

/** Mudar de setor limpa os serviços que não são desse setor. */
export function escolherSetor(r: Respostas, setor: string): Respostas {
  const ok = servicosDoSetor(setor);
  return { ...r, setor, servicos: r.servicos.filter((s) => ok.includes(s)) };
}
export function alternarServico(r: Respostas, s: string): Respostas {
  return { ...r, servicos: r.servicos.includes(s) ? r.servicos.filter((x) => x !== s) : [...r.servicos, s] };
}

/** Os perfis que ficam ativos pelo tamanho da equipa (numa equipa de uma pessoa, a Direção faz tudo). */
export function perfisPorPessoas(p: Pessoas): Papel[] {
  if (p === "so_eu") return ["direcao"];
  if (p === "2a5") return ["comercial", "direcao", "operacoes"];
  if (p === "6a15") return ["comercial", "direcao", "financeiro", "operacoes"];
  return ["comercial", "direcao", "financeiro", "armazem", "operacoes"];
}

export interface Plano {
  setor: string;
  nomeSetor: string;
  termos: Termos;
  servicos: string[];
  margem: { min: number; alvo: number };
  perfis: Papel[];
  campos: { novos: number; escondidos: number; gruposEscondidos: number };
  notas: string[];
}

/** O que falta responder (pela ordem das perguntas). */
export function emFalta(r: Respostas): string[] {
  const f: string[] = [];
  if (!r.setor) f.push("o setor");
  if (!r.servicos.length) f.push("pelo menos um serviço");
  if (!r.pessoas) f.push("quantas pessoas são");
  if (!r.cobra) f.push("como cobra");
  if (!r.empresas) f.push("quantas empresas");
  return f;
}

/** O que se vai aplicar com estas respostas; null enquanto faltar alguma. */
export function planoArranque(r: Respostas): Plano | null {
  if (emFalta(r).length) return null;
  const s = SETORES_V2.find((x) => x.id === r.setor);
  const res = RESUMO_SETOR[r.setor!];
  if (!s || !res) return null;
  const grupos = [EXTERIOR, INTERIOR, AREA, ESCOLHAS];
  const novos = grupos.reduce((n, g) => n + (s.cfg[g.titulo]?.novos?.length ?? 0), 0);
  const escondidos = grupos.reduce((n, g) => n + camposAjustados(s.cfg, g).filter((c) => c.escondido).length, 0);
  const gruposEscondidos = grupos.filter((g) => s.cfg[g.titulo]?.oculto).length;
  const notas: string[] = [];
  if (r.cobra === "mes" || r.cobra === "contrato") notas.push("Faturação recorrente: uma fatura por mês para cada contrato.");
  if (r.cobra === "hora") notas.push("O orçamento conta as horas do técnico, sem preço fechado por obra.");
  if (OPCOES_COBRA.find((o) => o.id === r.cobra)?.nome !== res.cobra)
    notas.push(`O modelo ${s.nome} costuma cobrar ${res.cobra.toLowerCase()}; fica como escolheu.`);
  if (r.empresas === "varias") notas.push("Cada empresa fica com o seu email, a sua numeração e os seus modelos de documentos.");
  if (r.pessoas === "so_eu") notas.push("Uma só conta, com o perfil Direção: vê e faz tudo.");
  return {
    setor: s.id, nomeSetor: s.nome, termos: res.termos, servicos: [...r.servicos], margem: res.margem,
    perfis: perfisPorPessoas(r.pessoas!), campos: { novos, escondidos, gruposEscondidos }, notas,
  };
}
