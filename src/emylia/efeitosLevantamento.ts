// O que cada resposta do levantamento faz ao orçamento (13/10/2026). Funções puras, sem React.
// Três tipos de efeito: uma linha com custo e preço (ex.: proteções), uma percentagem sobre os
// serviços (ex.: acesso difícil) e uma mudança nos materiais (materiais do cliente).
// 3/11 (Rúben): «customizar o impacto dos campos no orçamento». Cada regra tem um id, os valores (parâmetros) e, nas que dependem
// de uma resposta, as opções que a ligam. A organização muda-os em Pessoas › Workflow › Levantamento (CfgEfeitos, gravado em
// negocio_campos_config.efeitos) e a página dos Negócios põe-nos aqui (definirEfeitosCampos). Sem ajustes, ficam os valores de sempre.

import { chaveBase, juntarDivisoes } from "./campos";

export interface Efeito {
  /** O campo que dá o efeito (pode haver mais de um campo a pesar no mesmo efeito). */
  k: string;
  t: "linha" | "percent" | "material";
  /** O texto da linha no orçamento. */
  d: string;
  custo: number;
  preco: number;
  /** Só em "percent": 0,10 = +10% sobre os serviços. */
  pct?: number;
  /** Só em "material": multiplica o custo e o preço da linha de materiais (0 = sai). */
  fator?: number;
}

/** O prefixo das linhas que o levantamento põe no orçamento (para as refazer quando uma resposta muda). */
export const PREFIXO_LEV = "Levantamento · ";

/* ------------------------------------------------------------------ as regras e os valores de sempre */
export type UnidadeParam = "€" | "%" | "dias" | "h" | "m";
export interface ParamEfeito { p: string; l: string; un: UnidadeParam; v: number }
export interface RegraEfeito {
  id: string;
  /** O nome da regra no editor. */
  nome: string;
  /** O campo da Emylia que a liga (a chave de base). */
  campo: string;
  /** Uma frase sobre como se calcula, para o editor. */
  como: string;
  params: ParamEfeito[];
  /** As respostas do campo que ligam a regra (a organização pode mudar). Sem isto, a regra lê a resposta de outra forma (por opção, contagem…). */
  quando?: string[];
}

const custoPreco = (custo: number, preco: number, sufixo = ""): ParamEfeito[] => [
  { p: `custo${sufixo}`, l: "Custo", un: "€", v: custo },
  { p: `preco${sufixo}`, l: "Preço ao cliente", un: "€", v: preco },
];

export const REGRAS_EFEITO: readonly RegraEfeito[] = [
  { id: "caminho", nome: "Proteção do caminho (cartão canelado)", campo: "diag_distancia_entrada", como: "Metros de caminho conforme a distância × preço por metro.",
    params: [{ p: "custo_m", l: "Custo por metro", un: "€", v: 1.1 }, { p: "preco_m", l: "Preço por metro", un: "€", v: 2.2 },
      { p: "m_curta", l: "Metros, caminho curto", un: "m", v: 5 }, { p: "m_media", l: "Metros, caminho médio", un: "m", v: 12 }, { p: "m_longa", l: "Metros, caminho longo", un: "m", v: 20 }] },
  { id: "portas", nome: "Plástico de proteção nas portas", campo: "diag_portas_proteger", como: "Por cada porta a proteger.",
    params: [{ p: "custo", l: "Custo por porta", un: "€", v: 3 }, { p: "preco", l: "Preço por porta", un: "€", v: 7 }] },
  { id: "moveis", nome: "Cobrir os móveis no caminho", campo: "diag_mobilada", como: "Um valor para casa média e outro para casa muito mobilada.",
    params: [...custoPreco(10, 25, "_medio").map((x) => ({ ...x, l: `${x.l} (médio)` })), ...custoPreco(25, 60, "_muito").map((x) => ({ ...x, l: `${x.l} (muito)` }))] },
  { id: "elevador", nome: "Proteção do elevador", campo: "tem_elevador", como: "Um valor fixo.", quando: ["Sim"], params: custoPreco(20, 45) },
  { id: "escada", nome: "Transporte pela escada (sem elevador)", campo: "andar", como: "Horas por andar × preço por hora, a partir do 1.º andar.",
    params: [{ p: "h_andar", l: "Horas por andar", un: "h", v: 1.5 }, { p: "custo_h", l: "Custo por hora", un: "€", v: 22 }, { p: "preco_h", l: "Preço por hora", un: "€", v: 35 }] },
  { id: "aspiracao", nome: "Aspiração de pó nos cortes", campo: "diag_local_cortes", como: "Um valor fixo.", quando: ["Na própria área"], params: custoPreco(25, 50) },
  { id: "cortes_fora", nome: "Deslocações para cortar fora", campo: "diag_local_cortes", como: "Horas × preço por hora.", quando: ["Fora (garagem, rua)"],
    params: [{ p: "horas", l: "Horas", un: "h", v: 2 }, { p: "custo_h", l: "Custo por hora", un: "€", v: 22 }, { p: "preco_h", l: "Preço por hora", un: "€", v: 35 }] },
  { id: "estacionamento", nome: "Estacionamento pago", campo: "estacionamento", como: "Dias de obra (o prazo da proposta, ou os dias por omissão) × preço por dia da zona.", quando: ["Pago"],
    params: [{ p: "dia_verde", l: "Por dia, zona verde", un: "€", v: 4 }, { p: "dia_amarela", l: "Por dia, zona amarela (e sem zona)", un: "€", v: 8 },
      { p: "dia_vermelha", l: "Por dia, zona vermelha", un: "€", v: 14 }, { p: "dias", l: "Dias de obra por omissão", un: "dias", v: 10 }] },
  // 5/11 (Rúben): «Amianto» saiu da visita, e com ele a regra «Remoção certificada de amianto»
  { id: "gas", nome: "Ponto de gás", campo: "diag_gas", como: "Um valor para anular e outro para instalar.",
    params: [...custoPreco(110, 182, "_anular").map((x) => ({ ...x, l: `${x.l} (anular)` })), ...custoPreco(280, 450, "_instalar").map((x) => ({ ...x, l: `${x.l} (instalar)` }))] },
  { id: "acesso", nome: "Acesso difícil", campo: "acesso", como: "A percentagem que se escolhe no campo «Impacto no preço», sobre os serviços.", quando: ["Difícil"], params: [] },
  { id: "habitada", nome: "Casa habitada durante a obra", campo: "habitada_durante_obra", como: "Percentagem sobre os serviços.", quando: ["Sim"],
    params: [{ p: "pct", l: "Percentagem", un: "%", v: 4 }] },
  { id: "janela", nome: "Sem janela na área", campo: "diag_janela", como: "Percentagem sobre os serviços.", quando: ["Não"], params: [{ p: "pct", l: "Percentagem", un: "%", v: 3 }] },
];

/* ------------------------------------------------------------------ os ajustes da organização */
export interface AjusteEfeito {
  /** Desligada: não mexe no orçamento. */
  off?: boolean;
  /** Os valores que mudaram (o parâmetro → o número). */
  v?: Record<string, number>;
  /** As respostas que ligam a regra, em vez das de sempre (só nas regras com `quando`). */
  ops?: string[];
}
export type CfgEfeitos = Record<string, AjusteEfeito>;

const ID_REGRAS = new Set(REGRAS_EFEITO.map((r) => r.id));

/** O que veio da base, limpo: só regras conhecidas, valores finitos e não negativos, opções em texto. O resto fica de fora. */
export function lerCfgEfeitos(x: unknown): CfgEfeitos {
  if (!x || typeof x !== "object" || Array.isArray(x)) return {};
  const out: CfgEfeitos = {};
  for (const [id, a0] of Object.entries(x as Record<string, unknown>)) {
    if (!ID_REGRAS.has(id) || !a0 || typeof a0 !== "object") continue;
    const a = a0 as Record<string, unknown>, r = REGRAS_EFEITO.find((y) => y.id === id)!;
    const aj: AjusteEfeito = {};
    if (a.off === true) aj.off = true;
    if (a.v && typeof a.v === "object") {
      const v = Object.fromEntries(Object.entries(a.v as Record<string, unknown>)
        .filter(([p, n]) => r.params.some((q) => q.p === p) && typeof n === "number" && Number.isFinite(n) && n >= 0));
      if (Object.keys(v).length) aj.v = v as Record<string, number>;
    }
    if (r.quando && Array.isArray(a.ops)) aj.ops = a.ops.filter((o): o is string => typeof o === "string" && o.trim() !== "");
    if (Object.keys(aj).length) out[id] = aj;
  }
  return out;
}

let cfgAtual: CfgEfeitos = {};
/** A página dos Negócios põe aqui os ajustes da organização (null: os de sempre). */
export function definirEfeitosCampos(cfg: CfgEfeitos | null): void { cfgAtual = cfg ?? {}; }
export const efeitosCamposAtuais = (): CfgEfeitos => cfgAtual;

/** 11/11 (Rúben: «ter também uma área onde se consegue mudar o impacto percentual de algumas opções»): quem pode mudar os ajustes
 *  (pessoas.config), a página real dos Negócios põe aqui como se gravam (neg_guardar_campos_config); o campo mostra então «Mudar» ao
 *  lado do impacto. Sem página real (o protótipo, os testes) ou sem a permissão, fica null e não aparece. Devolve o erro, se houver. */
export type GravarEfeitos = (cfg: CfgEfeitos) => Promise<string | null>;
let gravarEfeitosAtual: GravarEfeitos | null = null;
const ouvemEditor = new Set<() => void>();
export function definirGravarEfeitos(f: GravarEfeitos | null): void { gravarEfeitosAtual = f; ouvemEditor.forEach((o) => o()); }
export const gravarEfeitosAtualDe = (): GravarEfeitos | null => gravarEfeitosAtual;
export const ouvirGravarEfeitos = (f: () => void): (() => void) => { ouvemEditor.add(f); return () => { ouvemEditor.delete(f); }; };
/** As regras com valores a mudar ligadas a um campo (pela chave de base). */
export const regrasDoCampo = (campo: string): RegraEfeito[] => REGRAS_EFEITO.filter((r) => r.campo === campo && r.params.length > 0);

/** O valor de um parâmetro: o da organização ou o de sempre. */
export function valorParam(cfg: CfgEfeitos, id: string, p: string): number {
  const v = cfg[id]?.v?.[p];
  return v ?? REGRAS_EFEITO.find((r) => r.id === id)?.params.find((x) => x.p === p)?.v ?? 0;
}
/** As respostas que ligam a regra. */
export const opcoesRegra = (cfg: CfgEfeitos, id: string): string[] => cfg[id]?.ops ?? REGRAS_EFEITO.find((r) => r.id === id)?.quando ?? [];
export const regraLigada = (cfg: CfgEfeitos, id: string): boolean => !cfg[id]?.off;

const r2 = (x: number) => Math.round(x * 100) / 100;
const num = (x: number) => String(r2(x)).replace(".", ",");
const linha = (k: string, d: string, custo: number, preco: number): Efeito => ({ k, t: "linha", d, custo: r2(custo), preco: r2(preco) });
const pctEf = (k: string, d: string, pct: number): Efeito => ({ k, t: "percent", d, custo: 0, preco: 0, pct });

/** Todos os efeitos das respostas dadas até agora. `cfg`: os ajustes da organização (por omissão, os que a página definiu). */
export function efeitosDoLevantamento(f0: Record<string, string>, cfg: CfgEfeitos = cfgAtual): Efeito[] {
  // com várias divisões, as respostas da área juntam-se (contagens somadas, pior caso nas escolhas)
  const f = juntarDivisoes(f0);
  const e: Efeito[] = [];
  const P = (id: string, p: string) => valorParam(cfg, id, p);
  const on = (id: string) => regraLigada(cfg, id);
  const se = (id: string, campo: string) => on(id) && !!f[campo] && opcoesRegra(cfg, id).includes(f[campo]);
  // Proteções e logística
  if (on("caminho")) {
    const dist = f.diag_distancia_entrada;
    const caminho = dist?.startsWith("Longa") ? P("caminho", "m_longa") : dist?.startsWith("Média") ? P("caminho", "m_media") : dist ? P("caminho", "m_curta") : 0;
    if (caminho) e.push(linha("diag_distancia_entrada", `Proteção do caminho: cartão canelado (${num(caminho)} m)`, P("caminho", "custo_m") * caminho, P("caminho", "preco_m") * caminho));
  }
  const portas = Number(f.diag_portas_proteger) || 0;
  if (on("portas") && portas > 0) e.push(linha("diag_portas_proteger", `Plástico de proteção em ${portas} ${portas === 1 ? "porta" : "portas"}`, P("portas", "custo") * portas, P("portas", "preco") * portas));
  const mob = f.diag_mobilada === "Médio" ? "_medio" : f.diag_mobilada === "Muito" ? "_muito" : "";
  if (on("moveis") && mob) e.push(linha("diag_mobilada", `Cobrir os móveis no caminho (${f.diag_mobilada.toLowerCase()})`, P("moveis", `custo${mob}`), P("moveis", `preco${mob}`)));
  if (se("elevador", "tem_elevador")) e.push(linha("tem_elevador", "Proteção do elevador", P("elevador", "custo"), P("elevador", "preco")));
  const andar = Number(f.andar) || 0;
  if (on("escada") && f.tem_elevador === "Não" && andar >= 1) {
    const h = r2(andar * P("escada", "h_andar"));
    if (h > 0) e.push(linha("andar", `Transporte pela escada (${andar}.º andar, ${num(h)} h)`, P("escada", "custo_h") * h, P("escada", "preco_h") * h));
  }
  if (se("aspiracao", "diag_local_cortes")) e.push(linha("diag_local_cortes", "Aspiração de pó nos cortes", P("aspiracao", "custo"), P("aspiracao", "preco")));
  if (se("cortes_fora", "diag_local_cortes")) {
    const h = P("cortes_fora", "horas");
    e.push(linha("diag_local_cortes", `Deslocações para cortar fora (${num(h)} h)`, P("cortes_fora", "custo_h") * h, P("cortes_fora", "preco_h") * h));
  }
  if (se("estacionamento", "estacionamento")) {
    const zona = f.zona_estacionamento === "Verde" ? "dia_verde" : f.zona_estacionamento === "Vermelha" ? "dia_vermelha" : "dia_amarela";
    const dia = P("estacionamento", zona), dias = Number(f.prazo_exec) || P("estacionamento", "dias");
    e.push(linha(f.zona_estacionamento ? "zona_estacionamento" : "estacionamento", `Estacionamento pago (${num(dias)} dias × ${num(dia)} €)`, dia * dias, dia * dias));
  }
  // Trabalhos que o levantamento obriga
  if (on("gas") && (f.diag_gas === "Anular" || f.diag_gas === "Instalar")) {
    const s = f.diag_gas === "Anular" ? "_anular" : "_instalar";
    e.push(linha("diag_gas", f.diag_gas === "Anular" ? "Anulação de ponto de gás" : "Instalação de ponto de gás", P("gas", `custo${s}`), P("gas", `preco${s}`)));
  }
  // Percentagens sobre os serviços
  if (se("acesso", "acesso") && f.impacto_percent) e.push(pctEf("impacto_percent", `Acesso difícil (+${f.impacto_percent})`, (parseFloat(f.impacto_percent) || 0) / 100));
  if (se("habitada", "habitada_durante_obra")) { const p = P("habitada", "pct"); e.push(pctEf("habitada_durante_obra", `Casa habitada: limpeza diária e arrumação (+${num(p)}%)`, p / 100)); }
  if (se("janela", "diag_janela")) { const p = P("janela", "pct"); e.push(pctEf("diag_janela", `Sem janela: trabalhos com pó mais lentos (+${num(p)}%)`, p / 100)); }
  // Materiais
  // uma regra configurada a zero não deixa uma linha de 0 € no orçamento
  return e.filter((x) => x.t !== "linha" || x.custo > 0 || x.preco > 0).filter((x) => x.t !== "percent" || (x.pct ?? 0) > 0);
}

/** Os efeitos de um só campo (para mostrar ao lado da resposta). */
export const efeitosDoCampo = (k: string, f: Record<string, string>, cfg: CfgEfeitos = cfgAtual): Efeito[] =>
  efeitosDoLevantamento(f, cfg).filter((e) => e.k === chaveBase(k));

/** Os campos que podem mexer no orçamento (para o aviso "mexe no orçamento" ao lado do campo). */
export const CAMPOS_COM_EFEITO = new Set([
  "diag_distancia_entrada", "diag_portas_proteger", "diag_mobilada", "tem_elevador", "andar", "diag_local_cortes", "estacionamento",
  "zona_estacionamento", "diag_gas", "impacto_percent", "habitada_durante_obra", "diag_janela", "dist_entulho",
]);
