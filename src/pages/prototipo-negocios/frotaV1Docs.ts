// A Frota no V1 (16/10/2026): o que há para fazer, viatura a viatura, numa só lista; e a ficha da viatura numa página.
// Só lógica, sem React. Reaproveita as regras e as ações da Frota do Rafael (frota/regras.ts, frota/acoes.ts) sem as mudar:
// aqui só se decide o que é mais urgente e como se diz.
import { HOJE, addDias, addMeses, dias, fData, fEur, fKm, fNum } from "./frota/base";
import {
  ESTADOS, VENC, ativa, condutor, custoKm, custoKmMedio, custoTotal, multasPend, pessoa, prazoMulta, quemConduzia, revisao, textoData, tomData, compromissos,
} from "./frota/regras";
import type { ChaveVenc, Frota, Viatura } from "./frota/tipos";

/** O que se faz numa tarefa: cada uma tem a sua ação (gravar* de frota/acoes.ts). */
export type AcaoTarefa =
  | { tipo: "renovar"; k: ChaveVenc }
  | { tipo: "revisao" }
  | { tipo: "concluir"; mid: string }
  | { tipo: "identificar"; oid: string };

export interface TarefaFrota {
  id: string;
  vid: string;
  /** "AA-12-BB · Renault Kangoo" */
  viatura: string;
  /** A frase do que fazer: "Renovar o seguro". */
  t: string;
  /** Porquê, em palavras: "Venceu há 3 dias." */
  sub: string;
  urgente: boolean;
  /** Dias até ao prazo (negativo: já passou). Ordena a lista. */
  prazo: number;
  /** O texto do botão (infinitivo com objeto, E3). */
  btn: string;
  acao: AcaoTarefa;
}

export const nomeViatura = (v: Viatura): string => `${v.mat} · ${v.marca} ${v.modelo}`;
const ARTIGO: Record<ChaveVenc, string> = { seguro: "o seguro", ipo: "a inspeção (IPO)", iuc: "o IUC" };

function quando(d: number): string {
  if (d < 0) return `Passou há ${-d} ${-d === 1 ? "dia" : "dias"}.`;
  if (d === 0) return "É hoje.";
  return `Faltam ${d} ${d === 1 ? "dia" : "dias"}.`;
}

/** Todas as tarefas da frota, da mais urgente para a menos (só viaturas ativas). */
export function tarefasFrota(F: Frota, vid?: string): TarefaFrota[] {
  const L: TarefaFrota[] = [];
  for (const v of F.viaturas) {
    if (vid && v.id !== vid) continue;
    if (!ativa(v)) continue;
    const nome = nomeViatura(v);
    // manutenções agendadas cujo dia chegou: dar como feitas
    const agendadas = F.manut.filter((m) => m.vid === v.id && m.estado !== "concluída");
    for (const m of agendadas) {
      const d = dias(m.data);
      if (d <= 0) L.push({ id: "c-" + m.id, vid: v.id, viatura: nome, t: `Dar como feita: ${m.tipo.toLowerCase()}`, sub: `Estava marcada para ${fData(m.data)} na ${m.oficina}.`, urgente: true, prazo: d, btn: "Dar como feita", acao: { tipo: "concluir", mid: m.id } });
    }
    // documentos vencidos ou a vencer em 30 dias (a inspeção já marcada não pede renovação: faz-se ao concluir)
    for (const k of Object.keys(VENC) as ChaveVenc[]) {
      const data = v.venc[k], tom = tomData(data);
      if (tom !== "bad" && tom !== "warn") continue;
      if (k === "ipo" && agendadas.some((m) => /IPO|inspe/i.test(m.tipo))) continue;
      const d = dias(data!);
      L.push({ id: `r-${v.id}-${k}`, vid: v.id, viatura: nome, t: `Renovar ${ARTIGO[k]}`, sub: `${d < 0 ? "Venceu" : "Vence"} a ${fData(data)}. ${quando(d)}`, urgente: d < 0, prazo: d, btn: `Renovar ${ARTIGO[k]}`, acao: { tipo: "renovar", k } });
    }
    // revisão a chegar ou passada, sem nenhuma revisão marcada
    const r = revisao(v);
    if (r.tom !== "ok" && !agendadas.some((m) => /revis/i.test(m.tipo))) {
      L.push({ id: "rv-" + v.id, vid: v.id, viatura: nome, t: "Marcar a revisão", sub: `${r.txt}. A revisão é a cada ${fKm(v.rev.cadaKm)} ou ${v.rev.cadaMeses} meses.`, urgente: r.tom === "bad", prazo: Math.min(r.dd, Math.floor(r.faltaKm / 100)), btn: "Marcar a revisão", acao: { tipo: "revisao" } });
    }
  }
  // multas por identificar: o prazo legal é de 15 dias úteis a contar da notificação
  for (const o of multasPend(F)) {
    if (vid && o.vid !== vid) continue;
    const v = F.viaturas.find((x) => x.id === o.vid);
    if (!v) continue;
    const limite = prazoMulta(o), d = dias(limite);
    L.push({ id: "m-" + o.id, vid: v.id, viatura: nomeViatura(v), t: "Identificar o condutor da multa", sub: `${o.desc}, a ${fData(o.quando.slice(0, 10))}. Prazo: ${fData(limite)}. ${quando(d)}`, urgente: d <= 5, prazo: d, btn: "Identificar o condutor", acao: { tipo: "identificar", oid: o.id } });
  }
  return L.sort((a, b) => Number(b.urgente) - Number(a.urgente) || a.prazo - b.prazo || a.id.localeCompare(b.id));
}

/** Uma linha da lista de viaturas: quem a tem, o estado e a próxima coisa. */
export interface LinhaViatura { vid: string; nome: string; quem: string; estado: string; proximo: string; urgente: boolean; tarefas: number }

export function linhasViaturas(F: Frota): LinhaViatura[] {
  const T = tarefasFrota(F);
  return F.viaturas.filter(ativa).map((v) => {
    const c = condutor(F, v.id), ts = T.filter((t) => t.vid === v.id);
    return {
      vid: v.id, nome: nomeViatura(v), quem: c ? `Com ${c.nome}` : v.pool ? "Livre, para quem precisar" : "Livre",
      estado: ESTADOS[v.estado][1] + (v.motivo ? ` · ${v.motivo}` : ""), proximo: ts[0] ? ts[0].t : "Nada por fazer", urgente: !!ts[0]?.urgente, tarefas: ts.length,
    };
  }).sort((a, b) => Number(b.urgente) - Number(a.urgente) || b.tarefas - a.tarefas || a.nome.localeCompare(b.nome));
}

export function resumoFrota(F: Frota): string {
  const at = F.viaturas.filter(ativa), of = at.filter((v) => v.estado === "oficina").length, ck = custoKmMedio(F);
  return [`${at.length} viaturas`, of ? `${of} em oficina` : "", ck !== null ? `${fEur(ck)}/km em média` : ""].filter(Boolean).join(" · ");
}

/** A ficha da viatura: os dados que importam, as datas, a semana e os custos. */
export interface FichaViatura {
  nome: string; sub: string;
  datas: { rotulo: string; valor: string; urgente: boolean; aviso: boolean }[];
  semana: { quando: string; oQue: string }[];
  custos: { total: string; porKm: string };
  historico: { t: string; q: string }[];
}

export function fichaViatura(F: Frota, vid: string): FichaViatura | null {
  const v = F.viaturas.find((x) => x.id === vid);
  if (!v) return null;
  const c = condutor(F, v.id), r = revisao(v), ck = custoKm(F, v.id);
  const datas = (Object.keys(VENC) as ChaveVenc[]).map((k) => {
    const tom = tomData(v.venc[k]);
    return { rotulo: VENC[k], valor: v.venc[k] ? `${fData(v.venc[k])} · ${textoData(v.venc[k]).replace(" d", " dias")}` : "Não aplicável", urgente: tom === "bad", aviso: tom === "warn" };
  });
  datas.push({ rotulo: "Revisão", valor: `${r.txt.replace(" d ", " dias ").replace(/ d$/, " dias")} · próxima aos ${fKm(r.nextKm)} ou a ${fData(r.nextData)}`, urgente: r.tom === "bad", aviso: r.tom === "warn" });
  const ate = addDias(HOJE, 7);
  return {
    nome: nomeViatura(v),
    sub: [c ? `Com ${c.nome}` : "Livre", fKm(v.km), ESTADOS[v.estado][1]].join(" · "),
    datas,
    semana: compromissos(F, v.id).filter((x) => x.data >= HOJE && x.data <= ate).map((x) => ({ quando: `${fData(x.data).slice(0, 5)} ${x.hora}`, oQue: `${x.desc}${pessoa(F, x.pid) ? " · " + pessoa(F, x.pid)!.nome : ""}` })),
    custos: { total: fEur(custoTotal(F, v.id)), porKm: ck === null ? "—" : fEur(ck) + "/km" },
    historico: F.log.filter((l) => l.vid === v.id).slice(-5).reverse().map((l) => ({ t: l.t, q: l.at.slice(8, 10) + "/" + l.at.slice(5, 7) })),
  };
}

/** Para a multa: quem conduzia (sugerido, marcado como tal: R8) e as pessoas por ordem. */
export function condutoresParaMulta(F: Frota, oid: string): { id: string; nome: string; sugerido: boolean }[] {
  const o = F.ocorr.find((x) => x.id === oid);
  const s = o ? quemConduzia(F, o.vid, o.quando) : undefined;
  return F.pessoas.map((p) => ({ id: p.id, nome: p.nome, sugerido: p.id === s?.id })).sort((a, b) => Number(b.sugerido) - Number(a.sugerido) || a.nome.localeCompare(b.nome));
}

/** As datas sugeridas para escolher num toque (C7). */
export const datasRevisao = (): { rotulo: string; data: string }[] => [
  { rotulo: `Daqui a 1 semana (${fData(addDias(HOJE, 7)).slice(0, 5)})`, data: addDias(HOJE, 7) },
  { rotulo: `Daqui a 2 semanas (${fData(addDias(HOJE, 14)).slice(0, 5)})`, data: addDias(HOJE, 14) },
];
export const validadeSugerida = (atual: string | null): string => addMeses(atual && atual > HOJE ? atual : HOJE, 12);
export { fData, fEur, fKm, fNum };
