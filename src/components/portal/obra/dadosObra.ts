// O documento da obra no portal do cliente (19/11/2026): os dados dos blocos que o documento do template (a proposta, e o contrato
// em /contracts/:id) mostra quando o negócio tem a vista do cliente (portal_neg_vista). As regras são as da Emylia
// (src/emylia/propostaDados.ts, planoObra.ts, propostaConteudo.ts): aqui só se juntam, a partir da vista, sem React e sem idioma.
// Serve a vista web e, numa segunda fase, o PDF (as mesmas funções, outro componente de apresentação).
import { acoes, seed, totaisIva, type Estado, type Negocio } from "@/emylia/motor";
import { aplicarRececao, aplicarResposta, comEstadoReal, type RececaoCliente, type RespostaCliente, type VistaCliente } from "@/emylia/real/vistaCliente";
import type { FaseProposta, Fornecido } from "@/emylia/propostaConteudo";
import {
  adendasDoContrato, conteudoPorFase, dadosDasClausulas, materiaisDaProposta, modeloDaObra, planeamentoDaObra, prazoDaProposta,
  prestacoesDaProposta, validadeDaProposta, type AdendaAnexa, type ClausulasDados, type EscolhaCliente, type ItemMaterial, type Planeamento,
  type PrestacaoDoc,
} from "@/emylia/propostaDados";

/** A vista como o portal a lê (lerVista): com a receção e as respostas do cliente ainda por aplicar pelo CRM. */
export type VistaDoPortal = VistaCliente & { rececao?: RececaoCliente | null; respostas?: RespostaCliente[] };

/** O estado real da proposta e do contrato (os da base), por cima da vista. */
export interface EstadoDosDocs { proposta?: string | null; contrato?: string | null }

/** O Estado mínimo do motor para este negócio: só ele e os serviços que usa, com o que o cliente já fez por cima (o estado real dos
 *  documentos, a receção e as respostas por aplicar). É o que ClientPortalNegocio.tsx faz (estadoDoCliente) para o ecrã da V1. */
export function estadoDaVista(v: VistaDoPortal, docs: EstadoDosDocs = {}): Estado {
  const S = seed();
  const d = comEstadoReal(v.d, docs.proposta, docs.contrato);
  aplicarRececao(d, v.rececao ?? null);
  S.deals = [d]; S.clientes = []; S.svc = v.svc as Estado["svc"]; S.deal = d.id; S.semExemplos = true;
  const A = acoes(S, () => {}, (fn) => fn());
  for (const r of v.respostas ?? []) aplicarResposta(d, A, r);
  return S;
}

/** Os blocos da proposta: 01 O que vamos fazer, 02 Materiais e escolhas, 04 Planeamento, 05 Pagamento, 06 Condições, 07 Aceitação. */
export interface PropostaObra {
  /** 01: o pedido do cliente (texto dele) ou, sem ele, o modelo da obra; as fases com os grupos. */
  pedido: string | null; modelo: string; fases: FaseProposta[];
  /** 02 */
  materiais: { mats: ItemMaterial[]; escolhidos: ItemMaterial[]; fornecidos: Fornecido[]; escolhas: EscolhaCliente[]; nec: string[] };
  /** 04: null sem plano (sem tarefas com dias). */
  planeamento: Planeamento | null;
  /** 05: as prestações, com o valor com IVA (a última fecha o total ao cêntimo). */
  prestacoes: PrestacaoDoc[]; total: number;
  /** 06: o prazo em dias úteis; a garantia escrita na proposta (null: a de omissão); até quando é válida; as notas para o cliente. */
  condicoes: { prazo: number; garantia: string | null; validaAte: Date; notas: string | null };
  /** 07: quem assina pela empresa e o cliente; a data da aceitação (texto, como o motor a guarda), se já aceitou. */
  aceitacao: { empresa: string; comercial: string | null; cliente: string; aceite: string | null };
}

export interface OpcoesProposta {
  docs?: EstadoDosDocs;
  /** A validade da proposta do template (valid_until): manda sobre a calculada a partir da vista, para o documento não ter duas datas. */
  validaAte?: string | null;
  comercial?: string | null;
}

const negocioDe = (S: Estado): Negocio | null => S.deals[0] ?? null;

/** Os dados dos blocos da proposta, a partir da vista; null sem vista ou sem orçamento. */
export function propostaDaVista(v: VistaDoPortal | null | undefined, op: OpcoesProposta = {}): PropostaObra | null {
  if (!v?.d?.orc) return null;
  const S = estadoDaVista(v, op.docs);
  const d = negocioDe(S);
  if (!d?.orc) return null;
  const T = totaisIva(d, S);
  const validaAte = op.validaAte ? new Date(op.validaAte) : null;
  return {
    pedido: d.f.pedido?.trim() || null, modelo: modeloDaObra(d), fases: conteudoPorFase(d, S),
    materiais: materiaisDaProposta(d, S),
    planeamento: planeamentoDaObra(d, S),
    prestacoes: prestacoesDaProposta(d, T.total, S), total: T.total,
    condicoes: {
      prazo: prazoDaProposta(d, S), garantia: d.f.garantia || null,
      validaAte: validaAte && !Number.isNaN(validaAte.getTime()) ? validaAte : validadeDaProposta(d).ate,
      notas: d.f.notas_cliente?.trim() || null,
    },
    aceitacao: { empresa: v.empresa.nome, comercial: op.comercial ?? null, cliente: d.f.nome_fiscal || d.nome, aceite: d.orc.aceite ?? null },
  };
}

/** As cláusulas do negócio e as adendas assinadas, para o contrato. */
export interface ContratoObra {
  clausulas: ClausulasDados;
  adendas: { adendas: AdendaAnexa[]; contrato: number; somaAdendas: number; total: number } | null;
}

/** Os dados das cláusulas e das adendas do contrato, a partir da vista; null sem vista ou sem orçamento. */
export function contratoDaVista(v: VistaDoPortal | null | undefined, docs: EstadoDosDocs = {}): ContratoObra | null {
  if (!v?.d?.orc) return null;
  const S = estadoDaVista(v, docs);
  const d = negocioDe(S);
  if (!d?.orc) return null;
  return { clausulas: dadosDasClausulas(d, S), adendas: adendasDoContrato(d, S) };
}
