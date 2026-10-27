// A área de Clientes do V1 (21/10/2026): cada cliente com os seus negócios. Funções puras: nada aqui muda o Estado.
// Como na app (anew_entities → anew_clients → negocios.entity_id), o cliente é a pessoa e os negócios penduram-se nela:
// aqui a pessoa é o nome (como em leadsDocs.pessoasDe) e é cliente com o primeiro negócio ganho.
// Os dados do cliente vêm dos negócios (o mais antigo dá a morada fiscal, o mais recente os contactos) e o que se muda na área
// de Clientes fica em S.fichas, por cima. Na migração: identificação e NIF → anew_entities / fiscal_entities, contactos →
// anew_entity_emails / anew_entity_phones, moradas → anew_addresses (a fiscal e as das obras), comercial, notas → anew_clients.
import { PAPEIS, r2, totaisIva, type Estado, type Negocio } from "./motor";
import { ehGanho } from "./negociosApp";

export interface Cliente {
  nome: string;
  tel: string;
  /** Todos os negócios, do mais recente para o mais antigo (os perdidos também: são história do cliente). */
  negocios: Negocio[];
  emCurso: Negocio[];
  concluidos: Negocio[];
  perdidos: Negocio[];
  /** Soma, com IVA, dos negócios ganhos. */
  valor: number;
  /** Quando ficou cliente (o primeiro negócio ganho). */
  desde: string;
  /** A localidade da morada fiscal (para a lista). */
  localidade: string;
  obraEmCurso: boolean;
}

/** A obra acabou: o plano concluído (ou o auto de receção assinado). */
export const concluido = (d: Negocio): boolean => d.fase >= 5 && (d.obra.plano?.estado === "concluída" || d.obra.auto?.estado === "assinado");

/** O estado do negócio numa frase curta, para o cartão. */
export function estadoNegocio(d: Negocio): string {
  if (d.perdido) return d.motivoPerda ? `Perdido · ${d.motivoPerda}` : "Perdido";
  const o = d.orc;
  switch (d.fase) {
    case 0: return "Lead · por contactar";
    case 1: return "Contacto · visita por marcar";
    case 2: return d.visita.slot ? `Visita · ${d.visita.slot}` : "Visita por marcar";
    case 3: return !o?.enviada ? "Orçamento em preparação" : !o.aceite ? `Proposta enviada a ${o.enviada}` : o.vendaDireta ? "Proposta aceite" : o.contrato === "assinado" ? "Contrato assinado" : "Contrato por assinar";
    case 4: return d.fin.pago ? "Pago · a preparar a obra" : d.fin.fatura ? `Fatura ${d.fin.fatura.n} por pagar` : "Fatura por emitir";
    default: return concluido(d) ? "Obra concluída" : d.obra.plano?.estado === "em curso" ? "Obra em curso" : "Obra por começar";
  }
}

/** O valor do negócio com IVA, quando já tem orçamento. */
export const valorDe = (d: Negocio, S: Estado): number | null => (d.orc ? r2(totaisIva(d, S).total) : null);

/** "dd/mm", "dd/mm hh:mm" ou "hoje hh:mm" → um número para ordenar (o mais recente é o maior). */
export function chaveData(q: string): number {
  const h = /^hoje\s+(\d{1,2}):(\d{2})/.exec(q);
  if (h) return 1e6 + Number(h[1]) * 60 + Number(h[2]);
  const m = /(\d{1,2})\/(\d{1,2})(?:\/\d{4})?(?:\s+(\d{1,2}):(\d{2}))?/.exec(q);
  if (!m) return 0;
  return (Number(m[2]) * 31 + Number(m[1])) * 1440 + (m[3] ? Number(m[3]) * 60 + Number(m[4]) : 0);
}

const desdeDe = (S: Estado, nome: string, ganhos: Negocio[]): string => {
  const c = S.clientes.filter((x) => x.nome === nome).map((x) => x.desde);
  if (c.length) return c[c.length - 1];
  const g = ganhos.map((d) => d.orc?.aceite || d.quando).sort((a, b) => chaveData(a) - chaveData(b));
  return g[0] || "";
};

/** Os clientes: as pessoas com um negócio ganho (ou já em Clientes). Primeiro quem tem obra em curso, depois quem tem negócios em curso, e o resto pelo nome. */
export function clientesV1(S: Estado): Cliente[] {
  const por = new Map<string, Negocio[]>();
  for (const d of S.deals) por.set(d.nome, [...(por.get(d.nome) || []), d]);
  const lista: Cliente[] = [];
  for (const [nome, todos] of por) {
    const ganhos = todos.filter(ehGanho);
    if (!ganhos.length && !S.clientes.some((c) => c.nome === nome)) continue;
    const negocios = [...todos].sort((a, b) => chaveData(b.quando) - chaveData(a.quando) || b.id - a.id);
    const emCurso = negocios.filter((d) => !d.perdido && !concluido(d));
    const ficha = fichaCliente(S, nome, negocios);
    lista.push({
      nome, tel: ficha.tel, negocios, emCurso,
      concluidos: negocios.filter((d) => !d.perdido && concluido(d)),
      perdidos: negocios.filter((d) => d.perdido),
      valor: r2(ganhos.reduce((a, d) => a + (valorDe(d, S) ?? 0), 0)),
      desde: desdeDe(S, nome, ganhos),
      localidade: ficha.localidade,
      obraEmCurso: emCurso.some((d) => d.fase >= 5),
    });
  }
  return lista.sort((a, b) => Number(b.obraEmCurso) - Number(a.obraEmCurso) || Number(b.emCurso.length > 0) - Number(a.emCurso.length > 0) || a.nome.localeCompare(b.nome, "pt"));
}

export type FiltroCliente = "todos" | "curso" | "obra";
export const FILTROS_CLIENTE: { id: FiltroCliente; nome: string }[] = [
  { id: "todos", nome: "Todos" }, { id: "curso", nome: "Com negócio em curso" }, { id: "obra", nome: "Com obra em curso" },
];

export function filtrarClientes(cs: Cliente[], filtro: FiltroCliente, q: string): Cliente[] {
  const t = q.trim().toLowerCase();
  return cs.filter((c) => {
    if (filtro === "curso" && !c.emCurso.length) return false;
    if (filtro === "obra" && !c.obraEmCurso) return false;
    if (!t) return true;
    return [c.nome, c.tel, c.localidade, ...c.negocios.map((d) => d.servico)].join(" ").toLowerCase().includes(t)
      || c.tel.replace(/\D/g, "").includes(t.replace(/\D/g, "") || "§");
  });
}

/* ------------------------------------------------------------------ a ficha */
export type TipoCampo = "texto" | "escolha" | "longo";
export interface CampoCliente { k: string; l: string; t: TipoCampo; op?: string[]; ph?: string; tipo?: "tel" | "email" }
export interface GrupoCliente { titulo: string; nota?: string; campos: CampoCliente[] }

/** Os dados do cliente, como na ficha da app (Editar): identificação, contactos, morada fiscal e o lado comercial. */
export const GRUPOS_CLIENTE: GrupoCliente[] = [
  { titulo: "Identificação", campos: [
    { k: "tipo_cliente", l: "Tipo", t: "escolha", op: ["Particular", "Empresa", "Condomínio"] },
    { k: "nome", l: "Nome", t: "texto" },
    { k: "nif", l: "NIF", t: "texto", ph: "123456789" },
  ] },
  { titulo: "Contactos", campos: [
    { k: "tel", l: "Telemóvel", t: "texto", tipo: "tel" },
    { k: "email", l: "Email", t: "texto", tipo: "email", ph: "nome@exemplo.pt" },
    { k: "pref", l: "Prefere ser contactado por", t: "escolha", op: ["Telefone", "WhatsApp", "Email"] },
    { k: "hora", l: "Melhor hora", t: "escolha", op: ["Manhã", "Tarde", "Fim do dia"] },
  ] },
  { titulo: "Morada fiscal", nota: "A que vai na fatura. As moradas das obras ficam em cada negócio.", campos: [
    { k: "morada", l: "Rua e número", t: "texto" },
    { k: "cp", l: "Código postal", t: "texto", ph: "0000-000" },
    { k: "localidade", l: "Localidade", t: "texto" },
  ] },
  { titulo: "Relação", campos: [
    { k: "comercial", l: "Comercial", t: "escolha", op: ["Rúben", "Direção"] },
    { k: "origem", l: "Como chegou", t: "escolha", op: ["Site", "Campanha", "Telefone", "Recomendação", "Redes sociais", "Loja"] },
    { k: "rgpd", l: "Autoriza o contacto (RGPD)", t: "escolha", op: ["Sim", "Não"] },
    { k: "notas", l: "Notas", t: "longo" },
  ] },
];

export type Ficha = Record<string, string>;

/** Os dados do cliente: o que se mudou na área de Clientes, senão o que os negócios têm (os contactos do mais recente, a morada do mais antigo). */
export function fichaCliente(S: Estado, nome: string, negocios?: Negocio[]): Ficha {
  const ns = negocios ?? [...S.deals.filter((d) => d.nome === nome)].sort((a, b) => chaveData(b.quando) - chaveData(a.quando));
  const recente = ns[0], antigo = ns[ns.length - 1];
  const de = (k: string): string => {
    for (const d of ns) if (d.f[k]) return d.f[k];
    return "";
  };
  const base: Ficha = {
    tipo_cliente: de("tipo_cliente") || "Particular",
    nome,
    nif: de("nif") || de("nif_fat"),
    tel: recente?.tel || "",
    email: de("email"),
    pref: de("pref"), hora: de("hora"),
    morada: antigo?.f.morada || "", cp: antigo?.f.cp || "",
    localidade: antigo?.f.localidade || antigo?.local.split(",").pop()?.trim() || "",
    comercial: recente ? PAPEIS[recente.dono]?.nome ?? "" : "",
    origem: antigo?.f.origem || "",
    rgpd: de("rgpd"),
    notas: "",
  };
  const mudado = S.fichas?.[nome] || {};
  return { ...base, ...Object.fromEntries(Object.entries(mudado).filter(([k]) => k !== "nome")) };
}

/** As moradas das obras do cliente, sem repetir, e os negócios de cada uma. */
export function moradasObra(c: Pick<Cliente, "negocios">): { morada: string; cp: string; localidade: string; negocios: Negocio[] }[] {
  const m = new Map<string, { morada: string; cp: string; localidade: string; negocios: Negocio[] }>();
  for (const d of c.negocios) {
    const morada = d.f.morada || d.local.split(",")[0]?.trim() || "", localidade = d.f.localidade || d.local.split(",").pop()?.trim() || "";
    if (!morada && !localidade) continue;
    const k = (morada + "|" + localidade).toLowerCase();
    const x = m.get(k) || { morada, cp: d.f.cp || "", localidade, negocios: [] };
    x.negocios.push(d);
    m.set(k, x);
  }
  return [...m.values()];
}

/** O histórico do cliente: os eventos de todos os negócios juntos, do mais recente para o mais antigo, com o negócio de onde vêm. */
export function historicoCliente(c: Pick<Cliente, "negocios">): { t: string; q: string; k: string; negocio: Negocio }[] {
  return c.negocios.flatMap((d) => d.hist.map((e, i) => ({ ...e, negocio: d, i })))
    .sort((a, b) => chaveData(b.q) - chaveData(a.q) || (a.negocio.id === b.negocio.id ? a.i - b.i : 0))
    .map(({ i: _i, ...e }) => e);
}

/** As iniciais para o avatar: "Joana Ribeiro" → "JR". */
export const iniciais = (nome: string): string => nome.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
