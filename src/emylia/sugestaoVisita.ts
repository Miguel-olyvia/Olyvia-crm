// Quem vai à visita (2/11/2026, reunião com o Ricardo): "Como é que eu decido o critério? Tem de ser pela agenda e pela proximidade.
// Tenho de receber essa sugestão." Um pedido que entra pelo escritório ainda não tem comercial: ao marcar a visita, a Olyvia sugere,
// para cada vaga, quem está livre a essa hora e, entre os livres, quem já tem uma visita perto nesse dia (o mesmo código postal, a mesma
// zona ou a mesma localidade). Em empate, quem tem menos visitas nesse dia. Sem ninguém livre, não sugere ninguém.
import type { Negocio } from "./motor";
import { horasDaDuracao, visitasDaAgenda } from "./equipa/regrasAgenda";
import { opcoesQuemVai } from "./equipa/membros";
import { grupoVisita } from "./campos";

export interface SugestaoVisita {
  /** O "Quem vai" sugerido ("Nome (papel)"). */
  quem: string;
  nome: string;
  /** Porquê, numa frase: "livre às 10:00 · tem uma visita às 09:00 perto (2780)". */
  motivo: string;
  /** Os que estão ocupados a essa hora (só o nome). */
  ocupados: string[];
}

const nomeDe = (quem: string): string => quem.replace(/\s*\(.*\)\s*$/, "").trim();
const minutos = (h: string): number | null => { const m = /^(\d{1,2}):(\d{2})/.exec(h); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };

/** "seg 03/11 · 10:00" → { data: "2026-11-03", hora: "10:00" }. O ano é o que põe a data mais perto de hoje. */
export function dataDaVaga(slot: string, hoje = new Date()): { data: string; hora: string } | null {
  const m = /(\d{1,2})\/(\d{1,2}).*?(\d{1,2}:\d{2})/.exec(slot);
  if (!m) return null;
  const dia = Number(m[1]), mes = Number(m[2]);
  let ano = hoje.getFullYear();
  if (mes - (hoje.getMonth() + 1) < -6) ano++;
  else if (mes - (hoje.getMonth() + 1) > 6) ano--;
  return { data: `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`, hora: m[3].padStart(5, "0") };
}

/** Quão perto fica uma morada de outra, pelo código postal e pela localidade. 3 = mesmo código postal (4 algarismos), 2 = mesma zona
 *  (2 algarismos) ou mesma localidade, 0 = longe ou sem dados. */
export function proximidade(a: { cp?: string; localidade?: string }, b: { cp?: string; localidade?: string }): { n: number; texto: string } {
  const ca = (a.cp || "").replace(/\D/g, ""), cb = (b.cp || "").replace(/\D/g, "");
  if (ca.length >= 4 && cb.length >= 4 && ca.slice(0, 4) === cb.slice(0, 4)) return { n: 3, texto: `perto (${ca.slice(0, 4)})` };
  const la = (a.localidade || "").trim().toLowerCase(), lb = (b.localidade || "").trim().toLowerCase();
  if (la && la === lb) return { n: 2, texto: `na mesma localidade (${b.localidade!.trim()})` };
  if (ca.length >= 2 && cb.length >= 2 && ca.slice(0, 2) === cb.slice(0, 2)) return { n: 2, texto: `na mesma zona (${cb.slice(0, 2)}xx)` };
  return { n: 0, texto: "" };
}

/** A sugestão para uma vaga: entre `opcoes` (as escolhas do "Quem vai"), a pessoa livre a essa hora e mais perto. */
export function sugerirQuemVai(deals: readonly Negocio[], d: Negocio, slot: string, opcoes: readonly string[], hoje = new Date()): SugestaoVisita | null {
  const vaga = dataDaVaga(slot, hoje);
  if (!vaga || !opcoes.length) return null;
  // primeiro os comerciais (quem vai às visitas); sem nenhum, toda a gente das opções
  const comerciais = opcoes.filter((q) => /\(comercial\)/i.test(q));
  const candidatos = comerciais.length ? comerciais : [...opcoes];
  const ini = minutos(vaga.hora) ?? 0, fim = ini + 90;
  const doDia = visitasDaAgenda(deals.filter((x) => x.id !== d.id)).filter((v) => v.data === vaga.data);
  const alvo = { cp: d.f.cp, localidade: d.f.localidade || d.local.split(",").pop()?.trim() };
  const porId = new Map(deals.map((x) => [x.id, x]));
  const ocupados: string[] = [];
  const livres: { quem: string; nome: string; perto: { n: number; texto: string; hora?: string }; n: number; ordem: number }[] = [];
  candidatos.forEach((quem, ordem) => {
    const nome = nomeDe(quem);
    const minhas = doDia.filter((v) => v.nome.toLowerCase() === nome.toLowerCase());
    const choca = minhas.some((v) => {
      const a = v.item.hora ? minutos(v.item.hora) : null;
      if (a == null) return false;
      const b = a + Math.round((v.item.horas ?? horasDaDuracao(undefined)) * 60);
      return a < fim && ini < b;
    });
    if (choca) { ocupados.push(nome); return; }
    let perto: { n: number; texto: string; hora?: string } = { n: 0, texto: "" };
    for (const v of minhas) {
      const o = v.item.negocio != null ? porId.get(v.item.negocio) : undefined;
      const p = proximidade(alvo, o ? { cp: o.f.cp, localidade: o.f.localidade || o.local.split(",").pop()?.trim() } : { localidade: v.item.sub?.split(",").pop()?.trim() });
      if (p.n > perto.n) perto = { ...p, hora: v.item.hora };
    }
    livres.push({ quem, nome, perto, n: minhas.length, ordem });
  });
  if (!livres.length) return null;
  livres.sort((x, y) => y.perto.n - x.perto.n || x.n - y.n || x.ordem - y.ordem);
  const m = livres[0];
  const motivo = [`livre às ${vaga.hora}`,
    m.perto.n ? `tem uma visita${m.perto.hora ? ` às ${m.perto.hora}` : ""} ${m.perto.texto}` : m.n ? `${m.n} ${m.n === 1 ? "visita" : "visitas"} nesse dia, nenhuma perto` : "sem visitas nesse dia"].join(" · ");
  return { quem: m.quem, nome: m.nome, motivo, ocupados };
}

/** As escolhas do "Quem vai": a equipa real (com a conta da 2.0) ou as pessoas de exemplo do protótipo. */
export function opcoesDaVisita(): string[] {
  return opcoesQuemVai() ?? grupoVisita(1).campos.find((c) => c.k.endsWith("_quem"))?.op ?? [];
}
