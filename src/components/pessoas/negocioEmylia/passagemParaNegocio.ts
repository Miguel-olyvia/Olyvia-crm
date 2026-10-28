// A passagem Visita → Negócio, dentro da mesma ficha: quando o levantamento do CRM fica fechado, o negócio passa a ser da Emylia (negocios.fase = 3,
// Orçamento). Quem chama corre isto por `armazem.run`, que grava pelo caminho do Ben (neg_guardar_negocio); aqui só se muda o negócio em memória.
//
// O que se leva do CRM, sem adivinhar:
//  - já vai pela base (neg_ler_negocios lê-o do negócio do CRM): nome, telefone, morada da obra, origem, serviço pedido;
//  - vai aqui: o pedido do cliente (`f.pedido`) e o email (`f.email`), só se a Emylia ainda não os tem;
//  - fica como REFERÊNCIA no histórico do negócio (que se grava): quantas chamadas, visitas e levantamentos o CRM tem.
// O orçamento começa vazio: as medidas e os serviços da Emylia não se inventam a partir do levantamento do CRM (as unidades e a estrutura são outras).
// Não passa pelos gates do «Fechar levantamento» da Emylia: o levantamento que fecha aqui é o do CRM.
import { criarOrc, type Estado, type Negocio } from "@/emylia/motor";

const FASE_NEGOCIO = 3;

export interface DadosDaAbordagem {
  pedidoCliente: string;
  email: string;
  chamadas: number;
  visitas: number;
  levantamentos: number;
}

/** O negócio já está no Negócio ou depois: é da Emylia. */
export const jaEDaEmylia = (d: Negocio): boolean => d.fase >= FASE_NEGOCIO;

const dois = (n: number): string => String(n).padStart(2, "0");
const agora = (): string => { const h = new Date(); return `hoje ${dois(h.getHours())}:${dois(h.getMinutes())}`; };
const contado = (n: number, um: string, varios: string): string => `${n} ${n === 1 ? um : varios}`;

export function passarParaNegocio(d: Negocio, S: Estado, dados: DadosDaAbordagem): void {
  if (jaEDaEmylia(d) || d.perdido) return;
  const pedido = dados.pedidoCliente.trim(), email = dados.email.trim();
  if (pedido && !d.f.pedido) d.f.pedido = pedido;
  if (email && !d.f.email) d.f.email = email;
  d.visita.fechada = true;
  d.orc = criarOrc(d, S);
  d.fase = FASE_NEGOCIO;
  d.valida = null;
  const q = agora();
  const doCrm = [contado(dados.chamadas, "chamada", "chamadas"), contado(dados.visitas, "visita", "visitas"), contado(dados.levantamentos, "levantamento", "levantamentos")].join(", ");
  d.hist = [
    { t: `Levantamento fechado no CRM: o negócio passa ao Orçamento`, q, k: "a" },
    { t: `Do CRM, para consulta: ${doCrm}`, q, k: "a" },
    ...d.hist,
  ];
}
