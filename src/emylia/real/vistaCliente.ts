// Portal do cliente (2/11/2026): a «vista do cliente», o que o ecrã da V1 (PortalCliente.tsx) precisa para desenhar o portal real.
// O cliente não pode ler o Catálogo nem o negócio do CRM (neg_ler_negocios e obra_ler_negocios exigem o CRM). Por isso é o CRM que monta
// a vista, depois de ler e de cada gravação, e a grava na base (neg_vista_cliente_guardar, migration 20270103800000). O portal lê-a
// por portal_neg_vista, que só a dá à conta de portal da pessoa e da organização do negócio.
//
// A vista sai já limpa: o cliente nunca recebe o que não vê no ecrã.
// · Fora: custos e margens (custo por unidade, custo congelado, ofícios e €/h, fornecedores, aprovação da margem), o real da obra, o
//   custo dos materiais das tarefas, as horas registadas e o €/h dos técnicos, os pedidos de correção internos, as notas da equipa,
//   os avisos aos técnicos, o plano antes dos ajustes, o diário de horas e de correções, e o estado da conta do portal.
// · Fica: o que os documentos e o portal mostram (preços de venda, quantidades, prestações, faturas, plano e datas, fotografias e
//   notas dos técnicos, o auto e o relatório). As horas previstas das tarefas ficam, porque o progresso da obra é pesado por elas.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CustoCongelado, Estado, LinhaOrc, MatTarefa, Negocio, Servico, Tarefa } from "../motor";
import type { Adenda, LinhaAdenda } from "../adendas";
import type { Envio } from "../trabalhoObra";
import { sidsDoNegocio } from "./negocioReal";
import { nifEmpresa, nomeEmpresa, nomeFiscalEmpresa } from "../acessosPortal";
import { RESPONSAVEL_OBRA } from "../obraOps";

export const VERSAO_VISTA = 1;

export interface VistaCliente {
  v: typeof VERSAO_VISTA;
  /** O negócio, já limpo. */
  d: Negocio;
  /** Os serviços que o negócio usa, só com o nome, a unidade, o preço de venda, o IVA e as horas previstas. */
  svc: Record<string, Servico>;
  empresa: { nome: string; nif: string; nomeFiscal: string };
  responsavel: { n: string; papel: string; tel: string };
}

const custoZero = (c: CustoCongelado): CustoCongelado => ({ h: c.h, oficios: [], mo: 0, eq: 0, cons: 0, taxaEstr: 0, estr: 0, ajuste: 0, q: c.q });

function limparLinhaOrc(l: LinhaOrc): LinhaOrc {
  if (l.t === "svc") {
    const { cuMan: _m, det, ...r } = l;
    return { ...r, cu: 0, ...(det ? { det: custoZero(det) } : {}) };
  }
  const { prod, ...r } = l;
  return { ...r, custo: 0, ...(prod ? { prod: { custoUn: 0, precoUn: prod.precoUn, q: prod.q } } : {}) };
}

/** Os materiais de uma tarefa: o preço é o de compra e o fornecedor é interno. */
const limparMatTarefa = ({ n, q, un }: MatTarefa): MatTarefa => ({ n, q, un });

/** Na adenda, o preço dos materiais de uma linha livre é o de venda (vai para a proposta da adenda): só sai o fornecedor. */
function limparLinhaAdenda(l: LinhaAdenda): LinhaAdenda {
  const { cu: _c, mo: _m, ...r } = l;
  return { ...r, ...(l.mats ? { mats: l.mats.map(({ forn: _f, produto: _p, ...m }) => m) } : {}) };
}

function limparAdenda(a: Adenda): Adenda {
  const { verif: _v, aprov: _a, ...r } = a;
  return {
    ...r,
    linhas: a.linhas.map(limparLinhaAdenda),
    ...(a.versoes ? { versoes: a.versoes.map((x) => ({ ...x, linhas: x.linhas.map(limparLinhaAdenda) })) } : {}),
  } as Adenda;
}

const limparEnvio = ({ horas: _h, ch: _c, ...e }: Envio): Envio => e;

function limparTarefa(t: Tarefa): Tarefa {
  const { nota: _n, mats, encomendado, exec, ...r } = t;
  return {
    ...r,
    ...(mats ? { mats: mats.map(limparMatTarefa) } : {}),
    ...(encomendado ? { encomendado: encomendado.map(limparMatTarefa) } : {}),
    ...(exec ? {
      exec: (() => {
        const { motivo: _m, ch: _c, envios, ...x } = exec;
        return { ...x, horas: 0, ...(envios ? { envios: envios.filter((e) => e.k !== "correcao").map(limparEnvio) } : {}) };
      })(),
    } : {}),
  };
}

/** O histórico do negócio sem o que é só da equipa (margens, custos, aprovações internas). */
const INTERNO = /margem|custo|lucro|€\s*\/\s*h|aprova(?:ç|c)[aã]o da dire|dire(?:ç|c)[aã]o aprovou|jur[ií]dico/i;

/** O negócio como o cliente o pode receber. */
export function negocioParaCliente(d0: Negocio): Negocio {
  const d = structuredClone(d0);
  delete d.acesso; delete d.valida; delete d.sug;
  d.hist = d.hist.filter((e) => !INTERNO.test(e.t));
  if (d.orc) {
    const o = d.orc;
    o.linhas = o.linhas.map(limparLinhaOrc);
    o.versoes = o.versoes?.map((v) => ({ ...v, ...(v.linhas ? { linhas: v.linhas.map(limparLinhaOrc) } : {}) }));
    o.aprov = null; o.verif = false; o.avisosVistos = {};
    // os artigos e o cálculo do entulho são do orçamento (com custos); a proposta usa as linhas
    delete o.demolicao;
    if (!o.versoes) delete o.versoes;
  }
  if (d.adendas) d.adendas = d.adendas.map(limparAdenda);
  const ob = d.obra;
  ob.real = null;
  ob.aprendido = false;
  if (ob.realFases) ob.realFases = { fases: [], diasPrev: ob.realFases.diasPrev, diasReal: ob.realFases.diasReal, custoPrev: 0, custoReal: 0, preco: 0 };
  if (ob.diario) ob.diario = ob.diario.filter((e) => e.k !== "horas" && e.k !== "correcao");
  if (ob.plano) {
    const { base: _b, avisos: _a, ...p } = ob.plano;
    ob.plano = { ...p, tasks: p.tasks.map(limparTarefa) };
  }
  // a conversa real está na base (negocio_mensagens): a do protótipo não vai
  delete ob.chat;
  return d;
}

/** Os serviços que o negócio usa, sem os custos (o €/h, o equipamento e os consumíveis). */
export function servicosParaCliente(d: Negocio, S: Estado): Record<string, Servico> {
  const r: Record<string, Servico> = {};
  for (const sid of sidsDoNegocio(d)) {
    const s = S.svc[sid];
    if (!s) continue;
    r[sid] = { n: s.n, un: s.un, h: s.h, eh: 0, eq: 0, cons: 0, preco: s.preco, perfil: s.perfil, ...(s.perfilId ? { perfilId: s.perfilId } : {}), ...(s.iva ? { iva: s.iva } : {}) };
  }
  return r;
}

/** A vista do cliente de um negócio (o que neg_vista_cliente_guardar recebe). */
export function vistaDoCliente(d: Negocio, S: Estado): VistaCliente {
  return {
    v: VERSAO_VISTA,
    d: negocioParaCliente(d),
    svc: servicosParaCliente(d, S),
    empresa: { nome: nomeEmpresa(), nif: nifEmpresa(), nomeFiscal: nomeFiscalEmpresa() },
    responsavel: { n: RESPONSAVEL_OBRA.n, papel: RESPONSAVEL_OBRA.papel, tel: RESPONSAVEL_OBRA.tel },
  };
}

/** Só os negócios que o cliente já vê no portal: com a proposta enviada. */
export const temVista = (d: Negocio): boolean => !!d.orc?.enviada;

const LIMITE = 5_500_000;

/** Com fotografias pesadas a vista pode passar do limite da base (6 MB): ficam as fotografias mais recentes que couberem. */
export function caber(v: VistaCliente): VistaCliente {
  let json = JSON.stringify(v);
  if (json.length <= LIMITE) return v;
  const c = structuredClone(v);
  const listas: string[][] = [];
  for (const t of c.d.obra.plano?.tasks ?? []) {
    if (t.exec?.fotos) listas.push(t.exec.fotos);
    for (const e of t.exec?.envios ?? []) if (e.fotos) listas.push(e.fotos);
  }
  for (const e of c.d.obra.diario ?? []) if (e.fotos) listas.push(e.fotos);
  // tira das listas mais antigas primeiro (a ordem do plano e do diário), até caber
  for (const l of listas) {
    l.splice(0, l.length);
    json = JSON.stringify(c);
    if (json.length <= LIMITE) break;
  }
  return c;
}

/** As vistas já gravadas nesta sessão (negócio → o JSON), para não gravar de novo o que não mudou. */
export type VistasGravadas = Map<string, string>;

/** Grava as vistas que mudaram. Devolve os erros (um negócio que falha não impede os outros). */
export async function publicarVistas(
  sb: SupabaseClient, org: string, S: Estado, refs: ReadonlyMap<number, { id: string }>, gravadas: VistasGravadas,
): Promise<string[]> {
  const erros: string[] = [];
  for (const d of S.deals) {
    const ref = refs.get(d.id);
    if (!ref || !temVista(d)) continue;
    const vista = caber(vistaDoCliente(d, S));
    const json = JSON.stringify(vista);
    if (gravadas.get(ref.id) === json) continue;
    const { error } = await sb.rpc("neg_vista_cliente_guardar" as never, { p_org: org, p_negocio_id: ref.id, p_vista: vista } as never);
    if (error) {
      // a base ainda sem a função (migration por aplicar): não há nada a fazer agora
      if (error.code === "PGRST202" || error.code === "42883") return erros;
      erros.push(`${d.id}: ${error.message}`);
      continue;
    }
    gravadas.set(ref.id, json);
  }
  return erros;
}

/* ------------------------------------------------------------------ a receção da obra (o auto assinado no portal) */

/** O que portal_neg_receber_obra gravou (fn_neg_rececao_json). */
export interface RececaoCliente { auto: string; reservas: string | null; nome: string; telemovel: string | null; em: string; id: string }

const doisDig = (n: number) => String(n).padStart(2, "0");
/** "dd/mm/aaaa hh:mm", como as assinaturas do motor. */
export function quandoPt(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return iso;
  return `${doisDig(t.getDate())}/${doisDig(t.getMonth() + 1)}/${t.getFullYear()} ${doisDig(t.getHours())}:${doisDig(t.getMinutes())}`;
}

/** Passa o auto do negócio a assinado com a receção do cliente (no próprio negócio). Devolve se mudou: só um auto por assinar com o
 *  mesmo número muda (o que o motor faz em assinarAuto, mais o registo no histórico). */
export function aplicarRececao(d: Negocio, r: RececaoCliente | null | undefined): boolean {
  const au = d.obra.auto;
  if (!r || !au || au.estado !== "por assinar" || au.n !== r.auto) return false;
  const q = quandoPt(r.em), reservas = r.reservas?.trim() || undefined;
  Object.assign(au, { estado: "assinado", assinado: q, reservas,
    assinatura: { tipo: "sms", nome: r.nome, q, id: r.id, ...(r.telemovel ? { telemovel: r.telemovel } : {}) } });
  d.hist.push({ t: `Auto de receção ${au.n} assinado pelo cliente no portal${reservas ? ", com observações: " + reservas : " · está tudo bem"}`, q, k: reservas ? "w" : "a" });
  return true;
}

/** As receções da organização (neg_rececoes_ler: negócio → receção). Numa base sem a função, nenhuma. */
export async function lerRececoes(sb: SupabaseClient, org: string): Promise<Map<string, RececaoCliente>> {
  const { data, error } = await sb.rpc("neg_rececoes_ler" as never, { p_org: org } as never);
  if (error || !data || typeof data !== "object") return new Map();
  return new Map(Object.entries(data as Record<string, RececaoCliente>));
}

/* ------------------------------------------------------------------ o lado do portal */

/** A vista lida da base, se for uma vista desta versão (com a receção da obra, se o cliente já a assinou). */
export function lerVista(j: unknown): (VistaCliente & { rececao: RececaoCliente | null }) | null {
  const o = j as { vista?: unknown; rececao?: unknown } | null;
  const v = o?.vista as Partial<VistaCliente> | undefined;
  if (!v || v.v !== VERSAO_VISTA || !v.d || typeof v.d !== "object") return null;
  const r = o?.rececao as RececaoCliente | null | undefined;
  return { v: VERSAO_VISTA, d: v.d as Negocio, svc: v.svc ?? {}, empresa: v.empresa ?? { nome: "", nif: "", nomeFiscal: "" },
    responsavel: v.responsavel ?? { n: "", papel: "Responsável de obra", tel: "" },
    rececao: r && typeof r === "object" && typeof r.auto === "string" ? r : null };
}

/** O estado real da proposta e do contrato (o que o cliente acabou de fazer no portal), por cima da vista: a vista só se atualiza
 *  quando alguém da equipa abre ou grava o negócio, e o cliente não pode ficar a ver «Reveja a proposta» depois de a aceitar. */
export function comEstadoReal(d0: Negocio, proposta: string | null | undefined, contrato: string | null | undefined, hoje = new Date()): Negocio {
  const d = structuredClone(d0);
  const o = d.orc;
  if (!o) return d;
  const q = hoje.toLocaleDateString("pt-PT");
  if (proposta === "accepted" && !o.aceite) { o.aceite = q; o.pedidoCliente = null; }
  if (proposta === "rejected" && !o.aceite && !o.recusada) { o.recusada = { motivos: [], q }; d.perdido = true; }
  if (contrato === "signed" || contrato === "active") { if (!o.aceite) o.aceite = q; o.contrato = "assinado"; }
  else if (contrato === "pending_signature" && o.aceite && o.contrato !== "assinado") o.contrato = "enviado";
  return d;
}
