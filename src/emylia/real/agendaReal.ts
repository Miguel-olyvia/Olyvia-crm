// CRM (28/10/2026): a agenda e a equipa da Emylia numa organização real. Antes a agenda do Hoje e da RH › Agenda mostravam as pessoas e as
// ausências de exemplo (a equipa real nunca era definida e as ausências vinham da loja de exemplo do RH).
// · As ausências aprovadas de cada técnico vêm da rh_agenda_tecnicos (pessoas_ausencias_dias, migration 20261231999000): entram no plano da
//   obra (definirAusenciasRh: um técnico ausente conta como conflito) e na agenda (rhDaAgenda.ts).
// · A equipa da agenda: os técnicos do RH (o técnico é a própria pessoa do RH) e quem entrou, com o papel do "A ver como".
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Papel } from "../motor";
import { definirAusenciasRh, type FichaTecnico } from "../equipa/tecnicos";
import { definirRhDaAgenda, TIPO_AUSENCIA_REAL, type PessoaAgendaRh } from "../equipa/rhDaAgenda";
import type { EquipaReal, MembroAgenda } from "../equipa/membros";
import { definirVisitasCrm, type VisitaCrm } from "../equipa/visitasCrm";

/** O nome de cada papel na agenda ("Comercial", "Técnico"…). */
export const NOME_PAPEL: Record<Papel, string> = {
  comercial: "Comercial", direcao: "Direção", financeiro: "Financeiro", armazem: "Armazém", operacoes: "Operações", juridico: "Jurídico", tecnico: "Técnico",
};

/** A janela que se lê (a função aceita até 400 dias): um mês para trás e um ano para a frente. */
export function janelaAgenda(hoje: Date): { de: string; ate: string } {
  const d = (n: number) => { const x = new Date(hoje); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  return { de: d(-30), ate: d(365) };
}

interface LinhaAgendaRh { pessoa_id: string; nome: string | null; indisponivel?: { data: string }[] | null }

/** As pessoas da rh_agenda_tecnicos, com os dias de ausência aprovada. */
export const pessoasDaAgenda = (linhas: readonly LinhaAgendaRh[]): PessoaAgendaRh[] =>
  linhas.map((l) => ({ id: l.pessoa_id, nome: l.nome ?? "", ausencias: [...new Set((l.indisponivel ?? []).map((x) => String(x.data).slice(0, 10)))].sort() }));

/** Põe as ausências no plano e na agenda. */
export function aplicarAgenda(pessoas: readonly PessoaAgendaRh[]): void {
  definirAusenciasRh(Object.fromEntries(pessoas.map((p) => [p.id, Object.fromEntries(p.ausencias.map((d) => [d, TIPO_AUSENCIA_REAL.nome]))])));
  definirRhDaAgenda(pessoas);
}

/** Lê e aplica. Sem a função ou sem permissão, a agenda fica sem ausências (nunca com as de exemplo) e devolve o motivo. */
export async function carregarAgendaReal(sb: SupabaseClient, org: string, hoje = new Date()): Promise<{ pessoas: PessoaAgendaRh[]; erro: string | null }> {
  const { de, ate } = janelaAgenda(hoje);
  const { data, error } = await sb.rpc("rh_agenda_tecnicos" as never, { p_org: org, p_de: de, p_ate: ate } as never);
  if (error) { aplicarAgenda([]); return { pessoas: [], erro: error.message || "Não foi possível ler a agenda do RH." }; }
  const pessoas = pessoasDaAgenda((data as LinhaAgendaRh[] | null) ?? []);
  aplicarAgenda(pessoas);
  return { pessoas, erro: null };
}

/** Quem entrou: a pessoa do RH ligada à conta (pessoas_contas), se houver, e o nome a mostrar. */
export interface QuemEntrou { pessoaId: string | null; nome: string }

/**
 * A equipa da agenda: os técnicos do RH e quem entrou. Se quem entrou é um técnico, é esse membro; senão, entra como membro com o papel do
 * "A ver como" (a agenda dele são as visitas com o nome dele).
 */
export function equipaReal(tecnicos: readonly FichaTecnico[], eu: QuemEntrou | null, papel: Papel): EquipaReal {
  const membros: MembroAgenda[] = tecnicos.map((t) => ({ id: t.id, nome: t.n, papel: "tecnico", papelNome: NOME_PAPEL.tecnico, ref: t.id }));
  let euId: string | null = null;
  if (eu) {
    const tec = eu.pessoaId ? membros.find((m) => m.id === eu.pessoaId) : undefined;
    if (tec) euId = tec.id;
    else {
      euId = eu.pessoaId ?? "conta";
      membros.unshift({ id: euId, nome: eu.nome, papel, papelNome: NOME_PAPEL[papel], ref: null });
    }
  }
  return { carregando: false, eu: euId, papelEu: papel, membros };
}

/** O técnico fixo do Hoje do técnico: só quando quem entrou é um técnico do RH (os outros podem ver como qualquer técnico). */
export const tecnicoDaConta = (tecnicos: readonly FichaTecnico[], eu: QuemEntrou | null): string | null =>
  eu?.pessoaId && tecnicos.some((t) => t.id === eu.pessoaId) ? eu.pessoaId : null;

/* ------------------------------------------------------------------ 29/10: as visitas marcadas no CRM */
interface LinhaVisitaCrm {
  id: string; title: string | null; start_datetime: string; end_datetime: string | null; status: string; visit_kind: string | null;
  negocios?: { numero: number | null; titulo: string | null } | null;
  schedule_item_assignees?: { schedule_resources?: { name: string | null } | null }[] | null;
}
const LISBOA = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Lisbon", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
/** Dia ("aaaa-mm-dd") e hora ("hh:mm") de Lisboa de um instante. */
export function diaEHoraDeLisboa(instante: string): { data: string; hora: string } {
  const p = Object.fromEntries(LISBOA.formatToParts(new Date(instante)).map((x) => [x.type, x.value]));
  return { data: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
}
const TIPO_VISITA: Record<string, string> = { levantamento: "Levantamento", medicao: "Medição técnica", materiais: "Escolha de materiais", revisita: "Revisita" };

/** As visitas do CRM no formato da agenda: quem vai é o recurso atribuído (sem ele, "Por atribuir"). */
export function visitasCrmDe(linhas: readonly LinhaVisitaCrm[]): VisitaCrm[] {
  return linhas.map((l) => {
    const { data, hora } = diaEHoraDeLisboa(l.start_datetime);
    const horas = l.end_datetime ? Math.max(0.25, Math.round(((new Date(l.end_datetime).getTime() - new Date(l.start_datetime).getTime()) / 3_600_000) * 10) / 10) : 1.5;
    const quem = l.schedule_item_assignees?.map((a) => a.schedule_resources?.name).find((x) => !!x) ?? "Por atribuir";
    const tipo = TIPO_VISITA[l.visit_kind ?? ""] ?? "Visita";
    return { nome: quem, papel: "comercial", data, hora, horas, titulo: `${tipo} · ${l.negocios?.titulo ?? l.title ?? "CRM"}`, sub: l.title ?? "Marcada no CRM",
      ...(l.negocios?.numero != null ? { negocio: Number(l.negocios.numero) } : {}), ...(l.status === "completed" ? { feito: true } : {}) };
  });
}

type ConsultaVisitas = {
  eq: (c: string, v: string) => ConsultaVisitas; neq: (c: string, v: string) => ConsultaVisitas; not: (c: string, o: string, v: null) => ConsultaVisitas;
  is: (c: string, v: null) => ConsultaVisitas; gte: (c: string, v: string) => ConsultaVisitas;
  lte: (c: string, v: string) => Promise<{ data: LinhaVisitaCrm[] | null; error: { message: string } | null }>;
};
/** Lê e define as visitas marcadas no CRM (com negócio, sem número de visita da Emylia, não canceladas), na janela da agenda. */
export async function carregarVisitasCrm(sb: SupabaseClient, org: string, hoje = new Date()): Promise<{ n: number; erro: string | null }> {
  const { de, ate } = janelaAgenda(hoje);
  // uma falha aqui nunca impede a página de abrir: a agenda fica sem as visitas do CRM e diz porquê
  try {
  const t = sb.from("schedule_items" as never) as unknown as { select: (c: string) => ConsultaVisitas };
  const { data, error } = await t.select("id, title, start_datetime, end_datetime, status, visit_kind, negocios(numero, titulo), schedule_item_assignees(schedule_resources(name))")
    .eq("organization_id", org).not("negocio_id", "is", null).is("visita_numero", null).neq("status", "cancelled")
    .gte("start_datetime", `${de}T00:00:00Z`).lte("start_datetime", `${ate}T23:59:59Z`);
  if (error) { definirVisitasCrm([]); return { n: 0, erro: error.message }; }
  const v = visitasCrmDe(data ?? []);
  definirVisitasCrm(v);
  return { n: v.length, erro: null };
  } catch (e) {
    definirVisitasCrm([]);
    return { n: 0, erro: e instanceof Error ? e.message : String(e) };
  }
}
