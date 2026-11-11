// 4/11 (Rúben): «Tudo na chamada» com a transcrição em direto: a lógica das propostas, do que o motor
// (as funções Supabase chamada-transcrever e chamada-campos, em chamadaNuvem.ts) devolve para o formulário.
// Só lógica, sem React, para se testar à parte.
import { listaVarios, type Def, type Grupo } from "./campos";

/** Uma fala transcrita, como o motor a manda. 11/11: «revista» quando já veio da segunda passagem (o bloco contínuo, com quem fala
 *  decidido pelo modelo); sem ela é a pré-visualização em direto, que o bloco ainda vai substituir. «outro» é uma terceira pessoa. */
export interface Fala { inicio: number; fim: number; texto: string; falante: "comercial" | "cliente" | "outro"; confianca_falante: number;
  revista?: boolean; confianca?: number }

export const nomeFalante = (f: Fala["falante"]) => f === "comercial" ? "Comercial" : f === "outro" ? "Outra pessoa" : "Cliente";

/** 11/11: a análise da conversa (a função chamada-campos com pedir «insights»). As «linha» são o índice da fala na transcrição enviada. */
export interface ItemInsight { texto: string; linha?: number | null }
export interface Insights {
  resumo: string;
  temperatura: "quente" | "morno" | "frio";
  pontuacao: number;
  porque_temperatura: string;
  motivacao?: string | null;
  necessidades: ItemInsight[];
  orcamento: { valor: string | null; sensibilidade: "alta" | "media" | "baixa" | "desconhecida"; notas?: string | null };
  prazo: { quando: string | null; urgencia: "alta" | "media" | "baixa" | "desconhecida"; data_decisao?: string | null; notas?: string | null };
  decisores: { quem: string; papel: string }[];
  concorrencia: { outros_orcamentos: "sim" | "nao" | "desconhecido"; notas?: string | null };
  objecoes: { texto: string; resposta?: string | null; resolvida: boolean; linha?: number | null }[];
  sinais_compra: ItemInsight[];
  preferencias: { tema: string; texto: string; linha?: number | null }[];
  riscos: { texto: string; gravidade: "alta" | "media" | "baixa"; linha?: number | null }[];
  compromissos: { quem: "comercial" | "cliente"; texto: string; quando?: string | null }[];
  proximos_passos: { texto: string; responsavel: string; quando?: string | null }[];
  por_perguntar: string[];
  oportunidades: ItemInsight[];
  momentos: { linha: number; titulo: string }[];
  coaching: { correu_bem: string[]; a_melhorar: string[] };
  sentimento: { inicio: string; fim: string; notas?: string | null };
  /** 11/11: só na visita, o levantamento: o que ficou escolhido peça a peça, as medidas ditas e os valores falados. */
  escolhas?: { peca: string; escolha: string; decidida: boolean; linha?: number | null }[];
  medidas?: { o_que: string; valor: string; linha?: number | null }[];
  valores?: ItemInsight[];
}
export interface Metricas { duracaoS: number; falas: number; pctComercial: number; pctCliente: number; perguntasComercial: number; maiorFalaClienteS: number }
/** O que fica guardado no negócio (d.f.insights_chamada / insights_visita): a análise, o início de cada fala a que as linhas se referem,
 *  as contas e quando se fez. */
export interface InsightsGuardados { insights: Insights; tempos: number[]; em: string; metricas: Metricas }

/** As contas da conversa que não precisam de IA: duração, quem fala quanto (por palavras), perguntas do comercial. */
export function metricasDaConversa(falas: readonly Fala[]): Metricas {
  const palavras = (t: string) => (t.match(/\p{L}+/gu) ?? []).length;
  let com = 0, cli = 0, perguntas = 0, maior = 0;
  for (const f of falas) {
    const n = palavras(f.texto);
    if (f.falante === "comercial") { com += n; perguntas += (f.texto.match(/\?/g) ?? []).length; }
    else { cli += n; maior = Math.max(maior, Math.max(0, f.fim - f.inicio)); }
  }
  const total = com + cli || 1;
  const duracaoS = falas.length ? Math.max(0, Math.max(...falas.map((f) => f.fim)) - Math.min(...falas.map((f) => f.inicio))) : 0;
  return { duracaoS: Math.round(duracaoS), falas: falas.length, pctComercial: Math.round((com / total) * 100), pctCliente: Math.round((cli / total) * 100),
    perguntasComercial: perguntas, maiorFalaClienteS: Math.round(maior) };
}

/** A transcrição guardada no negócio («0:42 Cliente: texto», uma por linha) volta a falas, para se ver e analisar outra vez. */
export function falasDoTexto(texto: string | undefined | null): Fala[] {
  const out: Fala[] = [];
  for (const linha of (texto ?? "").split("\n")) {
    const m = linha.match(/^(\d+):(\d{2})\s+(Comercial|Cliente|Outra pessoa):\s?(.*)$/);
    if (!m) { if (out.length && linha.trim()) out[out.length - 1].texto += " " + linha.trim(); continue; }
    const inicio = Number(m[1]) * 60 + Number(m[2]);
    out.push({ inicio, fim: inicio, texto: m[4].trim(), falante: m[3] === "Comercial" ? "comercial" : m[3] === "Outra pessoa" ? "outro" : "cliente", confianca_falante: 1, revista: true });
  }
  for (let i = 0; i < out.length; i++) out[i].fim = i + 1 < out.length ? Math.max(out[i].inicio, out[i + 1].inicio) : out[i].inicio + 3;
  return out;
}

/** Lê a análise guardada no negócio (ou null se não há, ou se está estragada). */
export function lerInsights(json: string | undefined | null): InsightsGuardados | null {
  if (!json) return null;
  try {
    const x = JSON.parse(json) as InsightsGuardados;
    return x && x.insights && typeof x.insights.resumo === "string" ? x : null;
  } catch { return null; }
}

/** Um campo extraído pelo motor (a forma de extrair.py). */
export interface CampoExtraido {
  chave: string; rotulo: string; tipo: string; valor: string | number | boolean | null; valor_rotulo: string | null;
  confianca: number; excerto: string; estado: "preenchido" | "rever" | "em_falta";
}
export interface Extracao { resumo: string; motor: string; fichas: { campos: CampoExtraido[] }[];
  /** 5/11: quem disse cada linha, revisto pelo sentido da conversa no fim (uma entrada por linha enviada). */
  falantes?: ("comercial" | "cliente")[];
  /** 11/11: a análise da conversa, quando pedida. */
  insights?: Insights }

/** Os campos que se mandam ao motor: os Def dos grupos (k, l, t, op, ajuda, un), sem os ocultos. */
export function camposParaMotor(grupos: Grupo[]): Pick<Def, "k" | "l" | "t" | "op" | "ajuda" | "un">[] {
  return grupos.filter((g) => !g.oculto).flatMap((g) => g.campos.map(({ k, l, t, op, ajuda, un }) => ({ k, l, t, op, ajuda, un })));
}

const limpo = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** O valor de um campo extraído no formato que o formulário guarda (texto), ou null se não serve. */
export function valorParaCampo(c: Def, x: CampoExtraido): string | null {
  if (x.valor === null || x.valor === undefined || x.estado === "em_falta") return null;
  const v = x.valor;
  switch (c.t) {
    case "sim_nao": return v === true ? "Sim" : v === false ? "Não" : null;
    case "escolha": { const op = (c.op ?? []).find((o) => limpo(o) === limpo(String(v))); return op ?? null; }
    case "varios": {
      // cada opção conta se aparece inteira (palavra a palavra) no que foi dito: «b, c e também d» dá B e C, não A
      const dito = " " + limpo(String(v)).replace(/[,;]/g, " ") + " ";
      const op = (c.op ?? []).filter((o) => dito.includes(" " + limpo(o) + " "));
      return op.length ? op.join(", ") : null;
    }
    case "numero": case "contador": {
      const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
      if (!Number.isFinite(n)) return null;
      if (c.t === "contador") { const i = Math.round(n); if (c.min !== undefined && i < c.min) return null; if (c.max !== undefined && i > c.max) return null; return String(i); }
      return String(n);
    }
    case "data": return /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : null;
    default: return String(v).trim() || null;
  }
}

export interface Proposta { k: string; l: string; valor: string; confianca: number; excerto: string; estado: CampoExtraido["estado"]; jaTinha: string }

/** O que a extração propõe para cada campo do formulário, com o que o campo já tinha (para não escrever por cima sem querer). */
export function propostas(extracao: Extracao | null | undefined, grupos: Grupo[], f: Record<string, string>): Proposta[] {
  if (!extracao) return [];
  // pela ordem do formulário (grupos e campos), não pela ordem em que o motor os devolveu
  const extraidos = new Map(extracao.fichas.flatMap((fi) => fi.campos).map((x) => [x.chave, x] as const));
  const out: Proposta[] = [];
  for (const c of grupos.filter((g) => !g.oculto).flatMap((g) => g.campos)) {
    const x = extraidos.get(c.k);
    if (!x) continue;
    const valor = valorParaCampo(c, x);
    if (valor === null) continue;
    out.push({ k: c.k, l: c.l, valor, confianca: x.confianca, excerto: x.excerto, estado: x.estado, jaTinha: f[c.k] || "" });
  }
  return out;
}

/** As propostas que entram: as de campos vazios e, se `substituir`, também as que mudam um valor já escrito. */
export const aAplicar = (p: Proposta[], substituir: boolean) =>
  p.filter((x) => x.jaTinha.trim() === "" ? true : substituir && x.jaTinha !== x.valor);

/** Para os `varios` já com valor: junta em vez de substituir (nunca perde o que a pessoa marcou). */
export function juntarVarios(c: Def | undefined, antigo: string, novo: string): string {
  if (!c || c.t !== "varios" || !antigo) return novo;
  const lista = listaVarios(antigo);
  for (const o of listaVarios(novo)) if (!lista.includes(o)) lista.push(o);
  return lista.join(", ");
}

/** 5/11 (a folha da visita): junta duas extrações (a da conversa e a da foto da folha). Por campo fica a leitura com valor e mais confiança;
 *  os resumos juntam-se. Sem a primeira, fica a segunda. */
export function juntarExtracoes(a: Extracao | null, b: Extracao): Extracao {
  if (!a) return b;
  const porChave = new Map<string, CampoExtraido>();
  const nota = (x: CampoExtraido) => (x.estado === "em_falta" || x.valor === null ? -1 : x.confianca);
  for (const x of [...a.fichas.flatMap((f) => f.campos), ...b.fichas.flatMap((f) => f.campos)]) {
    const ja = porChave.get(x.chave);
    if (!ja || nota(x) > nota(ja)) porChave.set(x.chave, x);
  }
  return { resumo: [a.resumo, b.resumo].filter(Boolean).join(" "), motor: b.motor, fichas: [{ campos: [...porChave.values()] }],
    ...(a.falantes ? { falantes: a.falantes } : {}) };
}
