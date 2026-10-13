// As perguntas que os clientes deixam no portal (V2, 13/10/2026; docs/melhorias-v2-2026-10-13, 4.1, "Média E").
// Na app real chegam como notificação no sino ("Mensagem do cliente", TopHeader.tsx) e o contacto resolve-se pela entidade do
// documento. Aqui são DADOS DE EXEMPLO, ligados aos negócios da seed; o contacto vem do negócio (o email e o telefone).
// Funções puras: só leem. As respostas guardam-se em memória em hojeV2Store.ts.
import type { Estado, Papel } from "../motor";

export type CanalResposta = "Email" | "WhatsApp";
export const CANAIS: readonly CanalResposta[] = ["Email", "WhatsApp"];

export interface PerguntaCliente {
  id: string;
  cliente: string;
  /** O negócio da seed (para o contacto e para abrir a página). */
  dealId: number;
  negocio: string;
  /** De onde veio: a página do portal onde o cliente escreveu. */
  origem: string;
  texto: string;
  /** Há quantos minutos chegou (para ordenar e para o texto "há 2 h"). */
  minutos: number;
}

/** As perguntas de exemplo (o "hoje" do protótipo). Cada uma é de um negócio da seed com proposta, contrato ou obra. */
export const PERGUNTAS_EXEMPLO: readonly PerguntaCliente[] = [
  {
    id: "pc1", cliente: "Carla Nunes", dealId: 1031, negocio: "Cozinha", origem: "Portal do cliente · Proposta",
    texto: "Boa tarde. A bancada em pedra que está na proposta é em granito ou em quartzo? E o preço já inclui a retirada da bancada antiga?",
    minutos: 95,
  },
  {
    id: "pc2", cliente: "Sérgio Pinto", dealId: 1030, negocio: "WC", origem: "Portal do cliente · Proposta",
    texto: "Olá, se aceitar esta semana conseguem começar ainda em outubro? Trabalho por turnos e preciso de saber para organizar a casa.",
    minutos: 240,
  },
  {
    id: "pc3", cliente: "Marta Lima", dealId: 1022, negocio: "WC", origem: "Portal do cliente · Obra",
    texto: "Bom dia. Amanhã preciso de sair às 8h. Os senhores da obra têm a chave ou deixo com a vizinha do 2.º Esq.?",
    minutos: 20,
  },
];

/** As respostas rápidas: escolhe-se uma e envia-se (2 cliques). "Escrever outra" pede um texto curto. */
export interface ModeloResposta { id: string; nome: string; texto: (p: PerguntaCliente) => string }
export const MODELOS_RESPOSTA: readonly ModeloResposta[] = [
  { id: "confirmo", nome: "Vou confirmar e respondo hoje", texto: (p) => `Olá ${primeiroNome(p.cliente)}, obrigado pela pergunta. Vou confirmar com a equipa e respondo-lhe ainda hoje.` },
  { id: "ligar", nome: "Ligo-lhe para explicar", texto: (p) => `Olá ${primeiroNome(p.cliente)}, é mais fácil explicar ao telefone: ligo-lhe amanhã de manhã. Se preferir outra hora, diga-me.` },
  { id: "incluido", nome: "Sim, está incluído", texto: (p) => `Olá ${primeiroNome(p.cliente)}, sim, está incluído no que lhe enviámos. Qualquer outra dúvida, estou por aqui.` },
];
export const OUTRA = "outra";
export const MAX_TEXTO = 280;

export const primeiroNome = (nome: string): string => nome.trim().split(/\s+/)[0] ?? nome;

/** "há 20 min", "há 1 h 35 min", "há 4 h". */
export function haQuanto(minutos: number): string {
  if (minutos < 60) return `há ${minutos} min`;
  const h = Math.floor(minutos / 60), m = minutos % 60;
  return m ? `há ${h} h ${m} min` : `há ${h} h`;
}

/** Quem vê as perguntas no Hoje: o Comercial (que responde) e a Direção. */
export const vePerguntas = (r: Papel): boolean => r === "comercial" || r === "direcao";

export interface ContactoCliente { email: string | null; tel: string | null; preferido: CanalResposta | null }

/** O contacto do cliente, já resolvido a partir do negócio: o email e o telefone (para o WhatsApp), e o canal preferido. */
export function contactoDe(S: Estado, p: PerguntaCliente): ContactoCliente {
  const d = S.deals.find((x) => x.id === p.dealId);
  const email = d?.f.email?.trim() || null, tel = d?.tel?.trim() || null;
  const pref = d?.f.pref === "WhatsApp" && tel ? "WhatsApp" : d?.f.pref === "Email" && email ? "Email" : null;
  return { email, tel, preferido: pref ?? (email ? "Email" : tel ? "WhatsApp" : null) };
}

/** O destino do canal ("carla.nunes@exemplo.pt" ou "938 101 777"), ou null se o cliente não o tem. */
export const destinoDe = (c: ContactoCliente, canal: CanalResposta): string | null => (canal === "Email" ? c.email : c.tel);

/** O texto que se envia: o do modelo escolhido, ou o escrito (aparado). Null se ainda não há. */
export function textoResposta(p: PerguntaCliente, modelo: string | null, escrito: string): string | null {
  if (!modelo) return null;
  if (modelo === OUTRA) { const t = escrito.trim(); return t ? t.slice(0, MAX_TEXTO) : null; }
  const m = MODELOS_RESPOSTA.find((x) => x.id === modelo);
  return m ? m.texto(p) : null;
}

/** O que falta para enviar (vazio: pode enviar-se). */
export function faltaEnviar(c: ContactoCliente, canal: CanalResposta | null, texto: string | null): string[] {
  const f: string[] = [];
  if (!canal) f.push("Escolha o canal.");
  else if (!destinoDe(c, canal)) f.push(canal === "Email" ? "O cliente não tem email: responda por WhatsApp." : "O cliente não tem telefone: responda por email.");
  if (!texto) f.push("Escolha uma resposta ou escreva uma.");
  return f;
}

/** As perguntas por responder do papel, das mais recentes para as mais antigas. As respondidas saem da lista. */
export function perguntasPorResponder(r: Papel, respondidas: readonly string[], todas: readonly PerguntaCliente[] = PERGUNTAS_EXEMPLO): PerguntaCliente[] {
  if (!vePerguntas(r)) return [];
  return todas.filter((p) => !respondidas.includes(p.id)).sort((a, b) => a.minutos - b.minutos);
}
