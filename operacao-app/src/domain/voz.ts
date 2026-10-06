/**
 * "O técnico fala, o sistema regista" — de uma frase ditada a uma proposta.
 *
 * Regras simples e à vista, sem inteligência escondida: palavras-chave →
 * intenção. O ecrã mostra SEMPRE a proposta e porquê (as palavras que a
 * decidiram) antes de gravar; quem fala corrige o que estiver mal.
 *
 *   "falta o sifão, só chega amanhã"   → atraso · Material em falta · fim amanhã
 *   "ainda está húmido, não secou"     → atraso · Secagem / cura
 *   "o cliente não estava"             → atraso · Acesso / cliente
 *   "terminei" / "está feito"          → dar a tarefa por feita
 *   qualquer outra coisa               → nota (legenda da próxima foto)
 *
 * As datas ditas ("amanhã", "sexta", "dia 14", "daqui a 3 dias", "para a
 * semana") e as durações ("mais 2 horas", "mais um dia") preenchem o "quanto"
 * do atraso. Puro: `hoje` entra por argumento (testável).
 */

import type { MotivoAtraso, UnidadeExtra } from "./atrasos";

export type IntencaoFala = "atraso" | "feita" | "nota";

export interface PropostaFala {
  intencao: IntencaoFala;
  /** A frase, limpa (primeira letra maiúscula, sem espaços a mais). */
  texto: string;
  motivo: MotivoAtraso | null;
  /** Nova data de fim (AAAA-MM-DD), quando a data dita passa do fim atual. */
  novoFim: string | null;
  /** "Mais N horas/dias", quando foi dito assim (ou quando a data não passa do fim). */
  quantidade: number | null;
  unidade: UnidadeExtra | null;
  /** A data que se ouviu, mesmo que não mude o fim (para o explicar). */
  dataOuvida: string | null;
  /** As palavras que decidiram — mostradas ao lado da proposta. */
  porque: string[];
}

/* ───────────────────────────── normalizar ───────────────────────────── */

/** Minúsculas, sem acentos, um espaço — para comparar; nunca para mostrar. */
export function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function limpar(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

/* ───────────────────────────── números ───────────────────────────── */

const NUMEROS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7,
  oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, quinze: 15, vinte: 20, meia: 0.5, meio: 0.5,
};

function numero(p: string): number | null {
  if (/^\d+([.,]\d+)?$/.test(p)) return Number(p.replace(",", "."));
  return NUMEROS[p] ?? null;
}

/* ───────────────────────────── datas ───────────────────────────── */

function data(iso: string): Date {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d);
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function somarDias(isoData: string, n: number): string {
  const d = data(isoData);
  d.setDate(d.getDate() + n);
  return iso(d);
}

const DIAS_SEMANA: [RegExp, number][] = [
  [/\bdomingo\b/, 0],
  [/\bsegunda\b/, 1],
  [/\bterca\b/, 2],
  [/\bquarta\b/, 3],
  [/\bquinta\b/, 4],
  [/\bsexta\b/, 5],
  [/\bsabado\b/, 6],
];

const MESES = [
  "janeiro", "fevereiro", "marco", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** A data dita na frase (já normalizada), ou null. Sempre no futuro (ou hoje). */
export function dataDita(n: string, hoje: string): { data: string; palavra: string } | null {
  if (/\bdepois de amanha\b/.test(n)) return { data: somarDias(hoje, 2), palavra: "depois de amanhã" };
  if (/\bamanha\b/.test(n)) return { data: somarDias(hoje, 1), palavra: "amanhã" };

  const daqui = n.match(/\bdaqui a (\S+) dias?\b/);
  if (daqui) {
    const k = numero(daqui[1]);
    if (k != null && k >= 1) return { data: somarDias(hoje, Math.round(k)), palavra: `daqui a ${daqui[1]} dias` };
  }

  if (/\b(para a semana|semana que vem|proxima semana)\b/.test(n)) {
    const d = data(hoje);
    const ate = ((8 - d.getDay()) % 7) || 7; // a próxima segunda-feira
    return { data: somarDias(hoje, ate), palavra: "para a semana" };
  }

  // "dia 14", "14 de outubro", "14/10"
  const barra = n.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  const comMes = n.match(new RegExp(`\\b(\\d{1,2}) de (${MESES.join("|")})\\b`));
  const soDia = n.match(/\bdia (\d{1,2})\b/);
  const h = data(hoje);
  if (barra || comMes || soDia) {
    const dia = Number((barra ?? comMes ?? soDia)![1]);
    let mes = barra ? Number(barra[2]) - 1 : comMes ? MESES.indexOf(comMes[2]) : h.getMonth();
    if (dia >= 1 && dia <= 31 && mes >= 0 && mes <= 11) {
      let ano = h.getFullYear();
      let d = new Date(ano, mes, dia);
      if (d < h) {
        if (soDia && !barra && !comMes) {
          mes += 1;
          d = new Date(ano, mes, dia);
        } else {
          ano += 1;
          d = new Date(ano, mes, dia);
        }
      }
      return { data: iso(d), palavra: (barra ?? comMes ?? soDia)![0] };
    }
  }

  for (const [re, dw] of DIAS_SEMANA) {
    const m = n.match(re);
    if (m) {
      const hoje0 = h.getDay();
      let ate = (dw - hoje0 + 7) % 7;
      if (ate === 0) ate = 7; // "sexta", dito à sexta: a próxima
      return { data: somarDias(hoje, ate), palavra: m[0] };
    }
  }

  if (/\bhoje\b/.test(n)) return { data: hoje, palavra: "hoje" };
  return null;
}

/** "Mais 2 horas", "mais um dia", "meio dia", "3 dias a mais". */
export function duracaoDita(n: string): { quantidade: number; unidade: UnidadeExtra; palavra: string } | null {
  if (/\bmeio dia\b/.test(n)) return { quantidade: 0.5, unidade: "dias", palavra: "meio dia" };
  if (/\bmeia hora\b/.test(n)) return { quantidade: 0.5, unidade: "horas", palavra: "meia hora" };
  const m = n.match(/\b(\d+(?:[.,]\d+)?|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|doze|quinze|vinte) (horas?|h|dias?)\b/);
  if (!m) return null;
  // "daqui a 3 dias" é uma data, não uma duração.
  if (new RegExp(`\\bdaqui a ${m[1]} ${m[2]}\\b`).test(n)) return null;
  const q = numero(m[1]);
  if (q == null || q <= 0) return null;
  return { quantidade: q, unidade: m[2].startsWith("d") ? "dias" : "horas", palavra: m[0] };
}

/* ───────────────────────────── intenções ───────────────────────────── */

// A ordem conta: o primeiro que aparecer decide. "Equipa" vem antes do
// material porque "o colega faltou" também tem "faltou".
const MOTIVOS: [MotivoAtraso, RegExp][] = [
  ["equipa", /\b(doente|de baixa|sozinho|falta de pessoal|colega faltou|faltou o colega|nao veio o colega|o colega nao veio)\b/],
  ["material_em_falta", /\b(falta|faltam|faltou|nao chegou|nao chegaram|nao veio|nao vieram|so chega|so chegam|chega so|a espera do material|espera do material|material|encomenda|fornecedor)\b/],
  ["secagem", /\b(humidade|humido|humida|secagem|nao secou|ainda nao seca|a secar|secar|seca|cura|curar)\b/],
  ["acesso_cliente", /\b(cliente nao estava|nao estava ninguem|ninguem em casa|sem acesso|nao abriu|nao me abriram|nao abriram|sem chave|chave|porteiro)\b/],
  ["meteorologia", /\b(chuva|chover|chove|vento|temporal|tempestade)\b/],
  ["condicoes_edificio", /\b(elevador avariado|sem elevador|sem luz|sem agua|corte de agua|corte de luz|quadro eletrico)\b/],
  ["trabalho_imprevisto", /\b(imprevisto|descobri|apareceu|estava pior|podre|infiltracao|rachado|partido)\b/],
];

const FEITA = /\b(terminei|acabei|conclui|esta feito|esta feita|ja esta feito|ja esta feita|ficou feito|ficou feita|esta pronto|esta pronta|ja acabei|tarefa feita|trabalho feito)\b/;
const NEGADO_ANTES = /\bnao (esta|ficou|acabei|terminei)\b/;
const ATRASO_GENERICO = /\b(atras|atrasar|atrasado|atrasada|vai demorar|demorar mais|nao da|nao vou conseguir|nao consigo|preciso de mais|mais tempo)\w*/;

/**
 * Da frase ditada à proposta. `fimAtual` é o fim previsto da tarefa: uma data
 * ouvida depois dele vira "nova data de fim"; antes dele não muda o fim.
 */
export function interpretarFala(
  frase: string,
  opcoes: { hoje: string; fimAtual?: string | null }
): PropostaFala {
  const texto = limpar(frase);
  const n = normalizar(frase);
  const base: PropostaFala = {
    intencao: "nota",
    texto,
    motivo: null,
    novoFim: null,
    quantidade: null,
    unidade: null,
    dataOuvida: null,
    porque: [],
  };
  if (!n) return base;

  // 1) Motivo de atraso.
  let motivo: MotivoAtraso | null = null;
  const porque: string[] = [];
  for (const [m, re] of MOTIVOS) {
    const achou = n.match(re);
    if (achou) {
      motivo = m;
      porque.push(`"${achou[0]}"`);
      break;
    }
  }
  const generico = n.match(ATRASO_GENERICO);
  const dataOuv = dataDita(n, opcoes.hoje);
  const dur = duracaoDita(n);

  // 2) "Terminei" — só se não houver motivo de atraso (e não for "não está feito").
  const feita = n.match(FEITA);
  if (feita && !motivo && !generico && !NEGADO_ANTES.test(n)) {
    return { ...base, intencao: "feita", porque: [`"${feita[0]}"`] };
  }

  if (!motivo && !generico) return base;
  if (generico && !motivo) porque.push(`"${generico[0]}"`);

  const prop: PropostaFala = { ...base, intencao: "atraso", motivo: motivo ?? "outro", porque };
  if (dur) {
    prop.quantidade = dur.quantidade;
    prop.unidade = dur.unidade;
    porque.push(`"${dur.palavra}"`);
  }
  if (dataOuv) {
    prop.dataOuvida = dataOuv.data;
    porque.push(`"${dataOuv.palavra}"`);
    const fim = opcoes.fimAtual ?? null;
    if (!dur && (!fim || dataOuv.data > fim)) prop.novoFim = dataOuv.data;
  }
  return prop;
}

/** Para o ecrã: uma frase que diz o que se vai fazer. */
export function resumoProposta(p: PropostaFala, rotuloMotivo: (m: MotivoAtraso) => string): string {
  if (p.intencao === "feita") return "Dar esta tarefa por feita.";
  if (p.intencao === "nota") return "Guardar como nota: fica como legenda da próxima foto.";
  const partes = [`Registar um atraso — ${rotuloMotivo(p.motivo ?? "outro")}`];
  if (p.quantidade != null && p.unidade) partes.push(`mais ${String(p.quantidade).replace(".", ",")} ${p.unidade}`);
  if (p.novoFim) partes.push(`novo fim a ${p.novoFim.split("-").reverse().slice(0, 2).join("/")}`);
  return partes.join(" · ") + ".";
}
