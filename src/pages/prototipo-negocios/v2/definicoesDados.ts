// Os dados das Definições da V2 que o motor não tem (termos, nomes das fases, margens por linha,
// taxas de deslocação, modelos, email, equipa e Lixo). Vivem SÓ em memória, numa store de módulo
// lida com useSyncExternalStore (como o diaADia.ts): duram até recarregar a página e não tocam no
// Estado, no seed() nem na VERSAO. As margens da empresa, a estrutura e o aspeto continuam no motor.
// Tudo de exemplo.
import { useSyncExternalStore } from "react";
import { FASES, type Papel } from "../motor";
import type { Termos } from "./setoresV2";

export interface MargemLinha { linha: string; min: number; alvo: number }
export interface Deslocacao { zona: string; valor: number }
export interface Modelo { id: string; nome: string; usado: string }
export interface Smtp { servidor: string; porta: number; seguranca: "TLS" | "SSL" | "Nenhuma"; remetente: string; estado: "ligado" | "por testar" }
export interface Falha { id: number; para: string; assunto: string; quando: string; motivo: string }
export interface Utilizador { id: number; nome: string; email: string; perfil: Papel }
export type TipoLixo = "Negócio" | "Pessoa" | "Orçamento" | "Documento" | "Tarefa";
export interface ItemLixo { id: number; tipo: TipoLixo; nome: string; quando: string; por: string }

export interface DadosDefinicoes {
  termos: Termos;
  nomesFases: string[];
  margensLinha: MargemLinha[];
  deslocacao: Deslocacao[];
  modelosOrc: Modelo[];
  propostas: Modelo[];
  contratos: Modelo[];
  emails: Modelo[];
  smtp: Smtp;
  falhas: Falha[];
  utilizadores: Utilizador[];
  lixo: ItemLixo[];
}

export function dadosIniciais(): DadosDefinicoes {
  return {
    termos: { cliente: "Cliente", local: "Local", obra: "Obra" },
    nomesFases: [...FASES],
    margensLinha: [{ linha: "Casa de banho", min: 28, alvo: 35 }, { linha: "Cozinha", min: 30, alvo: 36 }],
    deslocacao: [{ zona: "Até 15 km", valor: 0 }, { zona: "15 a 30 km", valor: 25 }, { zona: "Mais de 30 km", valor: 45 }],
    modelosOrc: [
      { id: "o1", nome: "WC com base de duche", usado: "Casa de banho" },
      { id: "o2", nome: "Cozinha linear", usado: "Cozinha" },
      { id: "o3", nome: "PDF do orçamento · Mudelar", usado: "Todos os orçamentos" },
    ],
    propostas: [
      { id: "p1", nome: "Proposta · remodelação", usado: "Casa de banho e Cozinha" },
      { id: "p2", nome: "Proposta · venda direta", usado: "Venda direta" },
    ],
    contratos: [
      { id: "c1", nome: "Contrato de empreitada", usado: "Negócios com obra" },
      { id: "c2", nome: "Adenda de trabalhos a mais", usado: "Obras em curso" },
    ],
    emails: [
      { id: "e1", nome: "Envio da proposta", usado: "Fase Negócio" },
      { id: "e2", nome: "Confirmação da visita", usado: "Fase Contacto" },
      { id: "e3", nome: "Lembrete de pagamento", usado: "Fase Financeiro" },
    ],
    smtp: { servidor: "smtp.mudelar.pt", porta: 587, seguranca: "TLS", remetente: "geral@mudelar.pt", estado: "ligado" },
    falhas: [
      { id: 1, para: "carla.nunes@exemplo.pt", assunto: "Proposta · Casa de banho", quando: "ontem, 18:02", motivo: "Caixa do destinatário cheia" },
      { id: 2, para: "joao.reis@exemplo", assunto: "Confirmação da visita", quando: "seg 12/10, 10:15", motivo: "Endereço inválido" },
    ],
    utilizadores: [
      { id: 1, nome: "Rúben", email: "ruben@mudelar.pt", perfil: "comercial" },
      { id: 2, nome: "Direção", email: "direcao@mudelar.pt", perfil: "direcao" },
      { id: 3, nome: "Sandra", email: "sandra@mudelar.pt", perfil: "financeiro" },
      { id: 4, nome: "Nuno", email: "nuno@mudelar.pt", perfil: "armazem" },
      { id: 5, nome: "Filipe", email: "filipe@mudelar.pt", perfil: "operacoes" },
    ],
    lixo: [
      { id: 1, tipo: "Negócio", nome: "Cozinha · Rui Lopes", quando: "há 2 dias", por: "Rúben" },
      { id: 2, tipo: "Pessoa", nome: "Marta Silva (repetida)", quando: "há 3 dias", por: "Rúben" },
      { id: 3, tipo: "Orçamento", nome: "Orçamento 2026-118 · versão 1", quando: "há 5 dias", por: "Rúben" },
      { id: 4, tipo: "Documento", nome: "Fotografias da visita (3)", quando: "há 1 semana", por: "Filipe" },
      { id: 5, tipo: "Tarefa", nome: "Ligar ao fornecedor de louças", quando: "há 2 semanas", por: "Nuno" },
      { id: 6, tipo: "Negócio", nome: "Casa de banho · Teste", quando: "há 3 semanas", por: "Direção" },
    ],
  };
}

/** Os perfis fixos e o que cada um pode fazer, em frases simples. */
export const PERFIS: { id: Papel; nome: string; faz: string; naoFaz: string }[] = [
  { id: "comercial", nome: "Comercial", faz: "Leads, negócios, visitas, orçamentos e propostas.", naoFaz: "Não aprova margens abaixo do mínimo nem vê custos de pessoal." },
  { id: "direcao", nome: "Direção", faz: "Tudo, incluindo aprovar margens, a equipa e as Definições.", naoFaz: "Nada fica de fora." },
  { id: "financeiro", nome: "Financeiro", faz: "Faturas, pagamentos, recibos e relatórios de valores.", naoFaz: "Não mexe em orçamentos nem no Catálogo." },
  { id: "armazem", nome: "Armazém", faz: "Inventário, encomendas a fornecedores e receções.", naoFaz: "Não vê negócios nem valores de venda." },
  { id: "operacoes", nome: "Operações", faz: "Obras, planeamento, técnicos e materiais da obra.", naoFaz: "Não vê margens nem propostas." },
];

export const TIPOS_LIXO: TipoLixo[] = ["Negócio", "Pessoa", "Orçamento", "Documento", "Tarefa"];

let dados: DadosDefinicoes = dadosIniciais();
const ouvintes = new Set<() => void>();
const avisar = (): void => { for (const fn of ouvintes) fn(); };

export const lerDefinicoes = (): DadosDefinicoes => dados;
export function subscreverDefinicoes(fn: () => void): () => void {
  ouvintes.add(fn);
  return () => { ouvintes.delete(fn); };
}
/** Muda os dados: a função recebe uma cópia e devolve-a (ou nada); cria sempre um objeto novo. */
export function mudarDefinicoes(fn: (d: DadosDefinicoes) => void): void {
  const novo = structuredClone(dados);
  fn(novo);
  dados = novo;
  avisar();
}
/** Volta aos dados de exemplo (Repor a demonstração). */
export function esquecerDefinicoes(): void {
  dados = dadosIniciais();
  avisar();
}

export const useDefinicoes = (): DadosDefinicoes => useSyncExternalStore(subscreverDefinicoes, lerDefinicoes, lerDefinicoes);

/* As ações (puras sobre a cópia) */
export const restaurar = (id: number): void => mudarDefinicoes((d) => { d.lixo = d.lixo.filter((x) => x.id !== id); });
export const reenviar = (id: number): void => mudarDefinicoes((d) => { d.falhas = d.falhas.filter((x) => x.id !== id); });
