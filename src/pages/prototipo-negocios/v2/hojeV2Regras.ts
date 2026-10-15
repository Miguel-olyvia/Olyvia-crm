// As regras do Hoje da V2, sem React: um só Hoje por papel. Cada coisa aparece UMA vez (uma linha por pessoa no Comercial, por negócio
// nos outros papéis), com a razão em texto e pela ordem de prioridade. Só lê: o Estado, as regras da V2 funcional (funcHoje.ts e
// funcNegocios.ts), a agenda de Hoje.tsx e o que o Hoje da V2 guarda em memória (hojeV2Store.ts). Nada aqui escreve em lado nenhum.
import { CONTACTO, efetivo, emFalta } from "../campos";
import { aberto, campoVisita, conflitos, minhas, PAPEIS, visitas, type Estado, type Negocio, type Papel } from "../motor";
import { agenda } from "../Hoje";
import { todosApp, type PessoaApp } from "../pessoasDocs";
import { HOJE_FUNC, hojePessoas, type IdGrupo } from "../funcHoje";
import { grupoN, hojeNegocios, paradoTexto, type IdGrupoN } from "../funcNegocios";
import { linhasNegocios, selecionarQuadro, SEM_FILTROS_N } from "../filtrosNegocios";
import { somarDias } from "../leadsDocs";
import type { Registo } from "../diaADia";
import type { DadosHojeV2, TarefaV2 } from "./hojeV2Store";

/** O "hoje" do protótipo: o mesmo das regras da V2 funcional (10/10/2026, um sábado). */
export const HOJE_V2 = HOJE_FUNC;
const ANO = 2026;

/* ---------------------------------------------------------------- as categorias (os contadores) */

export type CatV2 =
  | "tarefas" | "contactar" | "visitas" | "orcamento" | "espera" | "contrato" | "faturar"
  | "aprovar" | "faturas" | "pagamentos" | "encomendas" | "receber" | "planos" | "arrancar" | "obras" | "fazer";

/** O nome de cada contador e a prioridade (menor primeiro). */
export const CATEGORIAS: Record<CatV2, { nome: string; prioridade: number }> = {
  tarefas: { nome: "Tarefas para hoje", prioridade: 0 },
  aprovar: { nome: "Exceções por aprovar", prioridade: 1 },
  contactar: { nome: "Contactar", prioridade: 2 },
  visitas: { nome: "Visitas", prioridade: 3 },
  orcamento: { nome: "Orçamentos por enviar", prioridade: 4 },
  espera: { nome: "À espera do cliente", prioridade: 5 },
  contrato: { nome: "Contratos por assinar", prioridade: 6 },
  faturar: { nome: "A faturar", prioridade: 7 },
  faturas: { nome: "Faturas por registar", prioridade: 2 },
  pagamentos: { nome: "Pagamentos por validar", prioridade: 3 },
  encomendas: { nome: "Encomendas por confirmar", prioridade: 2 },
  receber: { nome: "Encomendas por receber", prioridade: 3 },
  planos: { nome: "Planos por aprovar", prioridade: 2 },
  arrancar: { nome: "Obras por arrancar", prioridade: 3 },
  obras: { nome: "Obras em curso", prioridade: 4 },
  fazer: { nome: "Outros passos", prioridade: 8 },
};

/** Os contadores que cada papel vê sempre (mesmo a zero), pela ordem. As tarefas e "Outros passos" só aparecem quando há. */
export const CATS_PAPEL: Record<Papel, readonly CatV2[]> = {
  comercial: ["contactar", "visitas", "orcamento", "espera", "contrato", "faturar"],
  direcao: ["aprovar"],
  financeiro: ["faturas", "pagamentos"],
  armazem: ["encomendas", "receber"],
  operacoes: ["planos", "arrancar", "obras"],
  juridico: [],
};

/* ---------------------------------------------------------------- uma linha do Hoje */

export interface ItemV2 {
  /** Único na lista: o nome da pessoa (Comercial) ou o número do negócio (outros papéis). */
  chave: string;
  nome: string;
  servico: string;
  /** A fase do motor (para o ícone). */
  fase: number;
  /** O negócio da seed, que tem página própria; `null` numa pessoa de exemplo. */
  dealId: number | null;
  cat: CatV2;
  razao: string;
  /** As outras razões da mesma pessoa (que não a fazem aparecer outra vez). */
  outras: string[];
  atraso: boolean;
  /** Lead em "Contactar": pode marcar-se a visita na linha. */
  podeVisita: boolean;
  /** O passo do motor que a linha pode fazer (os outros papéis). */
  acao: { rotulo: string; act: string } | null;
  /** Direção: aprovar ou recusar a exceção à margem. */
  aprovar: boolean;
  papel: "lead" | "cliente" | null;
  exemplo: boolean;
  /** As tarefas por fazer desta pessoa, da mais próxima para a mais distante. */
  tarefas: TarefaV2[];
}

const ordemItens = (a: ItemV2, b: ItemV2): number =>
  CATEGORIAS[a.cat].prioridade - CATEGORIAS[b.cat].prioridade || Number(b.atraso) - Number(a.atraso);

/** A ordem de prioridade (estável: em empate fica a ordem de origem). */
export const ordenarItens = (xs: readonly ItemV2[]): ItemV2[] => [...xs].sort(ordemItens);

/* ---------------------------------------------------------------- datas "dd/mm" */

const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const partes = (dia: string): [number, number] | null => {
  const m = /(\d{1,2})\/(\d{1,2})/.exec(dia);
  return m ? [+m[1], +m[2]] : null;
};
const doisDigitos = (n: number): string => String(n).padStart(2, "0");

/** "15/10" passa a "qui 15/10". */
export function rotuloDia(dia: string): string {
  const p = partes(dia);
  if (!p) return dia;
  const d = new Date(Date.UTC(ANO, p[1] - 1, p[0]));
  return `${DIAS_SEMANA[d.getUTCDay()]} ${doisDigitos(p[0])}/${doisDigitos(p[1])}`;
}

/** Um número que ordena as datas "dd/mm" do mesmo ano. */
export const ordemDia = (dia: string): number => { const p = partes(dia); return p ? p[1] * 100 + p[0] : 0; };

/** Os `n` dias a partir de hoje (hoje incluído): a faixa da semana. */
export function semana(hoje = HOJE_V2, n = 7): { dia: string; rotulo: string; hoje: boolean }[] {
  return Array.from({ length: n }, (_, i) => { const dia = somarDias(hoje, i); return { dia, rotulo: rotuloDia(dia), hoje: i === 0 }; });
}

/** Os próximos `n` dias úteis depois de hoje: os dias que se podem escolher para uma visita. */
export function diasVisita(hoje = HOJE_V2, n = 5): { dia: string; rotulo: string }[] {
  const r: { dia: string; rotulo: string }[] = [];
  for (let i = 1; r.length < n && i < 30; i++) {
    const dia = somarDias(hoje, i), rot = rotuloDia(dia);
    if (!rot.startsWith("sáb") && !rot.startsWith("dom")) r.push({ dia, rotulo: rot });
  }
  return r;
}

export const HORAS_VISITA = ["09:30", "11:00", "14:30", "16:00"] as const;

/** A vaga no formato do motor ("qui 15/10 · 10:00"), que `marcarVisita` sabe ler. */
export const slotDe = (rotulo: string, hora: string): string => `${rotulo} · ${hora}`;

/** "Hoje", "Amanhã" ou "Em 3 dias (13/10)". */
export function quandoTexto(dias: number, hoje = HOJE_V2): string {
  if (dias <= 0) return "hoje";
  if (dias === 1) return `amanhã (${somarDias(hoje, 1)})`;
  return `${rotuloDia(somarDias(hoje, dias))}`;
}

/* ---------------------------------------------------------------- marcar a visita: o motor ou a memória */

/** Os campos do Contacto em falta: o portão que `marcarVisita` aplica antes de passar o negócio a Visita. */
export function faltamContacto(S: Estado, d: Negocio): string[] {
  const gs = CONTACTO.map((g) => efetivo(S.campos, g)).filter((g) => !g.oculto);
  return emFalta(gs, d.f).map((c) => c.l);
}

/** `motor`: o negócio `id` passa a Visita pelo motor; senão a visita fica em memória e `motivo` diz porquê. */
export interface DestinoVisita { motor: boolean; id: number | null; motivo: string }

/** Onde fica a visita marcada na linha: no motor (o negócio passa a Visita) só com um negócio da seed em Contacto e o Contacto completo; senão em memória, com o motivo em texto. */
export function destinoVisita(S: Estado, dealId: number | null): DestinoVisita {
  const d = dealId === null ? undefined : S.deals.find((x) => x.id === dealId);
  const memoria = (motivo: string): DestinoVisita => ({ motor: false, id: null, motivo });
  if (!d) return memoria("Pessoa de exemplo: a visita fica guardada só nesta sessão.");
  if (d.fase === 0) return memoria("O negócio ainda está em Lead: a visita fica guardada nesta sessão; o negócio passa a Visita depois de registar a chamada.");
  if (d.fase !== 1) return memoria("O negócio já passou da fase Contacto: a visita fica guardada nesta sessão.");
  const f = faltamContacto(S, d);
  if (f.length) {
    const quais = f.slice(0, 3).join(", ") + (f.length > 3 ? "…" : "");
    return memoria(`${f.length === 1 ? "Falta 1 campo" : `Faltam ${f.length} campos`} do Contacto (${quais}): a visita fica guardada nesta sessão; para o negócio passar a Visita, preencha-os no negócio.`);
  }
  return { motor: true, id: d.id, motivo: "" };
}

/* ---------------------------------------------------------------- o Hoje do Comercial */

const CAT_PESSOA: Record<IdGrupo, CatV2> = { contactar: "contactar", visitas: "visitas", espera: "espera", contratos: "contrato" };
const CAT_NEGOCIO: Record<IdGrupoN, CatV2> = { orcamento: "orcamento", proposta: "espera", contrato: "contrato", faturar: "faturar" };

interface Candidato { nome: string; cat: CatV2; razao: string; deNegocio: boolean }

const naSeed = (S: Estado, id: number): boolean => S.deals.some((d) => d.id === id);

function itemDePessoa(S: Estado, p: PessoaApp, cat: CatV2, razao: string, outras: string[]): ItemV2 {
  const d = p.principal, seed = naSeed(S, d.id);
  return {
    chave: p.nome, nome: p.nome, servico: d.servico, fase: d.fase, dealId: seed ? d.id : null, cat, razao, outras,
    atraso: !!d.atraso, podeVisita: cat === "contactar" && p.papel === "lead", acao: null, aprovar: false, papel: p.papel, exemplo: p.exemplo, tarefas: [],
  };
}

/**
 * O Hoje do Comercial: as quatro listas de Pessoas (funcHoje.ts) e as quatro de Negócios (funcNegocios.ts) numa só, com UMA linha por
 * pessoa. A razão da linha é a de maior prioridade; as outras ficam em `outras`. Um negócio que só repete a lista da pessoa não se repete.
 * Uma visita guardada na linha tira a pessoa de "Contactar" e põe-na em "Visitas".
 */
export function hojeComercial(S: Estado, regs: readonly Registo[], dados: DadosHojeV2): ItemV2[] {
  const cand: Candidato[] = [];
  const comVisita = new Map(dados.visitas.map((v) => [v.nome, v]));
  for (const g of hojePessoas(S, regs)) for (const i of g.itens) {
    const cat = g.id === "contratos" && !i.razao.startsWith("Contrato") ? "faturar" : CAT_PESSOA[g.id];
    if (cat === "contactar" && comVisita.has(i.p.nome)) continue;
    // a visita acabou de ser marcada pelo motor (o negócio passou a Visita): sai de Contactar e entra em Visitas, mesmo que o último
    // contacto ainda diga "ligar mais tarde" (a regra de funcHoje.ts põe Contactar à frente de Visitas)
    const d = i.p.principal;
    if (cat === "contactar" && d.fase === 2 && d.visita.slot && visitas(d).some((n) => campoVisita(d, n, "estado") === "Marcada")) {
      cand.push({ nome: i.p.nome, cat: "visitas", razao: `Visita ${d.visita.slot}`, deNegocio: false });
      continue;
    }
    cand.push({ nome: i.p.nome, cat, razao: i.razao, deNegocio: false });
  }
  for (const v of dados.visitas) cand.push({ nome: v.nome, cat: "visitas", razao: `Visita marcada ${v.rotulo} · ${v.hora}`, deNegocio: false });
  const quadro = selecionarQuadro(linhasNegocios(S), { rapido: "meus", q: "", f: SEM_FILTROS_N });
  for (const g of hojeNegocios(quadro)) for (const l of g.linhas) {
    const cat = CAT_NEGOCIO[g.id];
    // a lista da pessoa já o diz ("Proposta enviada há 5 dias", "Por faturar · Cozinha (e mais 1)"): não se repete
    if (cand.some((c) => !c.deNegocio && c.nome === l.negocio.nome && c.cat === cat)) continue;
    cand.push({ nome: l.negocio.nome, cat, razao: `${paradoTexto(l)} · ${l.negocio.titulo}`, deNegocio: true });
  }
  const pessoas = new Map(todosApp(S).map((p) => [p.nome, p]));
  const porNome = new Map<string, Candidato[]>();
  for (const c of cand) porNome.set(c.nome, [...(porNome.get(c.nome) ?? []), c]);
  const itens: ItemV2[] = [];
  for (const [nome, cs] of porNome) {
    const p = pessoas.get(nome);
    if (!p) continue;
    const [primeiro, ...resto] = [...cs].sort((a, b) => CATEGORIAS[a.cat].prioridade - CATEGORIAS[b.cat].prioridade);
    const outras = [...new Set(resto.map((c) => c.razao))].filter((r) => r !== primeiro.razao);
    itens.push(itemDePessoa(S, p, primeiro.cat, primeiro.razao, outras));
  }
  return juntarTarefas(S, ordenarItens(itens), dados.tarefas);
}

/* ---------------------------------------------------------------- o Hoje dos outros papéis */

/** A categoria de um negócio no Hoje de um papel que não o Comercial. */
export function categoriaDe(d: Negocio): CatV2 {
  if (d.fase === 4 && !d.fin.fatura) return "faturas";
  if (d.fin.fatura && !d.fin.pago) return "pagamentos";
  if (d.obra.plano?.estado === "por aprovar") return "planos";
  if (d.obra.enc?.estado === "por confirmar") return "encomendas";
  if (d.obra.enc?.estado === "encomendada") return "receber";
  if (d.obra.plano?.estado === "aprovado") return "arrancar";
  if (d.obra.plano?.estado === "em curso") return "obras";
  return "fazer";
}

function itemDeNegocio(d: Negocio, cat: CatV2, razao: string, extra: Partial<ItemV2> = {}): ItemV2 {
  return {
    chave: String(d.id), nome: d.nome, servico: d.servico, fase: d.fase, dealId: d.id, cat, razao, outras: [], atraso: !!d.atraso && d.fase === 0,
    podeVisita: false, acao: null, aprovar: false, papel: null, exemplo: false, tarefas: [], ...extra,
  };
}

/**
 * O Hoje da Direção, do Financeiro, do Armazém e das Operações: os passos do papel (`minhas` do motor) e a agenda (`agenda` de Hoje.tsx),
 * uma linha por negócio. O Financeiro não emite faturas, regista-as (a Olyvia não é programa certificado): o passo diz "Registar fatura".
 */
export function hojePapel(S: Estado, r: Papel, dados: DadosHojeV2): ItemV2[] {
  const itens: ItemV2[] = [];
  for (const { d, p, dir } of minhas(S, r)) {
    if (dir) { itens.push(itemDeNegocio(d, "aprovar", `Aprovar a exceção à margem · ${p.sub}`, { aprovar: true })); continue; }
    const registar = p.act === "emitir";
    const razao = registar ? "Registar a fatura emitida no programa de faturação" : p.t + (p.sub ? ` · ${p.sub}` : "");
    const acao = p.btn && p.act ? { rotulo: registar ? "Registar fatura" : p.btn, act: p.act } : null;
    itens.push(itemDeNegocio(d, categoriaDe(d), razao, { acao }));
  }
  for (const c of agenda(S, r)) {
    if (itens.some((i) => i.dealId === c.d.id)) continue;
    itens.push(itemDeNegocio(c.d, categoriaDe(c.d), c.titulo + (c.onde ? ` · ${c.onde}` : "")));
  }
  return juntarTarefas(S, ordenarItens(itens), dados.tarefas);
}

/** O Hoje do papel: o do Comercial junta Pessoas e Negócios; os outros vêm dos passos e da agenda. */
export const hojeV2 = (S: Estado, r: Papel, regs: readonly Registo[], dados: DadosHojeV2): ItemV2[] =>
  r === "comercial" ? hojeComercial(S, regs, dados) : hojePapel(S, r, dados);

/* ---------------------------------------------------------------- as tarefas */

/**
 * Junta as tarefas às linhas: cada linha leva as tarefas por fazer da pessoa; uma tarefa para hoje põe a linha em "Tarefas para hoje"
 * (a razão antiga passa para `outras`), e uma pessoa que não estava no Hoje entra por causa dela. Nunca duplica uma pessoa.
 */
export function juntarTarefas(S: Estado, itens: readonly ItemV2[], tarefas: readonly TarefaV2[]): ItemV2[] {
  const abertas = tarefas.filter((t) => !t.feita).sort((a, b) => a.dias - b.dias);
  if (!abertas.length) return [...itens];
  const r = itens.map((i) => ({ ...i, tarefas: abertas.filter((t) => t.nome === i.nome) }));
  for (const t of abertas.filter((x) => x.dias <= 0)) {
    const razao = `Tarefa para hoje: ${t.titulo}`;
    const i = r.find((x) => x.nome === t.nome);
    if (i) {
      if (i.cat !== "tarefas") { i.outras = [i.razao, ...i.outras]; i.razao = razao; i.cat = "tarefas"; }
      else if (i.razao !== razao && !i.outras.includes(razao)) i.outras = [...i.outras, razao];
      continue;
    }
    const d = t.dealId === null ? undefined : S.deals.find((x) => x.id === t.dealId);
    const p = todosApp(S).find((x) => x.nome === t.nome);
    const novo = p ? itemDePessoa(S, p, "tarefas", razao, []) : d ? itemDeNegocio(d, "tarefas", razao) : null;
    if (novo) r.push({ ...novo, tarefas: abertas.filter((x) => x.nome === t.nome) });
  }
  return ordenarItens(r);
}

/* ---------------------------------------------------------------- os contadores */

export interface Contador { cat: CatV2; nome: string; n: number }

/** Os contadores do papel: os de sempre (mesmo a zero) e os que aparecem só quando há (tarefas, outros passos). A soma é o total. */
export function contadores(itens: readonly ItemV2[], r: Papel): Contador[] {
  const n = (c: CatV2): number => itens.filter((i) => i.cat === c).length;
  const cats = (Object.keys(CATEGORIAS) as CatV2[]).filter((c) => CATS_PAPEL[r].includes(c) || n(c) > 0)
    .sort((a, b) => CATEGORIAS[a].prioridade - CATEGORIAS[b].prioridade);
  return cats.map((c) => ({ cat: c, nome: CATEGORIAS[c].nome, n: n(c) }));
}

export const filtrarCat = (itens: readonly ItemV2[], cat: CatV2 | null): ItemV2[] => (cat ? itens.filter((i) => i.cat === cat) : [...itens]);

/* ---------------------------------------------------------------- os alertas que levam a outro ecrã */

/** Para onde leva o alerta. `negocios-atraso` abre Negócios já filtrado ("Com atraso", o filtro do Estado). Os outros só navegam. */
export type DestinoAlerta = "negocios-atraso" | "negocios" | "operacoes" | "inventario";

export interface AlertaV2 { id: string; n: number; texto: string; destino: DestinoAlerta; filtrado: boolean }

/** Os alertas de cada papel que se resolvem noutro ecrã (os que se resolvem aqui são contadores). Só os que têm algum. */
export function alertasV2(S: Estado, r: Papel): AlertaV2[] {
  const ab = aberto(S);
  const todos: (AlertaV2 & { papeis: Papel[] })[] = [
    { id: "atraso", n: ab.filter((d) => d.atraso).length, texto: "Negócios com atraso", destino: "negocios-atraso", filtrado: true, papeis: ["comercial", "direcao"] },
    // Negócios não tem um filtro por fase que se possa ligar daqui (a memória da página é do Rafael/Miguel): só navega.
    { id: "prop", n: ab.filter((d) => d.fase === 3 && d.orc?.enviada && !d.orc.aceite).length, texto: "Propostas à espera do cliente", destino: "negocios", filtrado: false, papeis: ["direcao"] },
    { id: "conf", n: ab.filter((d) => d.obra.plano?.estado === "por aprovar" && conflitos(d.obra.plano).length > 0).length, texto: "Planos de obra com conflitos", destino: "operacoes", filtrado: false, papeis: ["direcao", "operacoes"] },
    { id: "enc", n: ab.filter((d) => d.obra.enc?.estado === "por confirmar").length, texto: "Encomendas ao fornecedor por confirmar", destino: "inventario", filtrado: false, papeis: ["direcao"] },
  ];
  return todos.filter((a) => a.n > 0 && a.papeis.includes(r)).map(({ papeis: _p, ...a }) => a);
}

/* ---------------------------------------------------------------- a equipa (Direção) */

export interface LinhaEquipa {
  comercial: string;
  porContactar: number;
  visitas: number;
  orcamentos: number;
  propostas: number;
  contratos: number;
  /** A soma do valor das propostas à espera do cliente. */
  valorPropostas: number;
  atrasos: number;
}

/** Os números de cada comercial, a partir dos mesmos negócios da V2 (a seed e os de exemplo). Pessoas contam-se uma vez. */
export function equipa(S: Estado): LinhaEquipa[] {
  const linhas = linhasNegocios(S).filter((l) => l.perdido === null);
  const nomes = [...new Set(linhas.map((l) => l.comercial))];
  return nomes.map((comercial) => {
    const ls = linhas.filter((l) => l.comercial === comercial);
    const pessoas = (fase: number): number => new Set(ls.filter((l) => l.negocio.deal.fase === fase && l.doc === null).map((l) => l.negocio.nome)).size;
    const doGrupo = (g: IdGrupoN) => ls.filter((l) => l.cartao !== null && grupoN(l) === g);
    return {
      comercial, porContactar: pessoas(0), visitas: pessoas(2), orcamentos: doGrupo("orcamento").length, propostas: doGrupo("proposta").length,
      contratos: doGrupo("contrato").length, valorPropostas: doGrupo("proposta").reduce((a, l) => a + (l.valor ?? 0), 0), atrasos: ls.filter((l) => l.atraso).length,
    };
  });
}

/* ---------------------------------------------------------------- a agenda da semana */

export interface CompromissoV2 { id: string; dia: string; hora: string; titulo: string; quem: string; dealId: number | null }

const hojeSe = (dia: string | undefined): string => {
  const p = dia ? partes(dia) : null;
  return p ? `${doisDigitos(p[0])}/${doisDigitos(p[1])}` : HOJE_V2;
};

/**
 * A agenda do papel: a de Hoje.tsx (visitas, obras, entregas, pagamentos; sem dia conta como hoje), as visitas das pessoas de exemplo
 * (Comercial), as visitas guardadas na linha e as tarefas por fazer. Uma pessoa não aparece duas vezes no mesmo dia pelo mesmo motivo.
 */
export function agendaV2(S: Estado, r: Papel, regs: readonly Registo[], dados: DadosHojeV2): CompromissoV2[] {
  const L: CompromissoV2[] = agenda(S, r).map((c) => ({
    id: c.id, dia: hojeSe(c.dia), hora: c.hora === "—" ? "" : c.hora, titulo: c.titulo, quem: c.quem + (c.onde ? ` · ${c.onde}` : ""), dealId: c.d.id,
  }));
  // as tarefas entram no fim, por isso aqui só há compromissos (visitas, obras, entregas, pagamentos)
  const ja = (quem: string, dia: string): boolean => L.some((c) => c.dia === dia && c.quem.startsWith(quem));
  if (r === "comercial") for (const g of hojePessoas(S, regs)) if (g.id === "visitas") for (const i of g.itens) {
    const dia = hojeSe(i.razao), hora = /(\d{1,2}:\d{2})/.exec(i.razao)?.[1] ?? "";
    if (!ja(i.p.nome, dia)) L.push({ id: `vp-${i.p.nome}`, dia, hora, titulo: `Visita · ${i.p.principal.servico}`, quem: i.p.nome, dealId: naSeed(S, i.p.principal.id) ? i.p.principal.id : null });
  }
  for (const v of dados.visitas) if (!ja(v.nome, v.dia)) L.push({ id: `vm-${v.id}`, dia: v.dia, hora: v.hora, titulo: `Visita · ${v.servico}`, quem: v.nome, dealId: v.dealId });
  for (const t of dados.tarefas) if (!t.feita) L.push({ id: `t-${t.id}`, dia: somarDias(HOJE_V2, t.dias), hora: "", titulo: `Tarefa: ${t.titulo}`, quem: t.nome, dealId: t.dealId });
  return L.map((c, i) => ({ c, i })).sort((a, b) => ordemDia(a.c.dia) - ordemDia(b.c.dia) || (a.c.hora || "99").localeCompare(b.c.hora || "99") || a.i - b.i).map((x) => x.c);
}

export const doDia = (ag: readonly CompromissoV2[], dia: string | null): CompromissoV2[] => (dia ? ag.filter((c) => c.dia === dia) : [...ag]);

/** O nome de quem vê o Hoje ("Rúben"). */
export const nomePapel = (r: Papel): string => PAPEIS[r].nome;
