// Demolição e entulho (13/10/2026), à letra da especificação da Mudelar
// ("Olyvia: cálculo de demolição e entulho", Ricardo Belchior). Funções puras, sem React.
// Revisto a 14/10/2026 com as respostas do Ricardo: os consumíveis somam-se por artigo (os 40 € de proteção
// são da obra, à parte); por omissão, margem sobre o preço (a alvo e a mínima da Olyvia), com o markup como
// opção; o C_dep é "tudo incluído" por m³ e o n.º de big bags ou contentores é só logística; o contentor fica
// desligado até as Compras enviarem as capacidades; fatores de acesso extra da Direção (por omissão 1,0).
//
//   Por artigo:  Custo = Q × [ T_dem × C_h + V_solto × ( C_dep + t_carga × F_acesso × C_h ) ] + Q × C_cons
//                V_solto = V_insitu × F_emp (ou indicado)
//   Por obra:    Custo = Σ Custo_artigo + C_protecao
//                Preço = Custo ÷ (1 − margem)   (ou, em alternativa, Custo × (1 + markup))
//   Arredonda-se só no fim (o 39,08 € do exemplo só bate assim).
//
// Se o operador cobrar à tonelada, C_dep é €/t e usa-se o peso em vez do volume.
// N_bigbags = ARRED.PARA.CIMA( MÁX( V_total ÷ bigbag_m3 ; Peso_total ÷ bigbag_t_max ) ).
// O F_acesso vem do levantamento (andar e elevador, e os fatores extra), sem o comercial o voltar a indicar.
// Só tipos de outros ficheiros: o motor usa este sem ciclos.
import type { LinhaOrc, SvcId } from "./motor";

export type UnDem = "un" | "m²" | "ml" | "cj";
export const UNS_DEM: UnDem[] = ["un", "m²", "ml", "cj"];
/** Um artigo da tabela artigos_demolicao. */
export interface ArtigoDem {
  codigo: string;
  descricao: string;
  unidade: UnDem;
  /** tempo_padrao_h: horas para demolir ou remover uma unidade. */
  tempo: number;
  /** volume_insitu_m3 (opcional) e fator_empolamento (por omissão 1,4). */
  vInsitu?: number;
  fEmp?: number;
  /** volume_solto_m3 indicado (se não, calcula-se do in situ × empolamento). */
  vSolto?: number;
  /** peso_kg por unidade (opcional: sem ele, o peso sai do volume × densidade). */
  peso?: number;
  /** consumiveis_eur por unidade. */
  cons: number;
  ativo: boolean;
}
export const F_EMP0 = 1.4;
/** V_solto por unidade: o indicado, ou o in situ × empolamento. */
export const vSoltoDe = (a: ArtigoDem) => a.vSolto ?? (a.vInsitu != null ? a.vInsitu * (a.fEmp ?? F_EMP0) : 0);

/**
 * Os artigos de arranque: os 7 do exemplo 2 e a banheira de ferro fundido como artigo próprio.
 * Os consumíveis somam-se por artigo: por agora só a sanita tem 3 €; os outros ficam a 0 € até se afinarem.
 */
export const ARTIGOS_DEM0: ArtigoDem[] = [
  { codigo: "DEM-SAN-01", descricao: "Remoção de sanita (inclui tamponamento do esgoto)", unidade: "un", tempo: 0.75, vSolto: 0.06, peso: 25, cons: 3, ativo: true },
  { codigo: "DEM-BID-01", descricao: "Remoção de bidé", unidade: "un", tempo: 0.6, vSolto: 0.05, cons: 0, ativo: true },
  { codigo: "DEM-LAV-01", descricao: "Remoção de lavatório com móvel", unidade: "un", tempo: 0.75, vSolto: 0.15, cons: 0, ativo: true },
  { codigo: "DEM-BAN-01", descricao: "Remoção de banheira de aço ou acrílico", unidade: "un", tempo: 2, vSolto: 0.4, cons: 0, ativo: true },
  { codigo: "DEM-TOR-01", descricao: "Remoção de torneiras e acessórios", unidade: "cj", tempo: 0.5, vSolto: 0.01, cons: 0, ativo: true },
  { codigo: "DEM-AZU-01", descricao: "Azulejo de parede com cimento-cola", unidade: "m²", tempo: 0.6, vInsitu: 0.025, fEmp: 1.4, cons: 0, ativo: true },
  { codigo: "DEM-PAV-01", descricao: "Pavimento com betonilha (5 cm)", unidade: "m²", tempo: 0.8, vInsitu: 0.06, fEmp: 1.4, cons: 0, ativo: true },
  { codigo: "DEM-BAF-01", descricao: "Remoção de banheira de ferro fundido", unidade: "un", tempo: 3, vSolto: 0.4, peso: 120, cons: 0, ativo: true },
];

/** A tabela parametros_demolicao (só a Direção edita; com histórico). */
export interface ParDem {
  custoHora: number;
  /** t_carga: horas de carga e descida por m³. */
  tCarga: number;
  /** C_dep e a unidade em que o operador cobra. */
  cDep: number;
  unDep: "m³" | "t";
  /** densidade_entulho_t_m3: o peso quando o artigo não o diz. */
  densidade: number;
  /** fator_acesso: rés-do-chão ou com elevador / 1.º–2.º sem elevador / 3.º ou acima sem elevador. */
  fAcesso: { base: number; ate2: number; mais3: number };
  /** Fatores extra para os casos especiais (a Direção configura; 1,0 = não mexe). Multiplicam o do andar. */
  fExtra?: FatorExtra[];
  bigbagM3: number;
  bigbagT: number;
  /**
   * Contentor: desligado até as Compras enviarem as capacidades do operador (3 a 6 m³); entretanto só big bags.
   * Não mexe no preço: o C_dep já inclui o big bag ou o contentor, o transporte, o operador e a e-GAR.
   */
  contentor: { ativo: boolean; m3: number; t: number };
  /** C_protecao: proteção da zona, consumíveis e limpeza final; um custo da obra, à parte dos artigos. */
  protecao: number;
  /** Margem sobre o preço (por omissão, como no resto da Olyvia) ou markup sobre o custo (os valores do documento). */
  modoPreco: "margem" | "markup";
  markup: number;
  /** Margem alvo e margem mínima da demolição; null = as gerais da Olyvia (Definições › Orçamento). */
  margem: number | null;
  margemMin: number | null;
}
/** Um fator extra: aplica-se quando o campo do levantamento tem um destes valores. */
export interface FatorExtra { k: string; rot: string; campo: string; valores: string[]; f: number }
export const F_EXTRA0: FatorExtra[] = [
  { k: "sem_estacionamento", rot: "Rua sem estacionamento", campo: "estacionamento", valores: ["Sem estacionamento"], f: 1 },
  { k: "dist_media", rot: "Big bag ou contentor a 10–30 m da porta", campo: "dist_entulho", valores: ["10 a 30 m"], f: 1 },
  { k: "dist_longa", rot: "Big bag ou contentor a mais de 30 m da porta", campo: "dist_entulho", valores: ["Mais de 30 m"], f: 1 },
];
export const PAR_DEM0: ParDem = {
  custoHora: 25, tCarga: 2, cDep: 70, unDep: "m³", densidade: 1.4,
  fAcesso: { base: 1, ate2: 1.25, mais3: 1.5 }, fExtra: F_EXTRA0,
  bigbagM3: 1, bigbagT: 1.2,
  contentor: { ativo: false, m3: 6, t: 6 },
  protecao: 40, modoPreco: "margem", markup: 0.35, margem: null, margemMin: null,
};
/** As margens gerais da Olyvia (frações), quando a demolição não tem as suas. */
export interface MargensOlyvia { min: number; alvo: number }
export const MARGENS0: MargensOlyvia = { min: 0.28, alvo: 0.35 };
/** Uma mudança nos parâmetros (quem, quando, o quê, antes → depois). */
export interface MudancaDem { quem: string; quando: string; campo: string; antes: string; depois: string }

/** F_acesso a partir do levantamento: andar e elevador, vezes os fatores extra que se aplicam. Diz de onde veio. */
export function fatorAcesso(f: Record<string, string>, P: ParDem): { f: number; origem: string } {
  const andar = Number(f.andar) || 0, elevador = f.tem_elevador === "Sim";
  const [fa, onde]: [number, string] = andar <= 0 ? [P.fAcesso.base, "rés-do-chão"]
    : elevador ? [P.fAcesso.base, `${andar}.º andar, com elevador`]
    : [andar <= 2 ? P.fAcesso.ate2 : P.fAcesso.mais3, `${andar}.º andar, sem elevador`];
  const extras = (P.fExtra ?? []).filter((x) => x.f !== 1 && x.valores.includes(f[x.campo]));
  const total = extras.reduce((s, x) => s * x.f, fa);
  const partes = [onde, ...extras.map((x) => `${x.rot.charAt(0).toLowerCase() + x.rot.slice(1)} ×${num(x.f)}`)];
  return { f: total, origem: `${partes.join(" · ")} (do levantamento)` };
}

/** Um artigo no orçamento: o código e a quantidade. */
export interface ItemDem { codigo: string; q: number; /** veio de uma linha de serviço (sid) ou foi posto à mão. */ de?: SvcId }
export interface ContaArtigo {
  codigo: string; descricao: string; unidade: UnDem; q: number;
  horas: number; m3: number; t: number;
  demolicao: number; carga: number; deposicao: number; consumiveis: number; custo: number;
}

export type Meio = "bigbag" | "contentor" | "nenhum";
/** O que se mexeu à mão neste orçamento (em falta = o cálculo). */
export interface AjustesDem { meio?: Meio; n?: number; horas?: number; toneladas?: number; preco?: number }
export type ChaveAjuste = keyof AjustesDem;

export interface Ocupacao {
  meio: Exclude<Meio, "nenhum">; n: number; cap: { m3: number; t: number };
  /** % de cada um (enche-se um de cada vez), pelo volume e pelo peso. */
  vol: number[]; peso: number[];
  pctVol: number; pctPeso: number; limita: "volume" | "peso";
  cor: "ok" | "aviso" | "mau";
  texto: string; falta: string | null; sugestao: string | null;
}
export interface ResultadoDem {
  artigos: ContaArtigo[];
  fAcesso: number; origemAcesso: string;
  horas: number; horasCarga: number; m3: number; t: number;
  demolicao: number; carga: number; deposicao: number; consumiveis: number; protecao: number;
  meio: Meio; n: number; nBigbags: number; nContentores: number;
  custo: number; precoCalc: number; preco: number;
  /** A margem do preço final, a alvo e a mínima usadas (frações), e se o preço ficou abaixo da mínima. */
  margem: number; margemAlvo: number; margemMin: number; abaixoMin: boolean;
  ajustados: ChaveAjuste[];
  ocupacao: Ocupacao | null;
}

const r2 = (x: number) => Math.round(x * 100) / 100;
const num = (x: number, c = 2) => String(Math.round(x * 10 ** c) / 10 ** c).replace(".", ",");

/** A conta de um artigo, sem arredondar (só no fim). */
export function contaArtigo(a: ArtigoDem, q: number, P: ParDem, fAcesso: number): ContaArtigo {
  const v = vSoltoDe(a), m3 = q * v;
  const t = a.peso != null ? (q * a.peso) / 1000 : m3 * P.densidade;
  const horas = q * a.tempo;
  const demolicao = horas * P.custoHora;
  const carga = m3 * P.tCarga * fAcesso * P.custoHora;
  const deposicao = (P.unDep === "t" ? t : m3) * P.cDep;
  const consumiveis = q * a.cons;
  return { codigo: a.codigo, descricao: a.descricao, unidade: a.unidade, q, horas, m3, t, demolicao, carga, deposicao, consumiveis, custo: demolicao + carga + deposicao + consumiveis };
}

export const nBigbags = (m3: number, t: number, P: ParDem) => (m3 > 0 || t > 0 ? Math.ceil(Math.max(m3 / P.bigbagM3, t / P.bigbagT) - 1e-9) : 0);
export const nContentores = (m3: number, t: number, P: ParDem) => (m3 > 0 || t > 0 ? Math.ceil(Math.max(m3 / P.contentor.m3, t / P.contentor.t) - 1e-9) : 0);

const ORD = ["1.º", "2.º", "3.º", "4.º", "5.º", "6.º", "7.º", "8.º", "9.º", "10.º"];
/** Quanto fica cheio cada big bag ou contentor (pelo volume e pelo peso), a cor e os avisos. */
export function ocupacao(meio: Exclude<Meio, "nenhum">, m3: number, t: number, n: number, cap: { m3: number; t: number }): Ocupacao {
  const nome = meio === "contentor" ? ["contentor", "contentores"] : ["big bag", "big bags"];
  const enche = (total: number, c: number) => Array.from({ length: n }, (_, k) => Math.round((Math.max(0, Math.min(c, total - k * c)) / c) * 100));
  const vol = enche(m3, cap.m3), peso = enche(t, cap.t);
  const pctVol = n ? Math.round((m3 / (n * cap.m3)) * 100) : 0, pctPeso = n ? Math.round((t / (n * cap.t)) * 100) : 0;
  const limita = pctPeso > pctVol ? "peso" : "volume", maior = Math.max(pctVol, pctPeso);
  const cor = maior > 100 ? "mau" : maior > 80 ? "aviso" : "ok";
  const porUm = vol.map((v, k) => Math.max(v, peso[k]));
  const texto = n === 1
    ? `1 ${nome[0]} de ${num(cap.m3)} m³: ${pctVol}% cheio (${num(m3)} m³) · peso ${num(t)} t de ${num(cap.t)} t (${pctPeso}%)`
    : `${n} ${nome[1]}: ${porUm.map((x) => x + "%").join(" + ")} · ${num(m3)} m³ e ${num(t)} t`;
  let falta: string | null = null;
  if (maior > 100) {
    const precisa = Math.ceil(Math.max(m3 / cap.m3, t / cap.t) - 1e-9), mais = precisa - n;
    const sobra = limita === "volume" ? `faltam ${num(m3 - n * cap.m3)} m³` : `faltam ${num(t - n * cap.t)} t`;
    falta = `${sobra}: precisa de mais ${mais} ${mais === 1 ? nome[0] : nome[1]}`;
  }
  const ult = porUm[n - 1] ?? 0;
  const sugestao = meio === "contentor" && n > 1 && maior <= 100 && ult < 25 ? `o ${ORD[n - 1] ?? n + ".º"} contentor fica a ${ult}%: considere big bags para o resto` : null;
  return { meio, n, cap, vol, peso, pctVol, pctPeso, limita, cor, texto, falta, sugestao };
}

/** A conta da obra, com os ajustes à mão por cima. Arredonda-se só no fim. */
export function calcularDemolicao(itens: ItemDem[], artigos: ArtigoDem[], P: ParDem, acesso: { f: number; origem: string }, aj: AjustesDem = {}, olyvia: MargensOlyvia = MARGENS0): ResultadoDem {
  const contas = itens.flatMap((it) => {
    const a = artigos.find((x) => x.codigo === it.codigo && x.ativo);
    return a && it.q > 0 ? [contaArtigo(a, it.q, P, acesso.f)] : [];
  });
  const m3 = contas.reduce((s, c) => s + c.m3, 0);
  const tCalc = contas.reduce((s, c) => s + c.t, 0);
  const t = aj.toneladas ?? tCalc;
  const horasDem = contas.reduce((s, c) => s + c.horas, 0);
  const horasCarga = m3 * P.tCarga * acesso.f;
  // as horas mexidas à mão substituem as de demolição (as de carga continuam)
  const horas = aj.horas ?? horasDem;
  const demolicao = horas * P.custoHora;
  const carga = contas.reduce((s, c) => s + c.carga, 0);
  // o C_dep é "tudo incluído" (big bag ou contentor, transporte, operador e e-GAR): o meio não mexe no preço
  const deposicaoCalc = (P.unDep === "t" ? t : m3) * P.cDep;
  const consumiveis = contas.reduce((s, c) => s + c.consumiveis, 0);
  const protecao = contas.length ? P.protecao : 0;

  // o meio (só logística): big bags; o contentor escolhe-se à mão, e só com as capacidades configuradas
  const nBb = nBigbags(m3, t, P), nCt = P.contentor.m3 > 0 && P.contentor.t > 0 ? nContentores(m3, t, P) : 0;
  const meio: Meio = aj.meio ?? (!contas.length ? "nenhum" : "bigbag");
  const n = meio === "nenhum" ? 0 : aj.n ?? (meio === "contentor" ? nCt : nBb);
  // "nenhum" (o cliente trata do entulho): sem deposição
  const deposicao = meio === "nenhum" ? 0 : deposicaoCalc;

  const custo = demolicao + carga + deposicao + consumiveis + protecao;
  const margemAlvo = P.margem ?? olyvia.alvo, margemMin = P.margemMin ?? olyvia.min;
  const precoCalc = custo > 0 ? (P.modoPreco === "margem" ? custo / (1 - margemAlvo) : custo * (1 + P.markup)) : 0;
  const preco = aj.preco ?? r2(precoCalc);
  const margem = preco > 0 ? (preco - r2(custo)) / preco : 0;
  const cap = meio === "contentor" ? { m3: P.contentor.m3, t: P.contentor.t } : { m3: P.bigbagM3, t: P.bigbagT };
  return {
    artigos: contas, fAcesso: acesso.f, origemAcesso: acesso.origem,
    horas: r2(horas + horasCarga), horasCarga: r2(horasCarga), m3: r2(m3), t: Math.round(t * 1000) / 1000,
    demolicao: r2(demolicao), carga: r2(carga), deposicao: r2(deposicao), consumiveis: r2(consumiveis), protecao: r2(protecao),
    meio, n, nBigbags: nBb, nContentores: nCt,
    custo: r2(custo), precoCalc: r2(precoCalc), preco,
    margem, margemAlvo, margemMin, abaixoMin: custo > 0 && margem < margemMin - 1e-9,
    ajustados: (Object.keys(aj) as ChaveAjuste[]).filter((k) => aj[k] != null),
    ocupacao: meio !== "nenhum" && n > 0 ? ocupacao(meio, m3, t, n, cap) : null,
  };
}

/** Os artigos que saem das linhas de serviço do orçamento (o serviço diz que artigo de demolição usa). */
export function itensDasLinhas(linhas: LinhaOrc[], artigoDo: Record<SvcId, string>): ItemDem[] {
  return linhas.flatMap((l) => (l.t === "svc" && artigoDo[l.sid] && l.q > 0 ? [{ codigo: artigoDo[l.sid], q: l.q, de: l.sid }] : []));
}

/** A linha que o cliente vê. */
export const LINHA_DEMOLICAO = "Demolição e remoção de entulho para operador licenciado de RCD, com e-GAR (DL 102-D/2020)";
/** O resumo da conta: "20,6 h · 1,79 m³ (≈ 2,5 t) · 3 big bags". */
export function resumoDemolicao(r: ResultadoDem): string {
  const meio = r.meio === "contentor" ? `${r.n} ${r.n === 1 ? "contentor" : "contentores"}` : r.meio === "bigbag" ? `${r.n} ${r.n === 1 ? "big bag" : "big bags"}` : "sem meio";
  return `${num(r.horas, 1)} h · ${num(r.m3)} m³ (≈ ${num(r.t, 1)} t) · ${meio}`;
}

/* ------------------------------------------------------------------ parâmetros: mexer com histórico */
/** Os parâmetros que se editam, com o rótulo e a unidade (para o ecrã e para o histórico). */
export const CAMPOS_PAR: { k: string; rot: string; un: string; ler: (P: ParDem) => number; por: (P: ParDem, v: number) => void }[] = [
  { k: "custoHora", rot: "Custo/hora da mão de obra", un: "€/h", ler: (P) => P.custoHora, por: (P, v) => { P.custoHora = v; } },
  { k: "tCarga", rot: "Tempo de carga e descida", un: "h/m³", ler: (P) => P.tCarga, por: (P, v) => { P.tCarga = v; } },
  { k: "cDep", rot: "Deposição, tudo incluído (C_dep)", un: "€", ler: (P) => P.cDep, por: (P, v) => { P.cDep = v; } },
  { k: "densidade", rot: "Densidade do entulho", un: "t/m³", ler: (P) => P.densidade, por: (P, v) => { P.densidade = v; } },
  { k: "fAcesso.base", rot: "Fator de acesso · rés-do-chão ou com elevador", un: "×", ler: (P) => P.fAcesso.base, por: (P, v) => { P.fAcesso.base = v; } },
  { k: "fAcesso.ate2", rot: "Fator de acesso · 1.º ou 2.º sem elevador", un: "×", ler: (P) => P.fAcesso.ate2, por: (P, v) => { P.fAcesso.ate2 = v; } },
  { k: "fAcesso.mais3", rot: "Fator de acesso · 3.º ou acima sem elevador", un: "×", ler: (P) => P.fAcesso.mais3, por: (P, v) => { P.fAcesso.mais3 = v; } },
  { k: "bigbagM3", rot: "Big bag · volume", un: "m³", ler: (P) => P.bigbagM3, por: (P, v) => { P.bigbagM3 = v; } },
  { k: "bigbagT", rot: "Big bag · peso máximo", un: "t", ler: (P) => P.bigbagT, por: (P, v) => { P.bigbagT = v; } },
  { k: "contentor.m3", rot: "Contentor · volume", un: "m³", ler: (P) => P.contentor.m3, por: (P, v) => { P.contentor.m3 = v; } },
  { k: "contentor.t", rot: "Contentor · peso máximo", un: "t", ler: (P) => P.contentor.t, por: (P, v) => { P.contentor.t = v; } },
  { k: "protecao", rot: "Proteção, consumíveis e limpeza (por obra)", un: "€", ler: (P) => P.protecao, por: (P, v) => { P.protecao = v; } },
  { k: "markup", rot: "Markup sobre o custo (alternativa)", un: "%", ler: (P) => Math.round(P.markup * 1000) / 10, por: (P, v) => { P.markup = v / 100; } },
];
const textoValor = (v: unknown) => (typeof v === "number" ? num(v, 3) : typeof v === "boolean" ? (v ? "sim" : "não") : String(v ?? "—"));
/** Muda um valor e regista quem, quando, o antes e o depois (devolve cópias novas). */
export function registarMudanca<T>(atual: T, novo: T, campo: string, hist: MudancaDem[], quem: string, quando: string): MudancaDem[] {
  if (textoValor(atual) === textoValor(novo)) return hist;
  return [{ quem, quando, campo, antes: textoValor(atual), depois: textoValor(novo) }, ...hist];
}
