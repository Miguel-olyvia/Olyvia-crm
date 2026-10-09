// Protótipo de Negócios (08/10/2026): dados de exemplo e regras.
// Nada daqui lê ou escreve na base de dados; o estado vive no browser.
// É a passagem para React de docs/negocios-2026-10-08/prototipo.html.

import { CATALOGO } from "./catalogo";
import { AREA, CONTACTO, ESCOLHAS, EXTERIOR, FINANCEIRO, INTERIOR, LEAD, OBRA, PROPOSTA, emFalta, grupoVisita, type Grupo } from "./campos";

export const ESTR = 5.06; // €/h de estrutura (exemplo)

export type Papel = "comercial" | "direcao" | "financeiro" | "armazem" | "operacoes";
export const PAPEIS: Record<Papel, { n: string; av: string; nome: string }> = {
  comercial: { n: "Rúben · Comercial", av: "RB", nome: "Rúben" },
  direcao: { n: "Direção", av: "DI", nome: "Direção" },
  financeiro: { n: "Sandra · Financeiro", av: "SA", nome: "Sandra" },
  armazem: { n: "Nuno · Armazém", av: "NU", nome: "Nuno" },
  operacoes: { n: "Filipe · Operações", av: "FI", nome: "Filipe" },
};

export const FASES = ["Lead", "Contacto", "Visita", "Negócio", "Financeiro", "Obra"];

/** Os do pacote têm nome curto (demol, canal…); os do Catálogo têm o id do Catálogo (c1, c2…). */
export type SvcId = string;
export interface Servico {
  n: string;
  un: string;
  h: number;
  eh: number;
  eq: number;
  cons: number;
  preco: number;
  perfil: string;
  semCusto?: boolean;
  stale?: string | null;
}

const SVC0: Record<string, Servico> = {
  demol: { n: "Demolição e entulho", un: "m²", h: 0.5, eh: 25, eq: 0.33, cons: 1.2, preco: 25.48, perfil: "Servente · demolição" },
  canal: { n: "Canalização", un: "pt", h: 2, eh: 25, eq: 0.34, cons: 8.47, preco: 106.05, perfil: "Canalizador" },
  revest: { n: "Revestimento de parede", un: "m²", h: 0.75, eh: 25, eq: 0, cons: 1.01, preco: 26.0, perfil: "Ladrilhador", semCusto: true, stale: "O cimento-cola tem o preço de há 8 meses." },
  pav: { n: "Pavimento cerâmico", un: "m²", h: 0.85, eh: 25, eq: 0, cons: 0.66, preco: 40.32, perfil: "Ladrilhador" },
  loucas: { n: "Montagem de louças", un: "pç", h: 1.35, eh: 25, eq: 0, cons: 1.21, preco: 64.29, perfil: "Canalizador" },
  moveis: { n: "Montagem de móveis", un: "mód", h: 2.5, eh: 25, eq: 0, cons: 2, preco: 118.7, perfil: "Montador" },
  eletr: { n: "Pontos elétricos", un: "pt", h: 1.5, eh: 25, eq: 0.2, cons: 6, preco: 78, perfil: "Eletricista" },
  teto: { n: "Teto falso em pladur", un: "m²", h: 0.9, eh: 25, eq: 0.3, cons: 9.8, preco: 58, perfil: "Montador" },
  pint: { n: "Pintura de tetos e paredes", un: "m²", h: 0.3, eh: 25, eq: 0, cons: 2.1, preco: 17.5, perfil: "Pintor" },
};

export type MedKey = "pav" | "par" | "pts" | "pcs";
export type Medidas = Record<MedKey, number>;
export type StockKey = "cp" | "pv" | "san" | "base" | "cim" | "mov" | "banc";
export type LinhaId = "wc" | "coz";

interface LinhaServico {
  n: string;
  modelo: string;
  nec: string[];
  mat: { d: string; custo: number; preco: number };
  map: [SvcId, MedKey][];
  med: Partial<Record<MedKey, string>>;
  mats: [string, string, (m: Medidas) => number, StockKey][];
}

export const LINHAS: Record<LinhaId, LinhaServico> = {
  wc: {
    n: "Casa de banho", modelo: "WC com base de duche", nec: ["Base de duche", "Sanita suspensa", "Banheira", "Móvel 80 cm"],
    mat: { d: "cerâmico, louças, base, torneiras", custo: 1400, preco: 2168 },
    map: [["demol", "pav"], ["canal", "pts"], ["revest", "par"], ["pav", "pav"], ["loucas", "pcs"]],
    med: { pav: "Pavimento (m²)", par: "Paredes (m²)", pts: "Pontos de água", pcs: "Peças" },
    mats: [
      ["Cerâmico de parede 30×60", "m²", (m) => Math.ceil(m.par * 1.1), "cp"],
      ["Pavimento cerâmico 60×60", "m²", (m) => Math.ceil(m.pav * 1.1), "pv"],
      ["Sanita suspensa com estrutura", "un", () => 1, "san"],
      ["Base de duche 80×120", "un", () => 1, "base"],
      ["Cimento-cola · saco 25 kg", "sacos", (m) => Math.ceil((m.par + m.pav) / 4), "cim"],
    ],
  },
  coz: {
    n: "Cozinha", modelo: "Cozinha linear", nec: ["Bancada em pedra", "Ilha", "Eletrodomésticos", "Mudar canalização"],
    mat: { d: "móveis, bancada, torneira", custo: 3800, preco: 5890 },
    map: [["demol", "pav"], ["canal", "pts"], ["revest", "par"], ["pav", "pav"], ["moveis", "pcs"]],
    med: { pav: "Pavimento (m²)", par: "Paredes (m²)", pts: "Pontos de água", pcs: "Módulos" },
    mats: [
      ["Cerâmico de parede 30×60", "m²", (m) => Math.ceil(m.par * 1.1), "cp"],
      ["Pavimento cerâmico 60×60", "m²", (m) => Math.ceil(m.pav * 1.1), "pv"],
      ["Conjunto de móveis de cozinha", "un", () => 1, "mov"],
      ["Bancada em pedra", "un", () => 1, "banc"],
      ["Cimento-cola · saco 25 kg", "sacos", (m) => Math.ceil((m.par + m.pav) / 4), "cim"],
    ],
  },
};

export interface Tecnico { id: string; n: string; sk: string; ferias: number[] }
export const TECS: Tecnico[] = [
  { id: "js", n: "João Silva", sk: "Servente · demolição", ferias: [] },
  { id: "ra", n: "Rui Alves", sk: "Servente · demolição", ferias: [] },
  { id: "ma", n: "Marco Antunes", sk: "Canalizador", ferias: [] },
  { id: "sf", n: "Sérgio Faria", sk: "Ladrilhador", ferias: [3] },
  { id: "hn", n: "Hugo Neves", sk: "Ladrilhador", ferias: [] },
  { id: "pm", n: "Paulo Mota", sk: "Montador", ferias: [] },
];
const REAL: Record<string, number> = { demol: 0.93, canal: 0.97, revest: 1.23, pav: 1.05, loucas: 0.96, moveis: 1.02, eletr: 1, teto: 1.04, pint: 0.98 };
export const DIAS = ["seg 13/10", "ter 14/10", "qua 15/10", "qui 16/10", "sex 17/10", "seg 20/10", "ter 21/10", "qua 22/10", "qui 23/10", "sex 24/10"];
export const SLOTS = ["qui 15/10 · 10:00", "qui 15/10 · 15:00", "sex 16/10 · 09:30"];

export type LinhaOrc =
  | { t: "svc"; sid: SvcId; q: number; cu: number; pu: number }
  | { t: "mat"; d: string; custo: number; preco: number };

export interface Orcamento {
  modelo: string;
  linhas: LinhaOrc[];
  desconto: number;
  vendaDireta: boolean;
  verif: boolean;
  aprov: null | "pedida" | "ok";
  enviada: string | null;
  aceite: string | null;
  contrato: null | "enviado" | "assinado";
  avisosVistos: Record<string, boolean>;
}
export interface Tarefa { nome: string; svcs: SvcId[]; dia: number; dur: number; sk: string; h: number; tec: string | null }
export interface Plano { tasks: Tarefa[]; estado: "por aprovar" | "aprovado" | "em curso" | "concluída"; dia: number }
export interface MatObra { n: string; un: string; k: StockKey; q: number; res: number; falta: number }
export interface Encomenda { n: string; estado: "por confirmar" | "encomendada" | "recebida"; forn?: string; linhas: { n: string; q: number; un: string }[] }
export interface Real { tasks: { nome: string; prev: number; real: number }[]; custoReal: number; m: number }
export interface Evento { t: string; q: string; k: "a" | "w" | "x" }

export interface Negocio {
  id: number;
  nome: string;
  tel: string;
  linha: LinhaId;
  servico: string;
  local: string;
  origem: string;
  quando: string;
  dono: Papel;
  fase: number;
  perdido: boolean;
  atraso?: boolean;
  fresh?: boolean;
  /** Valores dos campos de todas as fases (chaves em campos.ts). */
  f: Record<string, string>;
  /** Tentou passar de fase com campos em falta: o ecrã marca os campos destes grupos. */
  valida?: { fase: number; grupos: string[] } | null;
  /** Campos preenchidos pela Olyvia (sugestões): o ecrã marca-os até alguém os confirmar ou mudar. */
  sug?: Record<string, true>;
  /** As visitas do negócio (os números; os campos estão em f, com o prefixo v{n}_). */
  vis?: number[];
  /** off: serviços das medidas que o cliente não quer; extra: serviços juntados à mão, com quantidade. */
  visita: { slot: string; nec: string[]; med: Medidas; off: SvcId[]; extra: Partial<Record<SvcId, number>>; fotos: number; fechada: boolean };
  orc: Orcamento | null;
  fin: { fatura: { n: string; q: string } | null; pago: boolean; recibo: { n: string; q: string } | null };
  obra: { plano: Plano | null; enc: Encomenda | null; mats: MatObra[] | null; real: Real | null; aprendido: boolean };
  hist: Evento[];
}

export type Vista = "hoje" | "negocios" | "negocio" | "clientes" | "operacoes" | "inventario" | "catalogo" | "marketing" | "definicoes";

export interface Estado {
  v: number;
  role: Papel;
  view: Vista;
  deal: number | null;
  op: number | null;
  filtro: string;
  novo: { nome: string; tel: string; linha: LinhaId; err: string } | null;
  confirmPerda: number | null;
  pulse?: string | null;
  cfg: { min: number; alvo: number; estrutura: boolean };
  /** "simples": a proposta de 09/10 com menos ruído; "atual": o aspeto de hoje da Olyvia, para comparar. */
  aspeto?: "simples" | "atual";
  /** Leitura fácil (dislexia): letra maior, mais espaço, fundo creme. */
  leitura?: boolean;
  svc: Record<SvcId, Servico>;
  stock: Record<StockKey, number>;
  seq: number;
  ft: number;
  ef: number;
  rc: number;
  clientes: { nome: string; tel: string; local: string; desde: string; deal: number }[];
  deals: Negocio[];
}

type NovoNegocio = Partial<Negocio> & Pick<Negocio, "id" | "nome" | "tel" | "linha">;
function novoDeal(o: NovoNegocio): Negocio {
  return {
    servico: "", local: "", origem: "site", quando: "", dono: "comercial", fase: 0, perdido: false,
    f: {},
    visita: { slot: "", nec: [], med: { pav: 0, par: 0, pts: 0, pcs: 0 }, off: [], extra: {}, fotos: 0, fechada: false },
    orc: null, fin: { fatura: null, pago: false, recibo: null }, obra: { plano: null, enc: null, mats: null, real: null, aprendido: false },
    hist: [],
    ...o,
  };
}

export const VERSAO = 6;

export function seed(): Estado {
  const S: Estado = {
    v: VERSAO, role: "comercial", view: "negocios", deal: null, op: null, filtro: "meus", novo: null, confirmPerda: null,
    cfg: { min: 28, alvo: 35, estrutura: true },
    svc: structuredClone(SVC0),
    stock: { cp: 12, pv: 0, san: 0, base: 3, cim: 40, mov: 0, banc: 2 },
    seq: 1046, ft: 418, ef: 77, rc: 301,
    clientes: [
      { nome: "Tiago Almeida", tel: "913 220 410", local: "Cozinha · Almada", desde: "08/10", deal: 1027 },
      { nome: "Marta Lima", tel: "916 004 552", local: "WC · Odivelas", desde: "01/10", deal: 1022 },
    ],
    deals: [],
  };
  const D = (o: NovoNegocio) => S.deals.push(novoDeal(o));
  D({ id: 1043, nome: "Ana Martins", tel: "912 000 111", linha: "wc", servico: "Remodelação WC suite", local: "Rua das Flores 12, Sintra", origem: "site", quando: "30/09 21:40",
    f: { pedido: "Quero remodelar a casa de banho da suite." }, hist: [{ t: "Pedido pelo site", q: "30/09 21:40", k: "a" }] });
  D({ id: 1044, nome: "Pedro Lopes", tel: "927 118 300", linha: "wc", servico: "WC social", local: "Amadora", origem: "site", quando: "06/10 18:02", atraso: true,
    f: { pedido: "Trocar a banheira por duche." }, hist: [{ t: "Pedido pelo site", q: "06/10 18:02", k: "a" }] });
  D({ id: 1045, nome: "Rita Sousa", tel: "934 500 812", linha: "coz", servico: "Cozinha nova", local: "Loures", origem: "campanha de outono", quando: "08/10 08:15",
    f: { pedido: "Cozinha nova, com bancada em pedra." }, hist: [{ t: "Pedido pela campanha de outono", q: "08/10 08:15", k: "a" }] });
  D({ id: 1038, nome: "Manuel Costa", tel: "918 330 991", linha: "wc", servico: "WC social", local: "Cascais", origem: "telefone", quando: "03/10", fase: 1,
    f: { resultado: "Atendeu · interessado", orc_cliente: "Até 3.000 €", prazo: "1 a 3 meses" }, hist: [{ t: "Chamada · 4 min", q: "05/10 11:20", k: "a" }, { t: "Pedido por telefone", q: "03/10", k: "a" }] });
  D({ id: 1036, nome: "Luísa Freitas", tel: "962 774 105", linha: "coz", servico: "Cozinha", local: "Oeiras", origem: "site", quando: "01/10", fase: 2,
    visita: { slot: "qui 15/10 · 10:00", nec: ["Bancada em pedra"], med: { pav: 0, par: 0, pts: 0, pcs: 0 }, off: [], extra: {}, fotos: 0, fechada: false },
    hist: [{ t: "Visita marcada para qui 15/10 · 10:00", q: "02/10", k: "a" }] });
  D({ id: 1035, nome: "Hugo Matos", tel: "915 662 030", linha: "wc", servico: "WC suite", local: "Lisboa", origem: "recomendação", quando: "28/09", fase: 2,
    visita: { slot: "ter 06/10 · 15:00", nec: ["Base de duche", "Móvel 80 cm"], med: { pav: 5, par: 16, pts: 3, pcs: 3 }, off: [], extra: {}, fotos: 6, fechada: false },
    hist: [{ t: "Visita feita", q: "06/10 15:00", k: "a" }] });
  D({ id: 1031, nome: "Carla Nunes", tel: "938 101 777", linha: "coz", servico: "Cozinha", local: "Setúbal", origem: "site", quando: "22/09", fase: 3,
    visita: { slot: "", nec: ["Bancada em pedra"], med: { pav: 9, par: 14, pts: 2, pcs: 9 }, off: [], extra: {}, fotos: 10, fechada: true }, hist: [] });
  D({ id: 1030, nome: "Sérgio Pinto", tel: "919 440 222", linha: "wc", servico: "WC", local: "Barreiro", origem: "telefone", quando: "25/09", fase: 3,
    visita: { slot: "", nec: ["Base de duche"], med: { pav: 4, par: 14, pts: 3, pcs: 3 }, off: [], extra: {}, fotos: 5, fechada: true }, hist: [] });
  D({ id: 1027, nome: "Tiago Almeida", tel: "913 220 410", linha: "coz", servico: "Cozinha", local: "Almada", origem: "site", quando: "15/09", fase: 4,
    visita: { slot: "", nec: ["Ilha"], med: { pav: 12, par: 18, pts: 2, pcs: 12 }, off: [], extra: {}, fotos: 12, fechada: true }, hist: [] });
  D({ id: 1022, nome: "Marta Lima", tel: "916 004 552", linha: "wc", servico: "WC", local: "Odivelas", origem: "site", quando: "10/09", fase: 5,
    visita: { slot: "", nec: ["Base de duche"], med: { pav: 4, par: 15, pts: 3, pcs: 4 }, off: [], extra: {}, fotos: 8, fechada: true }, hist: [] });
  // O exemplo com tudo preenchido, da lead à obra concluída (para ver o layout inteiro)
  D({ id: 1050, nome: "Joana Ribeiro", tel: "916 480 213", linha: "wc", servico: "Remodelação WC principal", local: "Rua Morais Soares 112, Lisboa",
    origem: "recomendação", quando: "12/09 10:15", fase: 5,
    visita: { slot: "", nec: ["Base de duche", "Sanita suspensa", "Móvel 80 cm"], med: { pav: 5, par: 20, pts: 4, pcs: 4 }, off: [],
      extra: { c28: 1, c3: 1, c14: 1, c19: 1 }, fotos: 9, fechada: true },
    f: EXEMPLO_COMPLETO,
    hist: [] });
  for (const d of S.deals) d.f = { ...exemplo(d), ...d.f };
  for (const d of S.deals) {
    if (d.fase < 2 || d.vis) continue;
    const feita = d.fase >= 3 || d.id === 1035;
    criarVisita(d, visitaDoSlot(d.visita.slot || "qui 01/10 · 10:00", { estado: feita ? "Feita" : "Marcada", presentes: d.f.presentes || "O cliente",
      combinado: feita ? "Levantamento feito, com medidas e fotografias." : "" }));
  }
  {
    const j = by0(S, 1050);
    j.vis = [];
    criarVisita(j, visitaDoSlot("qua 17/09 · 10:00", { estado: "Feita", presentes: "O casal", combinado: "Medidas e fotos tiradas. O casal quer base de duche e móvel suspenso." }));
    criarVisita(j, { tipo: "Escolha de materiais", estado: "Feita", data: "2026-09-19", hora: "15:00", quem: "Hugo (técnico)", presentes: "O casal", duracao: "1 h",
      combinado: "Escolhido o cerâmico 30×60 branco mate e o pavimento a imitar madeira." });
  }
  Object.assign(by0(S, 1035).f, { andar: "2", tem_elevador: "Sim", n_elevadores: "1", estacionamento: "Pago", zona_estacionamento: "Vermelha" });
  for (const d of S.deals) if (d.fase >= 3) d.orc = criarOrc(d, S);
  const by = (id: number) => S.deals.find((d) => d.id === id)!;
  Object.assign(by(1031).orc!, { verif: true, enviada: "05/10" });
  by(1031).hist.push({ t: "Proposta enviada ao portal", q: "05/10", k: "a" });
  Object.assign(by(1030).orc!, { verif: true, enviada: "07/10", vendaDireta: true });
  by(1030).hist.push({ t: "Proposta enviada · venda direta", q: "07/10", k: "a" });
  Object.assign(by(1027).orc!, { verif: true, enviada: "01/10", aceite: "03/10", contrato: "assinado" });
  by(1027).hist.push({ t: "Contrato assinado · cliente criado", q: "08/10", k: "a" });
  {
    const j = by(1050);
    Object.assign(j.orc!, { verif: true, enviada: "19/09", aceite: "21/09", contrato: "assinado" });
    j.fin = { fatura: { n: "FT 2026/380", q: "22/09" }, pago: true, recibo: { n: "RC 2026/270", q: "24/09" } };
    j.f.valor_recebido = String(r2(tot(j, S).pf));
    j.f.protecoes = protecoesSugeridas(j.f);
    j.obra.plano = gerarPlano(j, S);
    j.obra.plano.tasks.forEach((t) => { if (t.tec === "sf") t.tec = "hn"; });
    j.obra.plano.estado = "concluída";
    j.obra.enc = { estado: "recebida", n: "EF 2026/70", linhas: [] };
    j.obra.mats = calcMats(j, S, true);
    j.obra.real = realObra(j, S);
    j.hist = [
      { t: "Obra concluída · margem real " + pct(j.obra.real.m), q: "08/10", k: "a" },
      { t: "Vistoria final e auto de receção assinado", q: "08/10", k: "a" },
      { t: "Obra arrancou", q: "29/09", k: "a" },
      { t: "Pagamento validado · RC 2026/270 emitido", q: "24/09", k: "a" },
      { t: "FT 2026/380 emitida e enviada ao portal do cliente", q: "22/09", k: "a" },
      { t: "Contrato assinado pelo cliente · cliente criado", q: "21/09", k: "a" },
      { t: "Proposta enviada ao portal do cliente", q: "19/09", k: "a" },
      { t: "Levantamento fechado · 9 fotos", q: "17/09", k: "a" },
      { t: "Visita feita", q: "17/09 10:00", k: "a" },
      { t: "Chamada registada · Atendeu · interessado", q: "12/09 15:20", k: "a" },
      { t: "Pedido por recomendação", q: "12/09 10:15", k: "a" },
    ];
    S.clientes.unshift({ nome: j.nome, tel: j.tel, local: "Casa de banho · Lisboa", desde: "21/09", deal: j.id });
  }
  const m = by(1022);
  Object.assign(m.orc!, { verif: true, enviada: "15/09", aceite: "17/09", contrato: "assinado" });
  m.fin = { fatura: { n: "FT 2026/391", q: "18/09" }, pago: true, recibo: { n: "RC 2026/288", q: "22/09" } };
  m.obra.plano = gerarPlano(m, S);
  m.obra.plano.tasks.forEach((t) => { if (t.tec === "sf") t.tec = "hn"; });
  m.obra.plano.estado = "em curso";
  m.obra.plano.dia = 2;
  m.obra.enc = { estado: "recebida", n: "EF 2026/71", linhas: [] };
  m.obra.mats = calcMats(m, S, true);
  m.f.valor_recebido = String(r2(tot(m, S).pf));
  m.hist.push({ t: "Obra em curso · dia 3 de 5", q: "hoje", k: "a" });
  return S;
}

const by0 = (S: Estado, id: number) => S.deals.find((d) => d.id === id)!;

// Todos os campos de todas as fases, preenchidos à mão, como um negócio real acabado.
const EXEMPLO_COMPLETO: Record<string, string> = {
  // Lead
  email: "joana.ribeiro@exemplo.pt", pref: "WhatsApp", hora: "Manhã", idioma: "Português", origem: "Recomendação", recomendou: "Marta Lima (cliente)",
  rgpd: "Sim", tipo_cliente: "Particular", nif: "123456789", concelho: "Lisboa",
  pedido: "Remodelar a casa de banho principal: tirar a banheira e pôr base de duche, com móvel suspenso.",
  // Contacto
  resultado: "Atendeu · interessado", tentativas: "2", imovel: "Apartamento", posse: "Proprietário", decisor: "O próprio",
  orc_cliente: "3.000 a 6.000 €", prazo: "1 a 3 meses", outros_orc: "Não",
  morada: "Rua Morais Soares 112", cp: "1900-345", localidade: "Lisboa", fracao: "3.º Esq.",
  duracao: "1 h 30", presentes: "O casal", nota_visita: "Estacionar na rua de trás. O prédio tem porteiro até às 18h.",
  // Visita · exterior
  acesso: "Fácil", estacionamento: "Pago", zona_estacionamento: "Amarela", tem_elevador: "Sim", n_elevadores: "1", n_andares: "6", andar: "3", n_fracoes_por_andar: "2",
  // Visita · interior
  tipologia: "T3", area_util_m2: "105", n_divisoes: "4", n_casas_banho: "2", ano_construcao: "1950 a 1970", pavimento: "Madeira", eletrica: "Antiga",
  quadro_diferencial: "Não", canalizacao: "Ferro", gas: "Canalizado", amianto: "Não sei", habitada_durante_obra: "Sim", animais: "Sim",
  notas_interior: "Há um gato: manter a porta da cozinha fechada durante a obra.",
  // Visita · área
  diag_tipo_area: "Casa de banho", diag_intervencao_tipo: "Remodelação total", diag_pe_direito_m: "2,7 m", diag_altura_revestimento: "Ao teto",
  diag_pontos_eletricos: "5", diag_gas: "Não há", diag_toalheiro: "Sim", diag_janela: "Sim", diag_local_cortes: "Varanda",
  diag_distancia_entrada: "Média (5–15 m)", diag_mobilada: "Médio", diag_portas_proteger: "3",
  diag_demolir_descricao: "Banheira, azulejo das paredes até ao teto e pavimento.",
  // Visita · escolhas
  gama: "Média", materiais_cliente: "Não", cor_estilo: "Branco mate e madeira clara", diag_cliente_recusou_fotos: "Não",
  // Negócio
  validade: "30 dias", prazo_exec: "8", inicio_prev: "2026-09-29", pagamento: "50% + 50% no fim", iva: "23%", garantia: "2 anos",
  notas_cliente: "Inclui a remoção do entulho e a limpeza final.",
  modelo_contrato: "Empreitada de remodelação", assinatura: "Digital, no portal", representante: "Rúben", multa: "Não",
  // Financeiro
  nome_fiscal: "Joana Ribeiro", nif_fat: "123456789", morada_fiscal_igual: "Sim", email_fat: "joana.ribeiro@exemplo.pt",
  serie: "FT 2026", tranche: "1.ª (adjudicação)", vencimento: "15 dias", metodo: "Transferência",
  data_pag: "2026-09-24", conta: "Banco B · conta obras", comprovativo: "TRF 0924-551",
  // Obra
  responsavel: "Filipe", inicio: "2026-09-29", horario: "Dias úteis 8h–17h", chaves: "O cliente abre", contacto_local: "Joana Ribeiro · 916 480 213",
  condominio: "Sim", contentor: "Não",
  vistoria: "2026-10-08", auto_rececao: "Sim", satisfacao: "5", notas_fecho: "Silicone da base de duche retocado no dia da vistoria.",
};

// Valores de exemplo das fases por onde o negócio já passou.
function exemplo(d: Negocio): Record<string, string> {
  const loc = d.local.split(",").pop()!.trim();
  const mail = d.nome.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ /g, ".") + "@exemplo.pt";
  const origem = d.origem.startsWith("campanha") ? "Campanha" : d.origem === "recomendação" ? "Recomendação" : d.origem === "telefone" ? "Telefone" : "Site";
  const f: Record<string, string> = {
    email: mail, pref: "Telefone", hora: "Fim do dia", idioma: "Português", origem, rgpd: "Sim", tipo_cliente: "Particular", concelho: loc,
  };
  if (origem === "Campanha") f.campanha = "Campanha de outono · Meta Ads";
  if (d.fase >= 1) Object.assign(f, {
    resultado: "Atendeu · interessado", tentativas: "1", imovel: "Apartamento", posse: "Proprietário", decisor: "Com a família",
    orc_cliente: d.linha === "coz" ? "6.000 a 10.000 €" : "3.000 a 6.000 €", prazo: "1 a 3 meses", outros_orc: "Sim",
    morada: "Rua de exemplo, 10", cp: "2700-000", localidade: loc, fracao: "1.º Dto.", duracao: "1 h 30",
  });
  if (d.fase >= 2) Object.assign(f, {
    acesso: "Fácil", estacionamento: "Não pago", tem_elevador: "Não", n_andares: "4", andar: "1", n_fracoes_por_andar: "2",
    tipologia: "T3", area_util_m2: "110", n_casas_banho: "2", diag_tipo_area: d.linha === "coz" ? "Cozinha" : "Casa de banho",
    diag_intervencao_tipo: "Remodelação total",
  });
  if (d.fase >= 3) Object.assign(f, {
    n_divisoes: "6", ano_construcao: "1970 a 1990", pavimento: "Flutuante", eletrica: "Antiga", quadro_diferencial: "Sim", canalizacao: "Ferro", gas: "Canalizado",
    amianto: "Não", habitada_durante_obra: "Sim", animais: "Não", diag_pe_direito_m: "2,6 m", diag_altura_revestimento: "Ao teto", diag_pontos_eletricos: "4",
    diag_gas: "Não há", diag_toalheiro: "Sim", diag_janela: "Sim", diag_local_cortes: "Varanda", diag_distancia_entrada: "Média (5–15 m)", diag_mobilada: "Médio",
    diag_portas_proteger: "3", gama: "Média", materiais_cliente: "Não",
    validade: "30 dias", prazo_exec: "8", pagamento: "50% + 50% no fim", iva: "23%", garantia: "2 anos",
    modelo_contrato: "Empreitada de remodelação", assinatura: "Digital, no portal", representante: "Rúben",
  });
  if (d.fase >= 4) Object.assign(f, {
    nome_fiscal: d.nome, nif_fat: "2" + String(d.id).padStart(8, "0"), morada_fiscal_igual: "Sim", email_fat: mail,
    serie: "FT 2026", tranche: "1.ª (adjudicação)", vencimento: "15 dias", metodo: "Transferência",
  });
  if (d.fase >= 5) Object.assign(f, {
    data_pag: "2026-09-22", conta: "Banco B · conta obras", comprovativo: "TRF 0922-118",
    responsavel: "Filipe", inicio: "2026-10-06", horario: "Dias úteis 8h–17h", chaves: "Chave entregue", contacto_local: d.nome + " · " + d.tel,
    condominio: "Sim", contentor: "Não", protecoes: "Cartão canelado no caminho (12 m), plástico nas 3 portas, proteção do elevador.",
  });
  return f;
}

/* ------------------------------------------------------------------ visitas */
const MESES_DIA = (slot: string) => {
  // "qui 15/10 · 10:00" → { data: "2026-10-15", hora: "10:00" }
  const m = /(\d{1,2})\/(\d{1,2}).*?(\d{1,2}:\d{2})/.exec(slot);
  return m ? { data: `2026-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`, hora: m[3] } : { data: "", hora: "" };
};
export const visitas = (d: Negocio) => d.vis || [];
export const campoVisita = (d: Negocio, n: number, k: string) => d.f[`v${n}_${k}`] || "";
export function criarVisita(d: Negocio, dados: Record<string, string>): number {
  const n = Math.max(0, ...visitas(d)) + 1;
  d.vis = [...visitas(d), n];
  for (const k in dados) if (dados[k]) d.f[`v${n}_${k}`] = dados[k];
  return n;
}
export const visitaFeita = (d: Negocio) => visitas(d).some((n) => campoVisita(d, n, "estado") === "Feita");
const visitaDoSlot = (slot: string, extra: Record<string, string>) => ({ tipo: "Levantamento", quem: "Rúben (comercial)", duracao: "1 h 30", ...MESES_DIA(slot), ...extra });

/* ------------------------------------------------------------------ cálculo */
export const r2 = (x: number) => Math.round(x * 100) / 100;
export function eur(x: number): string {
  const s = (Math.round(x * 100) / 100).toFixed(2).split(".");
  return s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + s[1];
}
export const pct = (x: number) => (x * 100).toFixed(1).replace(".", ",") + "%";
export const nfmt = (x: number) => String(r2(x)).replace(".", ",");

export function custoUn(s: Servico, S: Estado): number {
  return s.h * s.eh + s.eq + s.cons + (S.cfg.estrutura ? s.h * ESTR : 0);
}
export function criarOrc(d: Negocio, S: Estado): Orcamento {
  const L = LINHAS[d.linha], m = d.visita.med, linhas: LinhaOrc[] = [];
  for (const [sid, k] of L.map) {
    const s = S.svc[sid];
    if (!(m[k] > 0) || d.visita.off.includes(sid)) continue;
    linhas.push({ t: "svc", sid, q: m[k], cu: r2(custoUn(s, S)), pu: s.preco });
  }
  // os juntados do Catálogo, pela ordem em que foram juntados
  for (const [sid, q] of Object.entries(d.visita.extra)) {
    const sv = garantirServico(S, sid);
    if (sv && (q || 0) > 0) linhas.push({ t: "svc", sid, q: q!, cu: r2(custoUn(sv, S)), pu: sv.preco });
  }
  linhas.push({ t: "mat", d: L.mat.d, custo: L.mat.custo, preco: L.mat.preco });
  return { modelo: L.modelo, linhas, desconto: 0, vendaDireta: false, verif: false, aprov: null, enviada: null, aceite: null, contrato: null, avisosVistos: {} };
}
export function linhaCalc(l: LinhaOrc, S: Estado): { custo: number; preco: number; h: number; s?: Servico } {
  if (l.t === "mat") return { custo: l.custo, preco: l.preco, h: 0 };
  const s = S.svc[l.sid];
  return { custo: l.cu * l.q, preco: l.pu * l.q, h: s.h * l.q, s };
}
export function tot(d: Negocio, S: Estado) {
  let c = 0, p = 0, h = 0;
  for (const l of d.orc!.linhas) { const x = linhaCalc(l, S); c += x.custo; p += x.preco; h += x.h; }
  const pf = p * (1 - (d.orc!.desconto || 0) / 100);
  return { custo: c, preco: p, pf, h, m: pf > 0 ? (pf - c) / pf : 0 };
}
export function partes(d: Negocio, S: Estado) {
  const o = { mo: 0, eq: 0, cons: 0, estr: 0, mat: 0 };
  for (const l of d.orc!.linhas) {
    if (l.t === "mat") { o.mat += l.custo; continue; }
    const s = S.svc[l.sid];
    o.mo += s.h * s.eh * l.q; o.eq += s.eq * l.q; o.cons += s.cons * l.q;
    if (S.cfg.estrutura) o.estr += s.h * ESTR * l.q;
  }
  return o;
}

export interface Alerta { k: "x" | "w"; t: string; d: string; fix?: boolean; i?: number; sug?: number; aprov?: boolean; go?: Vista; key?: string }
export function alertas(d: Negocio, S: Estado): Alerta[] {
  const A: Alerta[] = [], min = S.cfg.min / 100, alvo = S.cfg.alvo / 100, o = d.orc!, vistos = o.avisosVistos || {};
  o.linhas.forEach((l, i) => {
    if (l.t !== "svc") return;
    const s = S.svc[l.sid], x = linhaCalc(l, S), m = x.preco > 0 ? (x.preco - x.custo) / x.preco : 0;
    if (x.preco < x.custo) A.push({ k: "x", fix: true, t: `Preço abaixo do custo em ${s.n}`, d: `${eur(l.pu)} €/${s.un} não cobre o custo de ${eur(l.cu)} €/${s.un}. Não se envia assim.`, i, sug: r2(l.cu / (1 - alvo)), aprov: false });
    else if (m < min) A.push({ k: "x", fix: true, t: `Margem abaixo do mínimo em ${s.n}`, d: `${pct(m)} nesta linha, com um mínimo de ${S.cfg.min}%. O preço de tabela (${eur(l.pu)} €/${s.un}) mal cobre o custo do Catálogo.`, i, sug: r2(l.cu / (1 - alvo)), aprov: true });
    if (s.semCusto && !vistos["sc" + l.sid]) A.push({ k: "w", t: `Técnico sem custo/hora (${s.perfil.toLowerCase()})`, d: `Foi usado o custo médio do perfil (${eur(s.eh)} €/h). Define-se no Catálogo.`, go: "catalogo", key: "sc" + l.sid });
    if (s.stale && !vistos["st" + l.sid]) A.push({ k: "w", t: "Preço desatualizado", d: s.stale, key: "st" + l.sid });
  });
  const T = tot(d, S);
  if (o.desconto > 0 && T.m < min) A.push({ k: "x", t: `O desconto de ${nfmt(o.desconto)}% deixa a margem em ${pct(T.m)}`, d: `Abaixo do mínimo de ${S.cfg.min}%. Baixe o desconto ou peça aprovação.`, aprov: true });
  else if (T.m < min && !A.some((a) => a.k === "x")) A.push({ k: "x", t: `Margem total de ${pct(T.m)}`, d: `Abaixo do mínimo de ${S.cfg.min}%.`, aprov: true });
  return A;
}
export function bloqueado(d: Negocio, S: Estado): boolean {
  const A = alertas(d, S).filter((a) => a.k === "x");
  if (!A.length) return false;
  if (d.orc!.aprov === "ok" && A.every((a) => a.aprov)) return false;
  return true;
}
export function calcMats(d: Negocio, S: Estado, jaReservado: boolean): MatObra[] {
  const L = LINHAS[d.linha], m = d.visita.med;
  return L.mats.map(([n, un, f, k]) => {
    const q = f(m);
    const ha = jaReservado ? q : Math.min(q, S.stock[k] || 0);
    return { n, un, k, q, res: ha, falta: q - ha };
  });
}
export function gerarPlano(d: Negocio, S: Estado): Plano {
  const h = (sid: SvcId) => {
    const l = d.orc!.linhas.find((x) => x.t === "svc" && x.sid === sid);
    return l && l.t === "svc" ? S.svc[sid].h * l.q : 0;
  };
  const mont: SvcId = d.linha === "wc" ? "loucas" : "moveis";
  const T: Tarefa[] = [
    { nome: "Demolição", svcs: ["demol"] as SvcId[], dia: 0, dur: 1, sk: "Servente · demolição" },
    { nome: d.visita.extra.eletr ? "Canalização e eletricidade" : "Canalização", svcs: ["canal", "eletr"] as SvcId[], dia: 1, dur: 1, sk: "Canalizador" },
    { nome: "Revestimento e pavimento", svcs: ["revest", "pav"] as SvcId[], dia: 2, dur: 2, sk: "Ladrilhador" },
    { nome: d.linha === "wc" ? "Louças e acabamentos" : "Móveis e acabamentos", svcs: [mont, "teto", "pint"] as SvcId[], dia: 4, dur: 1, sk: mont === "loucas" ? "Canalizador" : "Montador" },
  ]
    .map((t, i) => {
      const of: Record<string, number> = { "Demolições": 0, "Canalização": 1, "Gás (ITG)": 1, "Eletricidade": 1, "Revestimentos": 2, "Carpintaria": 3, "Pintura": 3 };
      const mais = Object.keys(d.visita.extra).filter((sid) => !t.svcs.includes(sid) && of[S.svc[sid]?.perfil] === i);
      return { ...t, svcs: [...t.svcs, ...mais] };
    })
    .filter((t) => t.svcs.some((s) => h(s) > 0))
    .map((t) => {
      const tec = TECS.find((x) => x.sk === t.sk);
      return { ...t, h: r2(t.svcs.reduce((a, s) => a + h(s), 0)), tec: tec ? tec.id : null };
    });
  return { tasks: T, estado: "por aprovar", dia: 0 };
}
export function conflitos(p: Plano) {
  const C: { t: Tarefa; tec: Tecnico; dia: number }[] = [];
  for (const t of p.tasks) {
    const tec = TECS.find((x) => x.id === t.tec);
    if (!tec) continue;
    for (let k = t.dia; k < t.dia + t.dur; k++) if (tec.ferias.includes(k)) { C.push({ t, tec, dia: k }); break; }
  }
  return C;
}
export function realObra(d: Negocio, S: Estado): Real {
  let extra = 0;
  const tasks = d.obra.plano!.tasks.map((t) => {
    let hr = 0;
    for (const sid of t.svcs) {
      const l = d.orc!.linhas.find((x) => x.t === "svc" && x.sid === sid);
      if (!l || l.t !== "svc") continue;
      const s = S.svc[sid];
      const hp = s.h * l.q, h2 = hp * (REAL[sid] || 1);
      hr += h2;
      extra += (h2 - hp) * (s.eh + (S.cfg.estrutura ? ESTR : 0));
    }
    return { nome: t.nome, prev: t.h, real: r2(hr) };
  });
  const T = tot(d, S);
  const custoReal = T.custo + extra;
  return { tasks, custoReal, m: (T.pf - custoReal) / T.pf };
}
export const fatorReal = (sid: SvcId) => REAL[sid] ?? 1;

/** Um serviço do Catálogo passa a existir em S.svc quando se junta pela primeira vez. */
export function garantirServico(S: Estado, sid: SvcId): Servico | null {
  if (S.svc[sid]) return S.svc[sid];
  const c = CATALOGO.find((x) => x.id === sid);
  if (!c) return null;
  const h = r2(c.hu + c.hf / Math.max(1, c.qm)); // as horas fixas repartidas pela quantidade habitual
  const custo = h * (25 + ESTR);
  S.svc[sid] = { n: c.n, un: c.un, h, eh: 25, eq: 0, cons: 0, preco: r2(custo / (1 - 0.35)), perfil: c.cat };
  return S.svc[sid];
}

/* ------------------------------------------------------------------ próximo passo */
export interface Proximo {
  t: string;
  sub?: string;
  btn?: string;
  act?: string;
  who?: Papel | "cliente" | null;
  wait?: boolean;
  sim?: "aceitar" | "assinar";
  done?: boolean;
}
export function proximo(d: Negocio, S: Estado): Proximo {
  if (d.perdido) return { t: "Negócio perdido", who: null };
  const o = d.orc;
  switch (d.fase) {
    case 0: return { t: "Registar a chamada", sub: "Ligar ao cliente e anotar o resultado.", btn: "Registar chamada", act: "contactar", who: "comercial" };
    case 1: return { t: "Marcar a visita", sub: "Escolher uma vaga na agenda do comercial.", btn: "Marcar visita", act: "marcarVisita", who: "comercial" };
    case 2: return { t: "Fechar o levantamento", sub: "Confirmar o local, as necessidades e as medidas.", btn: "Fechar levantamento", act: "fecharVisita", who: "comercial" };
    case 3:
      if (!o!.enviada) {
        if (!o!.verif) return { t: "Verificar e enviar a proposta", sub: "A Olyvia verifica as margens e os custos antes de enviar.", btn: "Verificar", act: "verificar", who: "comercial" };
        if (bloqueado(d, S))
          return o!.aprov === "pedida"
            ? { t: "À espera da aprovação da Direção", sub: "Pedido de exceção à margem mínima.", who: "direcao", wait: true }
            : { t: "Resolver os bloqueios", sub: "Corrigir o preço ou pedir aprovação à Direção.", btn: "Ver bloqueios", act: "irVerif", who: "comercial" };
        return { t: "Enviar a proposta", sub: o!.vendaDireta ? "Venda direta: a proposta aceite dispensa o contrato." : "Vai para o portal do cliente.", btn: "Enviar proposta", act: "enviar", who: "comercial" };
      }
      if (!o!.aceite) return { t: "À espera do cliente", sub: "Proposta no portal desde " + o!.enviada + ".", who: "cliente", wait: true, sim: "aceitar" };
      if (!o!.vendaDireta && o!.contrato !== "assinado")
        return o!.contrato === "enviado"
          ? { t: "À espera da assinatura do contrato", sub: "Contrato no portal do cliente.", who: "cliente", wait: true, sim: "assinar" }
          : { t: "Enviar o contrato", sub: "Gerado a partir da proposta aceite.", btn: "Enviar contrato", act: "enviarContrato", who: "comercial" };
      return { t: "—" };
    case 4:
      if (!d.fin.fatura) return { t: "Emitir a fatura", sub: "Vai para o portal do cliente.", btn: "Emitir fatura", act: "emitir", who: "financeiro" };
      return { t: "Validar o pagamento", sub: `Confirmar que o valor da ${d.fin.fatura.n} entrou na conta. O recibo é emitido ao validar.`, btn: "Validar pagamento", act: "validar", who: "financeiro" };
    case 5: {
      const p = d.obra.plano!, e = d.obra.enc;
      if (p.estado === "por aprovar") return { t: conflitos(p).length ? "Operações: resolver um conflito e aprovar o plano" : "Operações: aprovar o plano", sub: "Plano gerado a partir do contrato.", btn: "Abrir plano", act: "abrirPlano", who: "operacoes" };
      if (e && e.estado === "por confirmar") return { t: "Armazém: confirmar a encomenda ao fornecedor", sub: e.n + " · faltam materiais.", btn: "Abrir Inventário", act: "abrirInv", who: "armazem" };
      if (e && e.estado === "encomendada") return { t: "Armazém: receber a encomenda", sub: e.n + " · entrega pedida até 12/10.", btn: "Abrir Inventário", act: "abrirInv", who: "armazem" };
      if (p.estado === "aprovado") return { t: "Operações: arrancar a obra", sub: "Plano aprovado e materiais garantidos.", btn: "Abrir plano", act: "abrirPlano", who: "operacoes" };
      if (p.estado === "em curso") return { t: "Obra em curso", sub: "As Operações registam o fim da obra.", btn: "Abrir plano", act: "abrirPlano", who: "operacoes" };
      if (!d.obra.aprendido) return { t: "Rever a margem real", sub: "A obra acabou. Comparar o previsto com o real.", btn: "Ver resultado", act: "irObra", who: "comercial" };
      return { t: "Negócio fechado", sub: "O cliente fica em Clientes, com o histórico.", done: true };
    }
  }
  return { t: "—" };
}

export const aberto = (S: Estado) => S.deals.filter((d) => !d.perdido);

export function minhas(S: Estado, role: Papel) {
  const L: { d: Negocio; p: Proximo; dir?: boolean }[] = [];
  for (const d of aberto(S)) {
    const p = proximo(d, S);
    if (role === "direcao" && d.fase === 3 && d.orc && d.orc.aprov === "pedida")
      L.push({ d, p: { t: "Aprovar exceção à margem", sub: pct(tot(d, S).m) + " de margem · mínimo " + S.cfg.min + "%" }, dir: true });
    else if (p.who === role && !p.wait && !p.done) L.push({ d, p });
  }
  return L;
}

/* ------------------------------------------------------------------ ações */
export type TipoAviso = "ok" | "auto" | "bad" | "";
export interface Aviso { msg: string; sub?: string; kind?: TipoAviso; act?: { label: string; fn: () => void }; atraso?: number }
export type Avisar = (a: Aviso) => void;

const agora = () => {
  const t = new Date();
  return "hoje " + String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0");
};
function log(d: Negocio, t: string, k: Evento["k"] = "a") { d.hist.unshift({ t, q: agora(), k }); }
function fase(d: Negocio, n: number) { d.fase = n; d.valida = null; preencher(d, n); log(d, "Passou a " + FASES[n] + " · sozinho"); }

const hojeISO = () => new Date().toISOString().slice(0, 10);

/** Preenche só o que está vazio e marca como sugestão da Olyvia. */
function sugerir(d: Negocio, o: Record<string, string>) {
  for (const k in o) if (!d.f[k] && o[k]) { d.f[k] = o[k]; (d.sug ??= {})[k] = true; }
}

// Uma resposta que dá outra: o que se sabe por dedução vem preenchido (como sugestão).
const AREA_TIPO: Record<string, [string, string, string]> = {
  T0: ["35", "1", "1"], T1: ["55", "2", "1"], T2: ["80", "3", "1"], T3: ["110", "4", "2"], T4: ["140", "5", "2"], "T5+": ["180", "6", "3"],
};
export function derivar(d: Negocio, k: string) {
  const f = d.f, v = f[k] || "";
  if (k === "tipologia" && AREA_TIPO[v]) { const [a, dv, wc] = AREA_TIPO[v]; sugerir(d, { area_util_m2: a, n_divisoes: dv, n_casas_banho: wc }); }
  if (k === "tem_elevador" && v === "Sim") sugerir(d, { n_elevadores: "1" });
  if (k === "gas" && v === "Sem gás") sugerir(d, { diag_gas: "Não há" });
  if (k === "localidade" && v) sugerir(d, { concelho: v });
  if (k === "fracao" && v) {
    const m = /^\s*(\d+)/.exec(v);
    const andar = /r\/?c|rés/i.test(v) ? "0" : m ? m[1] : "";
    if (andar) sugerir(d, { andar });
  }
  if (k === "pagamento") sugerir(d, { tranche: v === "100% na adjudicação" ? "Única" : "1.ª (adjudicação)" });
  if (k === "diag_tipo_area" && v === "Cozinha") sugerir(d, { diag_toalheiro: "Não" });
  if (k === "habitada_durante_obra" && v) sugerir(d, { chaves: v === "Sim" ? "O cliente abre" : "Chave entregue" });
}

// Proteções sugeridas a partir da ficha do local e da área (como em sugestaoFichaLocal.ts).
export function protecoesSugeridas(f: Record<string, string>): string {
  const p: string[] = [];
  const caminho = f.diag_distancia_entrada?.startsWith("Longa") ? 20 : f.diag_distancia_entrada?.startsWith("Média") ? 12 : 5;
  p.push(`Cartão canelado no caminho (${caminho} m)`);
  if (Number(f.diag_portas_proteger) > 0) p.push(`plástico nas ${f.diag_portas_proteger} portas`);
  if (f.tem_elevador === "Sim") p.push("proteção do elevador");
  if (f.diag_mobilada === "Muito") p.push("cobrir os móveis no caminho");
  if (f.diag_local_cortes === "Na própria área") p.push("aspiração nos cortes");
  if (f.estacionamento === "Pago") p.push("parquímetro previsto na logística");
  return p.join(", ") + ".";
}

// O que já se sabe ao entrar numa fase vem preenchido; o que lá estiver não se toca.
function preencher(d: Negocio, n: number) {
  const f = d.f, def = (o: Record<string, string>) => sugerir(d, o);
  if (n === 1 && d.local.includes(",")) {
    const [rua, ...resto] = d.local.split(",");
    def({ morada: rua.trim(), localidade: resto.join(",").trim() });
  }
  if (n === 2) {
    def({ diag_tipo_area: d.linha === "coz" ? "Cozinha" : "Casa de banho", diag_intervencao_tipo: "Remodelação total" });
    if (d.linha === "wc") def({ diag_altura_revestimento: "Ao teto" });
    if (d.linha === "coz") def({ diag_toalheiro: "Não" });
    derivar(d, "fracao"); derivar(d, "localidade");
  }
  if (n === 3) {
    const h = d.orc ? d.orc.linhas.reduce((a, l) => a + (l.t === "svc" ? (SVC0[l.sid]?.h || 0) * l.q : 0), 0) : 0;
    def({ validade: "30 dias", prazo_exec: String(Math.max(3, Math.ceil(h / 7))), garantia: "2 anos", iva: "23%", pagamento: "50% + 50% no fim",
      modelo_contrato: "Empreitada de remodelação", assinatura: "Digital, no portal", representante: "Rúben" });
  }
  if (n === 4) def({ nome_fiscal: d.nome, nif_fat: f.nif || "", morada_fiscal_igual: "Sim", email_fat: f.email || "", serie: "FT 2026",
    tranche: f.pagamento === "100% na adjudicação" ? "Única" : "1.ª (adjudicação)", vencimento: "15 dias", metodo: "Transferência" });
  if (n === 5) def({ data_pag: hojeISO(), responsavel: "Filipe", horario: "Dias úteis 8h–17h", chaves: f.habitada_durante_obra === "Sim" ? "O cliente abre" : "Chave entregue",
    contacto_local: d.nome + " · " + d.tel, contentor: "Não", protecoes: protecoesSugeridas(f) });
}
function criarCliente(S: Estado, d: Negocio) {
  if (!S.clientes.some((c) => c.deal === d.id)) S.clientes.unshift({ nome: d.nome, tel: d.tel, local: LINHAS[d.linha].n + (d.local ? " · " + d.local : ""), desde: "hoje", deal: d.id });
  log(d, "Cliente criado em Clientes");
}

// Cada ação muda o estado no sítio. `run` (no ecrã) repõe o desenho a seguir.
export function acoes(S: Estado, avisar: Avisar, run: (fn: () => void) => void) {
  const deal = (id: number) => S.deals.find((d) => d.id === id)!;

  // Não se passa de fase sem os campos obrigatórios. Se faltar algo, abre o
  // negócio, marca os campos e diz quantos faltam.
  const portao = (d: Negocio, gs: Grupo[], extra: { id: string; t: string }[] = []) => {
    const faltam = [...emFalta(gs, d.f).map((c) => c.l), ...extra.map((x) => x.t)];
    if (!faltam.length) { d.valida = null; return true; }
    d.valida = { fase: d.fase, grupos: [...gs.map((g) => g.titulo), ...extra.map((x) => x.id)] };
    S.view = "negocio"; S.deal = d.id; S.confirmPerda = null; S.pulse = "falta";
    avisar({ msg: faltam.length === 1 ? "Falta preencher 1 campo" : `Falta preencher ${faltam.length} campos`, sub: faltam.slice(0, 4).join(", ") + (faltam.length > 4 ? "…" : ""), kind: "bad" });
    return false;
  };
  const extrasVisita = (d: Negocio) => {
    const L = LINHAS[d.linha], v = d.visita, x: { id: string; t: string }[] = [];
    if (!visitaFeita(d)) x.push({ id: "visitas", t: "Pelo menos uma visita feita" });
    const semMedida = (Object.keys(L.med) as MedKey[]).filter((k) => !(v.med[k] > 0));
    if (semMedida.length) x.push({ id: "medidas", t: "Medidas: " + semMedida.map((k) => L.med[k]).join(", ") });
    const servicos = L.map.filter(([sid, k]) => v.med[k] > 0 && !v.off.includes(sid)).length + Object.values(v.extra).filter((q) => (q || 0) > 0).length;
    if (!servicos) x.push({ id: "nec", t: "Pelo menos um serviço" });
    if (!(v.fotos > 0) && d.f.diag_cliente_recusou_fotos !== "Sim") x.push({ id: "fotos", t: "Fotografias (ou marcar que o cliente não quis)" });
    return x;
  };

  const A = {
    nav(v: Vista) { S.view = v; S.deal = null; S.op = null; S.confirmPerda = null; },
    abrir(id: number) { S.view = "negocio"; S.deal = id; S.confirmPerda = null; },
    role(r: Papel) { S.role = r; },
    aspeto(v: "simples" | "atual") { S.aspeto = v; },
    leitura(v: boolean) { S.leitura = v; },
    filtro(f: string) { S.filtro = f; },
    novo() { S.view = "negocios"; S.novo = { nome: "", tel: "", linha: "wc", err: "" }; },
    novoCancel() { S.novo = null; },
    novoCriar(nome: string, tel: string, linha: LinhaId) {
      const n = S.novo!;
      n.nome = nome.trim(); n.tel = tel.trim(); n.linha = linha;
      if (!n.nome || !n.tel) { n.err = "Falta " + (!n.nome ? "o nome" : "o telefone ou o email") + "."; return; }
      const id = S.seq++;
      S.deals.unshift(novoDeal({ id, nome: n.nome, tel: n.tel, linha: n.linha, servico: LINHAS[n.linha].n, local: "", origem: "à mão", quando: agora(), f: { origem: "Telefone" }, hist: [{ t: "Negócio criado à mão", q: agora(), k: "a" }], fresh: true }));
      S.novo = null;
      avisar({ msg: "Negócio criado", sub: n.nome + " · fase Lead", kind: "ok", act: { label: "Abrir", fn: () => run(() => A.abrir(id)) } });
    },
    contactar(id: number) { const d = deal(id); if (!portao(d, LEAD)) return; if (!d.f.resultado) d.f.resultado = "Atendeu · interessado"; if (!d.f.tentativas) d.f.tentativas = "1"; log(d, "Chamada registada · " + d.f.resultado); fase(d, 1); avisar({ msg: "Chamada registada", sub: "Passou a Contacto", kind: "ok" }); },
    marcarVisita(id: number, slot?: string) { const d = deal(id); if (!portao(d, CONTACTO)) return; d.visita.slot = slot || SLOTS[0];
      if (!visitas(d).length) criarVisita(d, visitaDoSlot(d.visita.slot, { estado: "Marcada", presentes: d.f.presentes, duracao: d.f.duracao })); log(d, "Visita marcada para " + d.visita.slot); fase(d, 2); avisar({ msg: "Visita marcada", sub: d.visita.slot + " · fica na agenda do Rúben", kind: "ok" }); },
    fecharVisita(id: number) {
      const d = deal(id), L = LINHAS[d.linha];
      if (!portao(d, [...visitas(d).map(grupoVisita), EXTERIOR, INTERIOR, AREA, ESCOLHAS], extrasVisita(d))) return;
      d.visita.fechada = true; log(d, "Levantamento fechado"); d.orc = criarOrc(d, S); fase(d, 3);
      avisar({ msg: "Orçamento criado com as medidas da visita", sub: `Modelo "${L.modelo}" · custos do Catálogo`, kind: "auto" });
    },
    verificar(id: number) {
      const d = deal(id); d.orc!.verif = true; S.pulse = "verif";
      const A2 = alertas(d, S);
      log(d, "Orçamento verificado · " + A2.filter((a) => a.k === "x").length + " bloqueio(s), " + A2.filter((a) => a.k === "w").length + " aviso(s)", A2.some((a) => a.k === "x") ? "x" : "a");
    },
    irVerif() { S.pulse = "verif"; },
    sugerido(id: number, i: number, v: number) { const d = deal(id); const l = d.orc!.linhas[i]; if (l.t === "svc") l.pu = v; d.orc!.aprov = null; log(d, "Preço corrigido para " + eur(v) + " €"); avisar({ msg: "Preço corrigido", sub: "A margem da linha volta ao alvo de " + S.cfg.alvo + "%", kind: "ok" }); },
    vistoAviso(id: number, key: string) { const d = deal(id); d.orc!.avisosVistos[key] = true; log(d, "Aviso visto: " + key.slice(2), "w"); },
    pedirAprov(id: number) {
      const d = deal(id); d.orc!.aprov = "pedida"; log(d, "Pedida aprovação à Direção", "w");
      avisar({ msg: "Pedido enviado à Direção", sub: "Aparece no Hoje da Direção. Mude de papel em cima para aprovar.", kind: "", act: { label: "Ver como Direção", fn: () => run(() => { S.role = "direcao"; S.view = "hoje"; S.deal = null; }) } });
    },
    aprovar(id: number) { const d = deal(id); d.orc!.aprov = "ok"; log(d, "Exceção aprovada pela Direção"); avisar({ msg: "Exceção aprovada", sub: d.nome + " · o comercial já pode enviar", kind: "ok" }); },
    recusarAprov(id: number) { const d = deal(id); d.orc!.aprov = null; log(d, "Exceção recusada pela Direção", "x"); avisar({ msg: "Exceção recusada", sub: "O comercial tem de corrigir o preço", kind: "bad" }); },
    enviar(id: number) {
      const d = deal(id); if (!portao(d, [PROPOSTA[0]])) return;
      const A2 = alertas(d, S).filter((a) => a.k === "w"); d.orc!.enviada = "hoje";
      log(d, "Proposta enviada ao portal do cliente" + (A2.length ? " · " + A2.length + " aviso(s) registados" : ""));
      avisar({ msg: "Proposta enviada", sub: "Está no portal do cliente", kind: "ok" });
    },
    aceitar(id: number) {
      const d = deal(id); d.orc!.aceite = "hoje"; log(d, "O cliente aceitou a proposta no portal");
      if (d.orc!.vendaDireta) { criarCliente(S, d); fase(d, 4); avisar({ msg: "Venda direta aceite", sub: "Cliente criado · passou a Financeiro", kind: "auto" }); }
      else avisar({ msg: "O cliente aceitou a proposta", sub: "Falta enviar o contrato", kind: "ok" });
    },
    recusar(id: number) { const d = deal(id); d.perdido = true; log(d, "O cliente recusou a proposta", "x"); avisar({ msg: "Negócio perdido", sub: d.nome, kind: "bad", act: { label: "Anular", fn: () => run(() => { d.perdido = false; }) } }); },
    enviarContrato(id: number) { const d = deal(id); if (!portao(d, [PROPOSTA[1]])) return; d.orc!.contrato = "enviado"; log(d, "Contrato enviado para assinatura"); avisar({ msg: "Contrato enviado", sub: "Gerado a partir da proposta aceite", kind: "ok" }); },
    assinar(id: number) { const d = deal(id); d.orc!.contrato = "assinado"; log(d, "Contrato assinado pelo cliente"); criarCliente(S, d); fase(d, 4); avisar({ msg: "Contrato assinado", sub: "Cliente criado sozinho · passou a Financeiro", kind: "auto" }); },
    emitir(id: number) { const d = deal(id); if (!portao(d, [FINANCEIRO[0], FINANCEIRO[1]])) return; d.fin.fatura = { n: "FT 2026/" + S.ft++, q: "hoje" }; log(d, d.fin.fatura.n + " emitida e enviada ao portal do cliente"); avisar({ msg: d.fin.fatura.n + " emitida", sub: "Enviada ao portal do cliente", kind: "ok" }); },
    validar(id: number) {
      const d = deal(id);
      if (!d.f.valor_recebido) d.f.valor_recebido = String(r2(tot(d, S).pf));
      if (!d.f.data_pag) d.f.data_pag = new Date().toISOString().slice(0, 10);
      if (!portao(d, [FINANCEIRO[2]])) return;
      d.fin.pago = true; d.fin.recibo = { n: "RC 2026/" + S.rc++, q: "hoje" };
      log(d, "Pagamento validado · " + d.fin.recibo.n + " emitido");
      // o recibo dispara o Inventário e as Operações
      const mats = calcMats(d, S, false);
      mats.forEach((x) => { S.stock[x.k] = (S.stock[x.k] || 0) - x.res; });
      d.obra.mats = mats;
      const falta = mats.filter((x) => x.falta > 0);
      d.obra.enc = falta.length ? { n: "EF 2026/" + S.ef++, estado: "por confirmar", forn: "Cerâmica do Centro (exemplo)", linhas: falta.map((x) => ({ n: x.n, q: x.falta, un: x.un })) } : null;
      d.obra.plano = gerarPlano(d, S); fase(d, 5);
      log(d, "Inventário: " + (falta.length ? falta.length + " material(ais) em falta · " + d.obra.enc!.n + " por confirmar" : "tudo em stock e reservado"), falta.length ? "w" : "a");
      const nc = conflitos(d.obra.plano).length;
      log(d, "Operações: plano gerado com " + d.obra.plano.tasks.length + " fases" + (nc ? " · 1 conflito" : ""), nc ? "w" : "a");
      avisar({ msg: "Recibo " + d.fin.recibo.n + " emitido", sub: "Passou a Obra", kind: "ok" });
      avisar({ msg: "Inventário", sub: "Materiais reservados" + (falta.length ? " · encomenda " + d.obra.enc!.n + " criada" : ""), kind: "auto", atraso: 500 });
      avisar({ msg: "Operações", sub: "Plano da obra gerado com os técnicos do RH", kind: "auto", atraso: 1000 });
    },
    abrirPlano(id: number) { S.view = "operacoes"; S.op = id; S.deal = null; },
    abrirInv() { S.view = "inventario"; S.deal = null; },
    irObra() { S.pulse = "sec-5"; },
    trocar(id: number, ti: number) {
      const d = deal(id); const t = d.obra.plano!.tasks[ti];
      const old = TECS.find((x) => x.id === t.tec)!;
      const alt = TECS.find((x) => x.sk === t.sk && x.id !== t.tec && !x.ferias.some((k) => k >= t.dia && k < t.dia + t.dur));
      if (!alt) return;
      t.tec = alt.id; log(d, `Plano: ${t.nome} passa de ${old.n} para ${alt.n}`); avisar({ msg: "Técnico trocado", sub: `${t.nome} · ${alt.n}`, kind: "ok" });
    },
    adiar(id: number, ti: number) {
      const d = deal(id), p = d.obra.plano!; const t = p.tasks[ti]; const tec = TECS.find((x) => x.id === t.tec)!;
      let nd = t.dia;
      while (tec.ferias.some((k) => k >= nd && k < nd + t.dur)) nd++;
      nd = Math.max(nd, 5);
      const shift = nd - t.dia;
      p.tasks.slice(ti).forEach((x) => (x.dia += shift));
      log(d, `Plano: ${t.nome} adiado para ${DIAS[t.dia]}`);
      avisar({ msg: "Fase adiada", sub: "A obra acaba a " + DIAS[Math.max(...p.tasks.map((x) => x.dia + x.dur - 1))], kind: "ok" });
    },
    aprovarPlano(id: number) {
      const d = deal(id);
      if (conflitos(d.obra.plano!).length) { avisar({ msg: "Há um conflito por resolver", sub: "Troque o técnico ou adie a fase", kind: "bad" }); return; }
      d.obra.plano!.estado = "aprovado"; log(d, "Plano aprovado pelas Operações"); avisar({ msg: "Plano aprovado", sub: "Os técnicos recebem as tarefas na app", kind: "ok" });
    },
    arrancar(id: number) {
      const d = deal(id); const e = d.obra.enc;
      if (!portao(d, [OBRA[0]])) return;
      if (e && e.estado !== "recebida") { avisar({ msg: "Ainda faltam materiais", sub: e.n + " · " + e.estado, kind: "bad" }); return; }
      d.obra.plano!.estado = "em curso"; log(d, "Obra arrancou"); avisar({ msg: "Obra em curso", sub: "Os técnicos registam as horas na app", kind: "ok" });
    },
    fimObra(id: number) {
      const d = deal(id); if (!portao(d, [OBRA[1]])) return;
      d.obra.plano!.estado = "concluída"; d.obra.real = realObra(d, S);
      log(d, "Obra concluída · margem real " + pct(d.obra.real.m));
      avisar({ msg: "Obra concluída", sub: "Margem real " + pct(d.obra.real.m) + " · o comercial vê o resultado no negócio", kind: "ok", act: { label: "Ver negócio", fn: () => run(() => { A.abrir(id); A.irObra(); }) } });
    },
    aprender(id: number) {
      const d = deal(id); const s = S.svc.revest; const old = s.h; s.h = r2(s.h * REAL.revest); d.obra.aprendido = true;
      log(d, `Receita do revestimento atualizada: ${nfmt(old)} → ${nfmt(s.h)} h/m²`);
      avisar({ msg: "Receita atualizada no Catálogo", sub: `Revestimento: ${nfmt(old)} → ${nfmt(s.h)} h/m². Os próximos orçamentos já usam este valor.`, kind: "ok" });
    },
    confirmarEnc(id: number) { const d = deal(id); d.obra.enc!.estado = "encomendada"; log(d, "Encomenda " + d.obra.enc!.n + " confirmada pelo armazém"); avisar({ msg: "Encomenda enviada ao fornecedor", sub: d.obra.enc!.n + " · " + d.obra.enc!.forn, kind: "ok" }); },
    receberEnc(id: number) { const d = deal(id); d.obra.enc!.estado = "recebida"; d.obra.mats!.forEach((x) => { x.res = x.q; x.falta = 0; }); log(d, "Encomenda " + d.obra.enc!.n + " recebida · materiais reservados"); avisar({ msg: "Encomenda recebida", sub: "As Operações já podem arrancar", kind: "auto" }); },
    vendaDireta(id: number, v: boolean) { const d = deal(id); d.orc!.vendaDireta = v; log(d, v ? "Marcado como venda direta (sem contrato)" : "Deixou de ser venda direta"); },
    perder(id: number) { S.confirmPerda = id; },
    perderSim(id: number) {
      const d = deal(id); d.perdido = true; S.confirmPerda = null; log(d, "Marcado como perdido", "x");
      avisar({ msg: "Negócio perdido", sub: d.nome, kind: "bad", act: { label: "Anular", fn: () => run(() => { d.perdido = false; log(d, "Perda anulada"); }) } });
      S.view = "negocios"; S.deal = null;
    },
    perderNao() { S.confirmPerda = null; },
    nec(id: number, v: string) { const a = deal(id).visita.nec; const i = a.indexOf(v); if (i >= 0) a.splice(i, 1); else a.push(v); },
    novaVisita(id: number) {
      const d = deal(id);
      const n = criarVisita(d, { tipo: "Revisita", estado: "Marcada", quem: "Rúben (comercial)", presentes: d.f.presentes || "O cliente", duracao: "1 h" });
      log(d, `Visita ${n} criada`);
      return n;
    },
    apagarVisita(id: number, n: number) {
      const d = deal(id);
      d.vis = visitas(d).filter((x) => x !== n);
      for (const k of Object.keys(d.f)) if (k.startsWith(`v${n}_`)) delete d.f[k];
      log(d, `Visita ${n} apagada`, "w");
    },
    campo(id: number, k: string, v: string) {
      const d = deal(id); d.f[k] = v;
      if (d.sug) delete d.sug[k]; // mexido por alguém: deixa de ser sugestão
      derivar(d, k);
    },
    confirmar(id: number, ks: string[]) { const d = deal(id); if (d.sug) for (const k of ks) delete d.sug[k]; },
    localizacao(id: number, m: { morada: string; cp: string; localidade: string; concelho: string }, lat: number, lon: number, precisao: number) {
      const d = deal(id), f = d.f;
      if (d.sug) for (const k of ["morada", "cp", "localidade"]) delete d.sug[k];
      if (m.morada) f.morada = m.morada;
      if (m.cp) f.cp = m.cp;
      if (m.localidade) { f.localidade = m.localidade; derivar(d, "localidade"); }
      if (m.concelho && !f.concelho) f.concelho = m.concelho;
      f.gps = `${lat.toFixed(6)},${lon.toFixed(6)}`; f.gps_precisao = String(Math.round(precisao));
      log(d, `Morada preenchida pela localização do dispositivo (± ${Math.round(precisao)} m)`);
    },
    servico(id: number, sid: SvcId) { const a = deal(id).visita.off; const i = a.indexOf(sid); if (i >= 0) a.splice(i, 1); else a.push(sid); },
    extra(id: number, sid: SvcId, q: number) {
      const d = deal(id);
      if (q > 0) { garantirServico(S, sid); d.visita.extra[sid] = q; } else delete d.visita.extra[sid];
    },
    foto(id: number) { deal(id).visita.fotos++; },
    recalc(id: number, i: number) { const d = deal(id), l = d.orc!.linhas[i]; if (l.t === "svc") l.cu = r2(custoUn(S.svc[l.sid], S)); d.orc!.aprov = null; avisar({ msg: "Custo atualizado com o Catálogo", kind: "ok" }); },
  };
  return A;
}
export type Acoes = ReturnType<typeof acoes>;
