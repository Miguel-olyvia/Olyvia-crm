// CRM (30/10/2026): os papéis do Negócio vêm do RH (migration 20270101340000). Na V1 o papel escolhia-se à mão ("A ver como"); aqui cada
// pessoa do RH tem os seus (cartão "Papéis no Negócio" na ficha) e o Técnico é quem tem cargo técnico de obra. A base aceita as ações pelo
// papel (neg_papeis_permissoes): o Financeiro regista a fatura e valida o pagamento, Compras e armazém aprova a encomenda a fornecedor, o
// Gestor de obra e o Técnico gravam a obra. Quem tem o perfil da Olyvia com pessoas.edit (ou é admin do sistema) continua a ver todos.
import type { SupabaseClient } from "@supabase/supabase-js";
import { PAPEIS, type Papel } from "../motor";
import { PERMS_PAPEL } from "../permissoes";
import { RESPONSAVEL_OBRA, definirViaturaObra } from "../obraOps";
import { definirResponsaveisObra } from "../campos";

export interface MeusPapeis {
  papeis: Papel[];
  /** A pessoa do RH ligada à conta (pessoas_contas). */
  pessoa: { id: string; nome: string } | null;
  /** Vê todos os papéis ("A ver como" completo): admin do sistema ou pessoas.edit pelo perfil da Olyvia. */
  todos: boolean;
}

/** Os papéis que se escolhem no RH (o Técnico vem do cargo). */
export const PAPEIS_RH: readonly Papel[] = ["comercial", "direcao", "financeiro", "armazem", "operacoes", "juridico"];
/** O nome de cada papel, sem a pessoa do exemplo ("Sandra · Financeiro" → "Financeiro"). */
export const ROTULO_PAPEL: Record<Papel, string> = {
  comercial: "Comercial", direcao: "Direção", financeiro: "Financeiro", armazem: "Compras e armazém", operacoes: "Gestor de obra",
  juridico: "Jurídico", tecnico: "Técnico de obra",
};
/** O que cada papel faz no Negócio (o texto do cartão do RH). */
export const FAZ_O_PAPEL: Record<Papel, string> = {
  comercial: "Contacto, visita, orçamento, proposta e contrato.",
  direcao: "Aprova as exceções à margem e vê tudo.",
  financeiro: "Regista a fatura do Eticadata e valida o pagamento.",
  armazem: "Aprova as encomendas a fornecedor e recebe os materiais.",
  operacoes: "Aprova o plano da obra, atribui os técnicos e valida as tarefas.",
  juridico: "Revê as cláusulas do contrato que o cliente pede para mudar.",
  tecnico: "Faz as tarefas da obra que lhe são atribuídas.",
};

const ehPapel = (x: unknown): x is Papel => typeof x === "string" && x in PAPEIS;

/** O que a base devolve (neg_meus_papeis), limpo. */
export function papeisDoLido(data: unknown): MeusPapeis {
  const o = (data && typeof data === "object" ? data : {}) as { papeis?: unknown; pessoa?: { id?: unknown; nome?: unknown } | null; todos?: unknown };
  const papeis = Array.isArray(o.papeis) ? [...new Set(o.papeis.filter(ehPapel))] : [];
  const pessoa = o.pessoa && typeof o.pessoa.id === "string" ? { id: o.pessoa.id, nome: String(o.pessoa.nome ?? "").trim() } : null;
  return { papeis, pessoa, todos: o.todos === true };
}

/** Lê os papéis de quem entrou. Sem a função na base (a migration por aplicar), vê todos como antes. */
export async function lerMeusPapeis(sb: SupabaseClient, org: string): Promise<MeusPapeis> {
  const { data, error } = await sb.rpc("neg_meus_papeis" as never, { p_org: org } as never);
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") return { papeis: [], pessoa: null, todos: true };
    throw new Error(error.message || "Não foi possível ler os seus papéis no Negócio.");
  }
  return papeisDoLido(data);
}

/** Os papéis do "A ver como": todos, ou só os da pessoa (pela ordem do circuito). */
export const papeisPermitidos = (m: MeusPapeis): Papel[] =>
  m.todos ? (Object.keys(PAPEIS) as Papel[]) : (Object.keys(PAPEIS) as Papel[]).filter((p) => m.papeis.includes(p));

/** O papel com que a página abre: o que já estava, se é permitido; senão o primeiro da pessoa (o Técnico só se não tiver outro). */
export function papelInicial(m: MeusPapeis, atual: Papel): Papel | null {
  const P = papeisPermitidos(m);
  if (P.includes(atual)) return atual;
  return P.find((p) => p !== "tecnico") ?? P[0] ?? null;
}

/** O nome de quem faz cada papel: o da pessoa do RH nos papéis dela ("Inês · Financeiro"); nos outros, só o papel. Muda o PAPEIS. */
export function aplicarNomesPapeis(m: MeusPapeis): void {
  const nome = m.pessoa?.nome.split(/\s+/)[0] ?? "";
  for (const p of Object.keys(PAPEIS) as Papel[]) {
    const meu = !!nome && m.papeis.includes(p);
    const iniciais = (meu ? nome : ROTULO_PAPEL[p]).slice(0, 2).toUpperCase();
    PAPEIS[p] = { n: meu ? `${nome} · ${ROTULO_PAPEL[p]}` : ROTULO_PAPEL[p], av: iniciais, nome: meu ? nome : ROTULO_PAPEL[p] };
  }
}

const ORIGINAIS: Record<Papel, (typeof PAPEIS)[Papel]> = Object.fromEntries((Object.keys(PAPEIS) as Papel[]).map((p) => [p, { ...PAPEIS[p] }])) as Record<Papel, (typeof PAPEIS)[Papel]>;
/** 30/10: os papéis que quem entrou pode escolher no "A ver como" (null: todos, como na V1). Os ecrãs que oferecem "mudar para o
 *  Financeiro" só o oferecem a quem o pode ser. */
let escolhiveis: Papel[] | null = null;
export const definirPapeisEscolhiveis = (L: Papel[] | null): void => { escolhiveis = L; };
export const podeVerComo = (p: Papel): boolean => !escolhiveis || escolhiveis.includes(p);
/** "Só o Financeiro" na Olyvia; "Só o Financeiro ou a Direção" na V1. */
export const quemFatura = (): string => (PERMS_PAPEL.direcao.includes("*") ? "Só o Financeiro ou a Direção" : "Só o Financeiro");

/** 30/10 (20270101380000): o responsável de obra é o Gestor de obra do RH (neg_gestores_obra), e não o "Filipe Rocha" do exemplo; sem
 *  nenhum no RH, "o Gestor de obra" e sem telefone. null: volta ao do exemplo. */
const RESPONSAVEL_V1 = { ...RESPONSAVEL_OBRA };
export function definirResponsavelObra(g: { nome: string; telefone: string | null } | null | undefined): void {
  if (g === null) { Object.assign(RESPONSAVEL_OBRA, RESPONSAVEL_V1); return; }
  Object.assign(RESPONSAVEL_OBRA, { n: g?.nome?.trim() || "o Gestor de obra", papel: "Gestor de obra", tel: g?.telefone?.trim() ?? "" });
}
export interface GestorObra { nome: string; telefone: string | null }
/** Os Gestores de obra do RH (neg_gestores_obra). Sem a função ou com erro, nenhum. */
export async function lerGestoresObra(sb: SupabaseClient, org: string): Promise<GestorObra[]> {
  const { data, error } = await sb.rpc("neg_gestores_obra" as never, { p_org: org } as never);
  if (error || !Array.isArray(data)) return [];
  return (data as { nome?: string; telefone?: string | null }[]).filter((g) => !!g.nome?.trim()).map((g) => ({ nome: g.nome!.trim(), telefone: g.telefone ?? null }));
}
/** O primeiro (o do Hoje do técnico, da obra e do auto). */
export const lerGestorObra = async (sb: SupabaseClient, org: string): Promise<GestorObra | undefined> => (await lerGestoresObra(sb, org))[0];
/** 30/10: o responsável de obra (o do Hoje do técnico) e a lista de "Preparar a obra" vêm dos Gestores de obra do RH. */
export function aplicarGestoresObra(L: readonly GestorObra[]): void {
  definirResponsavelObra(L[0]);
  definirResponsaveisObra(L.map((g) => g.nome));
}

const DIRECAO_V1 = PERMS_PAPEL.direcao;
/** Na Olyvia, a fatura e o pagamento são só do Financeiro (a base também o exige: neg_papeis_permissoes); na V1 a Direção tinha tudo.
 *  A Direção fica com o resto (aprovar a margem, anular, a equipa). */
export function aplicarPermissoesReais(): void {
  PERMS_PAPEL.direcao = ["contracts.cancel", "equipa.edit", "margin.approve"];
  // a Frota ainda não está ligada às obras na Olyvia: sem a carrinha do exemplo
  definirViaturaObra(null);
}
/** Volta aos nomes e às permissões do protótipo (ao sair da página). */
export function reporNomesPapeis(): void {
  for (const p of Object.keys(ORIGINAIS) as Papel[]) PAPEIS[p] = { ...ORIGINAIS[p] };
  PERMS_PAPEL.direcao = DIRECAO_V1;
  escolhiveis = null;
  definirResponsavelObra(null);
  definirResponsaveisObra(null);
  definirViaturaObra(undefined);
}
