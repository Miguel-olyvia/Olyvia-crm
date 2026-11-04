// 4/11 (Rúben): «Tudo na chamada» com a transcrição em direto. O telemóvel em alta voz, o browser capta o
// microfone e manda o áudio ao motor local (tools/chamadas/servidor.py, na máquina com a GPU), que transcreve,
// diz quem fala e, no fim, preenche os campos da Lead e do Contacto a partir do que se disse. Nada de áudio
// sai para fora: o motor corre em casa. Esta parte é só lógica (sem React), para se testar à parte.
import { listaVarios, type Def, type Grupo } from "./campos";

/** Onde está o motor. Por ordem: o que a pessoa escreveu no painel (localStorage), o da build
 *  (VITE_CHAMADAS_MOTOR_URL, p. ex. o túnel wss://….trycloudflare.com/ws no Vercel), o próprio PC. */
export const MOTOR_URL_PADRAO = "ws://127.0.0.1:8765/ws";
const env = (k: string): string => { try { return (import.meta.env?.[k] as string | undefined) ?? ""; } catch { return ""; } };
const ler = (k: string): string => { try { return localStorage.getItem(k) ?? ""; } catch { return ""; } };
export function urlDoMotor(): string {
  return ler("olyvia.chamadas.motor") || env("VITE_CHAMADAS_MOTOR_URL") || MOTOR_URL_PADRAO;
}
/** O segredo partilhado com o motor quando ele está na internet (CHAMADAS_TOKEN no servidor). Vazio no PC. */
export function segredoDoMotor(): string {
  return ler("olyvia.chamadas.segredo") || env("VITE_CHAMADAS_MOTOR_SEGREDO");
}
export function guardarMotor(url: string, segredo: string): void {
  try {
    if (url.trim()) localStorage.setItem("olyvia.chamadas.motor", url.trim()); else localStorage.removeItem("olyvia.chamadas.motor");
    if (segredo.trim()) localStorage.setItem("olyvia.chamadas.segredo", segredo.trim()); else localStorage.removeItem("olyvia.chamadas.segredo");
  } catch { /* sem localStorage */ }
}
/** O endereço http do motor (para as vozes e as fichas), a partir do ws. */
export const httpDoMotor = (ws = urlDoMotor()) => ws.replace(/^ws/, "http").replace(/\/ws$/, "");
/** Junta o segredo ao endereço (?token=), se houver. */
export const comSegredo = (url: string, segredo = segredoDoMotor()) =>
  segredo ? url + (url.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(segredo) : url;

/** Uma fala transcrita, como o motor a manda. */
export interface Fala { inicio: number; fim: number; texto: string; falante: "comercial" | "cliente"; confianca_falante: number }

/** Um campo extraído pelo motor (a forma de extrair.py). */
export interface CampoExtraido {
  chave: string; rotulo: string; tipo: string; valor: string | number | boolean | null; valor_rotulo: string | null;
  confianca: number; excerto: string; estado: "preenchido" | "rever" | "em_falta";
}
export interface Extracao { resumo: string; motor: string; fichas: { campos: CampoExtraido[] }[] }

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
  const defs = new Map(grupos.filter((g) => !g.oculto).flatMap((g) => g.campos).map((c) => [c.k, c] as const));
  const out: Proposta[] = [];
  for (const x of extracao.fichas.flatMap((fi) => fi.campos)) {
    const c = defs.get(x.chave);
    if (!c) continue;
    const valor = valorParaCampo(c, x);
    if (valor === null) continue;
    out.push({ k: x.chave, l: c.l, valor, confianca: x.confianca, excerto: x.excerto, estado: x.estado, jaTinha: f[x.chave] || "" });
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
