// O perfil de cada pessoa (lead ou cliente) para as páginas de Pessoas: contactos, saúde, notas, chamadas e emails.
// Funções puras e determinísticas: nada aqui muda o Estado nem existe no Estado. O que não vem da seed é de exemplo e
// calcula-se a partir do nome, das fases e das datas dos negócios, com regras fixas.
import { PAPEIS, campoVisita, proximo, tot, visitas, type Estado, type Evento, type Negocio } from "./motor";
import { AREA, CONTACTO, ESCOLHAS, EXTERIOR, INTERIOR, LEAD, efetivo, emFalta, grupoVisita, type Grupo } from "./campos";
import { atrasada, idade, localDe, proximoDe, somarDias, tempoDesde } from "./leadsDocs";
import { canalDe, infoOrigem, toquesDe, utmTexto } from "./toquesDocs";
import { comercialDe, ehContrato, type PessoaApp } from "./pessoasDocs";

/** "Hoje" do protótipo (o mesmo de leadsDocs). */
const HOJE = "10/10";
/** A partir de quantos dias sem falar com a pessoa se diz que está sem contacto. */
export const LIMITE_SEM_CONTACTO = 7;
/** Dias que se dá a cada etapa (Lead … Obra) para o próximo passo. */
const PRAZO_DIAS = [1, 2, 3, 5, 3, 7];

export interface Morada { linha: string; cp: string; localidade: string; completa: string }
/** `maus[i]` diz se o motivo i é um alerta (e não um ponto a favor). */
export interface Saude { score: number; motivos: string[]; maus: boolean[] }
/** `quemExemplo`: quem vai à visita foi inventado (a seed não o diz). */
export interface VisitaPessoa { data: string; hora: string; quem: string; quemExemplo: boolean; estado: string; morada: string }
export interface Nota { id: string; autor: string; q: string; texto: string; exemplo: boolean }
export interface Interacao { id: string; tipo: "chamada" | "email"; titulo: string; detalhe: string; q: string; exemplo: true }
export interface Prazo { data: string; atrasado: boolean }
export interface Pagamento { total: number; pago: number; falta: number }

export interface Perfil {
  email: string;
  /** O email foi inventado a partir do nome (a seed não tem email). */
  emailExemplo: boolean;
  telefone: string;
  morada: Morada;
  /** Só os clientes têm NIF. */
  nif: string | null;
  /** O NIF foi inventado (a seed não o tem). */
  nifExemplo: boolean;
  comercial: string;
  /** Data (dd/mm) em que a pessoa chegou e "há quanto tempo". */
  criada: string;
  criadaHa: string;
  /** A interação mais recente, "dd/mm hh:mm", e os dias desde então. */
  ultimoContacto: string;
  diasSemContacto: number;
  saude: Saude;
  visita: VisitaPessoa | null;
  notas: Nota[];
  interacoes: Interacao[];
  origem: string;
  canal: string;
  campanha: string | null;
  conflito: boolean;
  prazo: Prazo;
}

export interface ItemAtividade { id: string; tipo: "historico" | "chamada" | "email" | "nota"; titulo: string; detalhe: string; q: string; exemplo: boolean }

/* ---------------------------------------------------------------- datas e sementes */

const semente = (nome: string): number => [...nome].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 100003, 7);
const dd = (n: number): string => String(n).padStart(2, "0");
const soData = (q: string): string => /^\d{1,2}\/\d{1,2}/.exec(q.trim())?.[0] ?? "";

/** Minutos desde "dd/mm hh:mm" até hoje: quanto menor, mais recente. Sem data conta como agora. */
export function minutosAtras(q: string): number {
  const h = /^hoje\s+(\d{1,2}):(\d{2})/.exec(q.trim());
  if (h) return -(Number(h[1]) * 60 + Number(h[2]));
  const m = /^(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/.exec(q.trim());
  return m ? idade(q) * 1440 - (Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0)) : 0;
}

/** A data em que a pessoa chegou: a do negócio mais antigo. */
function dataBase(p: PessoaApp): string {
  const datas = p.negocios.map((d) => soData(d.quando)).filter(Boolean);
  return datas.reduce((a, x) => (idade(x) > idade(a) ? x : a), datas[0] ?? HOJE);
}

/** `dias` depois da data base, sem passar de hoje, com a hora dada. */
function quandoEm(base: string, dias: number, h: number, m: number): string {
  const data = somarDias(base, Math.min(dias, Math.max(0, idade(base)))) || base;
  return `${data} ${dd(h)}:${dd(m)}`;
}

const porRecente = <T extends { q: string }>(l: T[]): T[] =>
  l.map((x, i) => ({ x, i })).sort((a, b) => minutosAtras(a.x.q) - minutosAtras(b.x.q) || a.i - b.i).map((e) => e.x);

/* ---------------------------------------------------------------- chamadas e emails de exemplo */

type Esboco = Omit<Interacao, "id" | "exemplo">;

function esbocosDeInteracoes(d: Negocio, base: string, s: number): Esboco[] {
  const l: Esboco[] = [{ tipo: "email", titulo: "Email de boas-vindas", detalhe: "Enviado pela Olyvia", q: quandoEm(base, 0, 9 + (s % 4), (s * 3) % 60) }];
  const tentativas = d.fase >= 1 ? Math.max(1, Number(d.f.tentativas) || 1) : 0;
  for (let i = 0; i < tentativas; i++) {
    const atendeu = i === tentativas - 1;
    l.push({
      tipo: "chamada", titulo: atendeu ? `Chamada · ${3 + (s % 7)} min` : "Chamada sem resposta",
      detalhe: atendeu ? d.f.resultado || "Atendeu · interessado" : "Não atendeu", q: quandoEm(base, 1 + i, 10 + ((s + i) % 7), (s * 7 + i * 13) % 60),
    });
  }
  if (d.fase >= 2) l.push({ tipo: "email", titulo: "Confirmação da visita", detalhe: "Enviado ao cliente", q: quandoEm(base, tentativas + 2, 11, (s * 5) % 60) });
  const o = d.orc;
  if (o?.enviada && soData(o.enviada)) l.push({ tipo: "email", titulo: "Proposta enviada", detalhe: "Com o link do portal", q: `${soData(o.enviada)} 10:30` });
  if (o?.contrato && soData(o.aceite ?? o.enviada ?? "")) l.push({ tipo: "email", titulo: "Contrato enviado", detalhe: "Para assinar no portal", q: `${soData(o.aceite ?? o.enviada ?? "")} 15:10` });
  if (d.fin.fatura && soData(d.fin.fatura.q)) l.push({ tipo: "email", titulo: `Fatura ${d.fin.fatura.n} enviada`, detalhe: "Para o email do cliente", q: `${soData(d.fin.fatura.q)} 11:00` });
  if (d.fin.recibo && soData(d.fin.recibo.q)) l.push({ tipo: "email", titulo: `Recibo ${d.fin.recibo.n} enviado`, detalhe: "Depois de validar o pagamento", q: `${soData(d.fin.recibo.q)} 11:20` });
  return l;
}

function interacoesDe(p: PessoaApp, base: string): Interacao[] {
  const d = p.principal;
  return porRecente(esbocosDeInteracoes(d, base, semente(p.nome))).map((e, i): Interacao => ({ ...e, id: `int-${d.id}-${i + 1}`, exemplo: true }));
}

/* ---------------------------------------------------------------- notas */

const NOTAS: readonly string[] = [
  "Prefere ser contactada ao fim do dia.", "Pediu para confirmar o acesso ao prédio antes da visita.", "Quer comparar com outro orçamento.",
  "Perguntou por financiamento.", "Decide em conjunto com a família.", "Tem pressa: quer a obra antes do Natal.",
];

function notasDe(p: PessoaApp, base: string, comercial: string): Nota[] {
  const d = p.principal, s = semente(p.nome);
  const reais: Nota[] = d.f.pedido ? [{ id: `nota-${d.id}-0`, autor: comercial, q: quandoEm(base, 0, 9, (s * 11) % 60), texto: d.f.pedido, exemplo: false }] : [];
  const exemplos = [0, 1].map((i): Nota => ({
    id: `nota-${d.id}-${i + 1}`, autor: i === 0 ? comercial : "Direção", q: quandoEm(base, 2 + i * 3, 14 + i, (s * (i + 3)) % 60), texto: NOTAS[(s + i * 2) % NOTAS.length], exemplo: true,
  }));
  return porRecente([...reais, ...exemplos]);
}

/* ---------------------------------------------------------------- morada, visita, prazo, saúde */

function moradaDe(d: Negocio): Morada {
  const f = d.f, cp = f.cp ?? "", localidade = localDe(d);
  const completa = [f.morada, f.fracao, [cp, localidade].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return { linha: f.morada ?? "", cp, localidade, completa: f.morada ? completa : d.local };
}

function visitaDe(p: PessoaApp, morada: string): VisitaPessoa | null {
  const d = [p.principal, ...p.negocios].find((x) => x.visita.slot);
  if (!d) return null;
  const n = visitas(d).slice(-1)[0] ?? 0;
  const [data, hora = ""] = d.visita.slot.split(" · ");
  const quem = campoVisita(d, n, "quem");
  return { data, hora, quem: quem || "Rúben (comercial)", quemExemplo: !quem, estado: campoVisita(d, n, "estado") || "Marcada", morada };
}

function prazoDe(p: PessoaApp, ultimo: string, s: number): Prazo {
  const atrasado = atrasada(p);
  const candidato = somarDias(soData(ultimo), PRAZO_DIAS[p.principal.fase] ?? 3);
  return { data: !atrasado && idade(candidato) > 0 ? somarDias(HOJE, 1 + (s % 3)) : candidato, atrasado };
}

/** A saúde de 0 a 100 (de exemplo): parte de 60, desce com atrasos e silêncio e sobe com visita, proposta e pagamentos. */
function saudeDe(p: PessoaApp, dias: number, conflito: boolean, visita: VisitaPessoa | null, pago: Pagamento): Saude {
  const o = p.principal.orc;
  const razoes: [number, string][] = [];
  if (atrasada(p)) razoes.push([-25, "Tem uma tarefa atrasada"]);
  if (dias >= 14) razoes.push([-25, `Sem contacto há ${dias} dias`]);
  else if (dias >= LIMITE_SEM_CONTACTO) razoes.push([-15, `Sem contacto há ${dias} dias`]);
  if (conflito) razoes.push([-10, "Conflito de contacto por rever"]);
  if (visita?.estado === "Marcada") razoes.push([10, "Visita marcada"]);
  if (dias <= 3) razoes.push([10, "Falámos há pouco"]);
  if (o?.enviada) razoes.push([10, "Proposta enviada"]);
  if (p.papel === "cliente") razoes.push([10, "Já é cliente"]);
  if (pago.total > 0 && pago.falta === 0) razoes.push([10, "Tudo pago"]);
  const score = Math.max(0, Math.min(100, 60 + razoes.reduce((a, [v]) => a + v, 0)));
  const ordenadas: [number, string][] = [...razoes.filter(([v]) => v < 0), ...razoes.filter(([v]) => v > 0), [1, "Contactos completos"], [1, "Sem alertas em aberto"]];
  const dois = ordenadas.slice(0, 2);
  return { score, motivos: dois.map(([, t]) => t), maus: dois.map(([v]) => v < 0) };
}

/** Pagamento (de exemplo) dos contratos da pessoa: sinal de metade quando a obra arranca e tudo quando a fatura é paga. */
export function pagamentoDe(S: Estado, p: PessoaApp): Pagamento {
  const contratos = p.negocios.filter((d) => d.orc && ehContrato(d));
  const total = contratos.reduce((a, d) => a + tot(d, S).pf, 0);
  const pago = contratos.reduce((a, d) => a + (d.fin.pago ? tot(d, S).pf : d.fase >= 5 ? tot(d, S).pf / 2 : 0), 0);
  return { total, pago, falta: total - pago };
}

/* ---------------------------------------------------------------- o perfil */

export function perfilDe(p: PessoaApp, S: Estado): Perfil {
  const d = p.principal, base = dataBase(p), s = semente(p.nome);
  const toques = toquesDe(S, p.nome), primeiro = toques[0];
  const interacoes = interacoesDe(p, base);
  const ultimo = interacoes[0].q, dias = Math.max(0, idade(ultimo));
  const morada = moradaDe(d), conflito = toques.some((t) => t.conflito);
  const visita = visitaDe(p, morada.completa);
  const nif = p.papel === "cliente" ? d.f.nif || "2" + String((s * 7919) % 100000000).padStart(8, "0") : null;
  return {
    emailExemplo: !d.f.email,
    email: d.f.email || `${p.nome.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ /g, ".")}@exemplo.pt`,
    telefone: p.tel, morada, nif, nifExemplo: nif !== null && !d.f.nif, comercial: comercialDe(p), criada: base, criadaHa: tempoDesde(base), ultimoContacto: ultimo, diasSemContacto: dias,
    saude: saudeDe(p, dias, conflito, visita, pagamentoDe(S, p)), visita, notas: notasDe(p, base, PAPEIS[d.dono].nome), interacoes,
    origem: primeiro?.origem ?? d.origem, canal: primeiro?.canal ?? canalDe(d.origem), campanha: primeiro?.campanha ?? (primeiro?.porMapear ? "por mapear" : null),
    conflito, prazo: prazoDe(p, ultimo, s),
  };
}

/** Os campos do bloco Contacto da ficha. Sem telefone ou sem email diz-se, em vez de mostrar um campo vazio; o que foi inventado leva "exemplo". */
export function camposContacto(f: Perfil): { rotulo: string; valor: string }[] {
  return [
    { rotulo: "Telefone", valor: f.telefone.trim() || "Sem telefone" },
    { rotulo: "Email", valor: f.email.trim() ? (f.emailExemplo ? `${f.email} (exemplo)` : f.email) : "Sem email" },
    { rotulo: "Morada", valor: f.morada.completa },
    ...(f.nif ? [{ rotulo: "NIF", valor: f.nifExemplo ? `${f.nif} (exemplo)` : f.nif }] : []),
  ];
}

/* ---------------------------------------------------------------- atividade, negócios e UTM */

const doHistorico = (p: PessoaApp): ItemAtividade[] =>
  p.negocios.flatMap((d) => d.hist).map((e: Evento, i): ItemAtividade => ({ id: `hist-${p.principal.id}-${i}`, tipo: "historico", titulo: e.t, detalhe: "", q: e.q, exemplo: false }));

/** Uma só linha do tempo: histórico dos negócios, chamadas, emails e notas, do mais recente para o mais antigo. */
/** `f` é o perfil já calculado (a ficha tem-no); sem ele calcula-se aqui. */
export function atividadeDe(p: PessoaApp, S: Estado, f: Perfil = perfilDe(p, S)): ItemAtividade[] {
  return porRecente([
    ...doHistorico(p),
    ...f.interacoes.map((i): ItemAtividade => ({ id: i.id, tipo: i.tipo, titulo: i.titulo, detalhe: i.detalhe, q: i.q, exemplo: true })),
    ...f.notas.map((n): ItemAtividade => ({ id: n.id, tipo: "nota", titulo: n.texto, detalhe: n.autor, q: n.q, exemplo: n.exemplo })),
  ]);
}

const PROBABILIDADE: Record<string, number> = {
  Lead: 10, Contacto: 20, Visita: 40, Orçamento: 50, Proposta: 70, "Proposta conjunta": 70, Contrato: 90, Financeiro: 95, Obra: 100,
};
/** A probabilidade (de exemplo, em %) de fechar, por tipo de documento ou etapa. */
export const probabilidade = (tipo: string): number => PROBABILIDADE[tipo] ?? 30;

/** A UTM em bruto do primeiro toque, ou vazio. */
export function utmDe(S: Estado, p: PessoaApp): string {
  return utmTexto(toquesDe(S, p.nome)[0]?.utm ?? null);
}

/** Os campos de origem e atribuição (via, origem, canal, campanha, formulário, primeiro e último toque) e o aviso. */
export const infoOrigemDe = (S: Estado, p: PessoaApp): ReturnType<typeof infoOrigem> => infoOrigem(toquesDe(S, p.nome));

/** O texto do próximo passo da pessoa (para as linhas). */
export const proximoTexto = (p: PessoaApp, S: Estado): string => proximoDe(p, S).t;

/* ---------------------------------------------------------------- o percurso do negócio */

export const PASSOS_PERCURSO = ["Levantamento", "Orçamento", "Proposta", "Contrato"] as const;
export type EstadoPasso = "feito" | "atual" | "seguinte";
export interface PassoPercurso { nome: string; estado: EstadoPasso }

/** O passo em que o negócio está (0 a 3); 4 quando o percurso está completo (contrato, ou venda direta aceite).
 *  A venda direta também envia uma proposta ao cliente (o motor diz "Enviar a proposta", e só dispensa o contrato depois de aceite),
 *  por isso enquanto está enviada e por aceitar o passo é "Proposta" e o estado "Proposta enviada", como nos outros negócios. */
function passoAtual(d: Negocio): number {
  const o = d.orc;
  if (d.fase >= 4) return 4;
  if (d.fase < 3) return 0;
  if (!o?.enviada) return 1;
  if (!o.aceite) return 2;
  return !o.vendaDireta && o.contrato !== "assinado" ? 3 : 4;
}

/** Levantamento, Orçamento, Proposta e Contrato: o que já está feito, o passo atual e os que faltam. */
export function percursoDe(d: Negocio): PassoPercurso[] {
  const a = passoAtual(d);
  return PASSOS_PERCURSO.map((nome, i): PassoPercurso => ({ nome, estado: i < a ? "feito" : i === a ? "atual" : "seguinte" }));
}

/** O rótulo do negócio: onde está, em palavras (uma lead ainda sem documentos está "Em preparação"). */
export function estadoNegocio(d: Negocio): string {
  return ["Em preparação", "Orçamento por enviar", "Proposta enviada", "Contrato por assinar", "Em contrato"][passoAtual(d)];
}

/** O estado numa só palavra, para a lista de negócios: Em preparação, Orçamento, Proposta, Contrato, e depois Financeiro ou Obra. */
export function estadoCurto(d: Negocio): string {
  if (d.fase >= 5) return "Obra";
  if (d.fase === 4) return "Financeiro";
  return ["Em preparação", "Orçamento", "Proposta", "Contrato", "Contrato"][passoAtual(d)];
}

export interface Falta { titulo: string; passos: string[]; campos: string[] }
const PASSOS_LEVANTAMENTO = ["Registar a chamada", "Marcar a visita", "Fechar o levantamento"];

/** Os grupos de campos que travam o passo seguinte (os mesmos do motor, sem os extras da visita). */
function gruposDoPasso(d: Negocio): Grupo[] {
  return d.fase === 0 ? LEAD : d.fase === 1 ? CONTACTO : [...visitas(d).map(grupoVisita), EXTERIOR, INTERIOR, AREA, ESCOLHAS];
}

/** O que falta para o orçamento (leads) ou para o contrato (de orçamento em diante), derivado da fase e do motor. */
export function faltaParaOrcamento(S: Estado, d: Negocio): Falta {
  if (d.fase >= 3) {
    const p = proximo(d, S);
    return { titulo: "O que falta para o contrato", passos: passoAtual(d) >= 4 || p.done ? [] : [p.t], campos: [] };
  }
  const gs = gruposDoPasso(d).map((g) => efetivo(S.campos, g)).filter((g) => !g.oculto);
  return { titulo: "O que falta para o orçamento", passos: PASSOS_LEVANTAMENTO.slice(d.fase), campos: [...new Set(emFalta(gs, d.f).map((c) => c.l))] };
}

/* ---------------------------------------------------------------- factos do Resumo */

export interface Facto { rotulo: string; valor: string; exemplo?: boolean }

/** Os pares rótulo e valor da faixa de factos da ficha (a saúde tem o seu bloco). */
export function factosDe(p: PessoaApp, f: Perfil): Facto[] {
  const d = p.principal;
  return [
    { rotulo: "Origem", valor: f.origem }, { rotulo: "Comercial", valor: f.comercial }, { rotulo: "Criada", valor: f.criadaHa || f.criada }, { rotulo: "Serviço", valor: d.servico },
    { rotulo: "Tipo de cliente", valor: d.f.tipo_cliente || "Particular", exemplo: !d.f.tipo_cliente },
    ...(d.f.pref ? [{ rotulo: "Contacto preferido", valor: d.f.pref.toLowerCase() }] : []),
    ...(d.f.posse ? [{ rotulo: "Situação", valor: d.f.posse }] : []),
  ];
}

const FACTOS_RESUMO: readonly string[] = ["Comercial", "Criada", "Tipo de cliente", "Contacto preferido"];

/** Os factos que o Resumo da ficha mostra em lista pequena: a origem e o serviço têm o seu sítio, e a saúde a sua barra. */
export const factosResumo = (p: PessoaApp, f: Perfil): Facto[] => factosDe(p, f).filter((x) => FACTOS_RESUMO.includes(x.rotulo));
