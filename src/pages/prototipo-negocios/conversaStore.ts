// O levantamento por conversa (21/10/2026): a conversa de cada negócio e a ligação ao Claude (pelo proxy do servidor).
// · O que se vê (as mensagens, as miniaturas, os cartões) e o rascunho ficam no localStorage, por negócio.
// · A conversa com a API (com as fotografias inteiras e os blocos de raciocínio) fica só em memória, sempre a crescer
//   (nunca se reescreve o que já foi): ao recarregar a página começa outra, e o contexto da visita vai em cada mensagem.
// · Sem chave no servidor (503), responde o modo de demonstração (conversaIA.ts: simular), com o mesmo ecrã.
import { useSyncExternalStore } from "react";
import type { Estado, Negocio } from "./motor";
import type { Catalogo } from "./v2/catalogoModelo";
import {
  contextoVisita, executar, ferramentas, mensagemComercial, rascunhoVazio, simular, sistema, textoDe, type Cartao, type MensagemApi, type Rascunho, type RespostaApi,
} from "./conversaIA";

const ROTA = "/api/ia/levantamento";
const CHAVE = (id: number) => `olyvia-conversa-v1-${id}`;
/** Voltas máximas de ferramentas por mensagem (procurar → propor → mostrar → responder). */
const MAX_VOLTAS = 8;

export interface Msg {
  id: number;
  de: "eu" | "olyvia";
  texto: string;
  /** Miniaturas das fotografias (data URL pequenas). */
  fotos?: string[];
  cartoes?: Cartao[];
  /** O produto escolhido num cartão de produtos (por índice do cartão). */
  escolha?: Record<number, string>;
  erro?: boolean;
  /** Ainda a chegar (o cursor a piscar). */
  vivo?: boolean;
  /** Uma mensagem do sistema (ex.: "Juntei à visita…"). */
  nota?: boolean;
}
export type EstadoConversa = "parado" | "a pensar" | "a escrever";
export interface Conversa {
  msgs: Msg[];
  rascunho: Rascunho;
  /** Itens do rascunho que o comercial desligou ("s:c13", "p:<id>", "m:pav", "k:c13", "n:<texto>"). */
  fora: string[];
  /** O que entrou na última volta (para o realce de entrada). */
  novos: string[];
  estado: EstadoConversa;
}

/* ------------------------------------------------------------------ o estado */
const conversas = new Map<number, Conversa>();
const api = new Map<number, MensagemApi[]>();
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());

function ler(id: number): Conversa {
  let c = conversas.get(id);
  if (c) return c;
  c = { msgs: [], rascunho: rascunhoVazio(), fora: [], novos: [], estado: "parado" };
  try {
    const g = JSON.parse(localStorage.getItem(CHAVE(id)) ?? "null") as Partial<Conversa> | null;
    if (g?.msgs) c = { ...c, msgs: g.msgs.map((m) => ({ ...m, vivo: false })), rascunho: { ...rascunhoVazio(), ...g.rascunho }, fora: g.fora ?? [] };
  } catch { /* sem localStorage: começa vazia */ }
  conversas.set(id, c);
  return c;
}
function mudar(id: number, f: (c: Conversa) => Partial<Conversa>) {
  const c = { ...ler(id), ...f(ler(id)) };
  conversas.set(id, c);
  if (c.estado === "parado") {
    try { localStorage.setItem(CHAVE(id), JSON.stringify({ msgs: c.msgs, rascunho: c.rascunho, fora: c.fora })); } catch { /* cheio: fica só em memória */ }
  }
  avisar();
}
const mudarMsg = (id: number, mid: number, f: (m: Msg) => Partial<Msg>) => mudar(id, (c) => ({ msgs: c.msgs.map((m) => (m.id === mid ? { ...m, ...f(m) } : m)) }));

export function useConversa(id: number): Conversa {
  return useSyncExternalStore((f) => { ouvintes.add(f); return () => ouvintes.delete(f); }, () => ler(id), () => ler(id));
}
export const lerConversa = ler;

/* ------------------------------------------------------------------ a IA está ligada? */
let ligada: boolean | null = null;
const ouvLigada = new Set<() => void>();
export async function verLigada(): Promise<boolean> {
  if (ligada != null) return ligada;
  try {
    const r = await fetch(ROTA);
    ligada = r.ok && ((await r.json()) as { ligada?: boolean }).ligada === true;
  } catch { ligada = false; }
  ouvLigada.forEach((f) => f());
  return ligada;
}
export const useLigada = () => useSyncExternalStore((f) => { ouvLigada.add(f); return () => ouvLigada.delete(f); }, () => ligada, () => ligada);

/* ------------------------------------------------------------------ a chamada */
/** Lê o NDJSON do proxy: o texto a chegar vai para `aoTexto`; devolve a mensagem inteira. */
async function chamar(corpo: unknown, aoTexto: (t: string) => void): Promise<RespostaApi> {
  const r = await fetch(ROTA, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
  if (r.status === 503) throw new SemChave();
  if (!r.ok || !r.body) throw new Error(`O servidor respondeu ${r.status}`);
  const leitor = r.body.getReader(), dec = new TextDecoder();
  let resto = "", fim: RespostaApi | null = null;
  for (;;) {
    const { done, value } = await leitor.read();
    if (value) resto += dec.decode(value, { stream: true });
    let i: number;
    while ((i = resto.indexOf("\n")) >= 0) {
      const linha = resto.slice(0, i).trim();
      resto = resto.slice(i + 1);
      if (!linha) continue;
      const ev = JSON.parse(linha) as { t: "texto"; d: string } | { t: "fim"; msg: RespostaApi } | { t: "erro"; msg: string };
      if (ev.t === "texto") aoTexto(ev.d);
      else if (ev.t === "fim") fim = ev.msg;
      else throw new Error(ev.msg);
    }
    if (done) break;
  }
  if (!fim) throw new Error("A resposta veio incompleta");
  return fim;
}
class SemChave extends Error {}

/** Escreve um texto aos poucos (o modo de demonstração "escreve" como a IA). */
async function escreverAosPoucos(t: string, aoTexto: (t: string) => void) {
  const pal = t.split(/(\s+)/);
  for (let i = 0; i < pal.length; i += 2) {
    aoTexto(pal.slice(i, i + 2).join(""));
    await new Promise((ok) => setTimeout(ok, 28));
  }
}

export interface Fonte { S: Estado; K: Catalogo; d: Negocio }
let proximoId = Date.now();

/**
 * Manda uma mensagem do comercial e trata a resposta toda: o texto a chegar, as ferramentas (procurar no Catálogo,
 * atualizar o rascunho, cartões), as voltas seguintes, até a Olyvia acabar. `fonte` lê o estado atual a cada volta.
 */
export async function enviar(fonte: () => Fonte, texto: string, fotos: { tipo: string; base64: string; mini: string }[] = []) {
  const { d } = fonte(), id = d.id;
  if (ler(id).estado !== "parado") return;
  const eu: Msg = { id: proximoId++, de: "eu", texto, ...(fotos.length ? { fotos: fotos.map((f) => f.mini) } : {}) };
  const ela: Msg = { id: proximoId++, de: "olyvia", texto: "", vivo: true };
  mudar(id, (c) => ({ msgs: [...c.msgs, eu, ela], estado: "a pensar", novos: [] }));

  const hist = api.get(id) ?? [];
  api.set(id, hist);
  const base = hist.length;
  const juntarTexto = (t: string) => mudar(id, (c) => ({ estado: "a escrever", msgs: c.msgs.map((m) => (m.id === ela.id ? { ...m, texto: m.texto + t } : m)) }));
  const juntarCartoes = (cs: Cartao[]) => cs.length && mudarMsg(id, ela.id, (m) => ({ cartoes: [...(m.cartoes ?? []), ...cs] }));

  try {
    const { S, K } = fonte();
    hist.push(mensagemComercial(texto, fotos, contextoVisita(fonte().d, ler(id).rascunho)));
    const demo = !(await verLigada());
    if (demo) {
      await new Promise((ok) => setTimeout(ok, 450));
      const blocos = simular(S, K, fonte().d, ler(id).rascunho, texto, fotos.length);
      await escreverAosPoucos(textoDe(blocos), juntarTexto);
      const v = executar(blocos, ler(id).rascunho, S, K, fonte().d);
      mudar(id, (c) => ({ rascunho: v.rascunho, novos: v.novos, fora: c.fora.filter((x) => !v.novos.includes(x)) }));
      juntarCartoes(v.cartoes);
      // a conversa com a API não guarda as voltas da demonstração (seriam blocos que a API não fez)
      hist.pop();
    } else {
      for (let volta = 0; volta < MAX_VOLTAS; volta++) {
        const f = fonte();
        if (volta > 0 && ler(id).msgs.find((m) => m.id === ela.id)?.texto) juntarTexto(" ");
        const msg = await chamar({ system: sistema(f.S, f.K, f.d), tools: ferramentas(f.d), messages: hist }, juntarTexto);
        hist.push({ role: "assistant", content: msg.content });
        if (msg.stop_reason === "refusal") { juntarTexto("Não consigo ajudar com isso. Diga-me de outra forma o que o cliente quer?"); break; }
        const v = executar(msg.content, ler(id).rascunho, f.S, f.K, f.d);
        mudar(id, (c) => ({ rascunho: v.rascunho, novos: [...c.novos, ...v.novos], fora: c.fora.filter((x) => !v.novos.includes(x)) }));
        juntarCartoes(v.cartoes);
        if (msg.stop_reason !== "tool_use" || !v.resultados.length) break;
        hist.push({ role: "user", content: v.resultados });
      }
    }
  } catch (e) {
    // se a chamada falhou a meio, a conversa da API volta a como estava antes desta mensagem (sem ferramentas por responder)
    hist.length = base;
    const sem = e instanceof SemChave;
    if (sem) ligada = false;
    mudarMsg(id, ela.id, (m) => ({ erro: true, texto: m.texto || (sem ? "A IA não está ligada no servidor." : `Não consegui responder: ${e instanceof Error ? e.message : e}`) }));
  } finally {
    mudarMsg(id, ela.id, (m) => ({ vivo: false, texto: m.texto.trim() || (m.cartoes?.length ? "" : "Pronto.") }));
    mudar(id, () => ({ estado: "parado" }));
  }
}

/* ------------------------------------------------------------------ o que o comercial faz no ecrã */
/** Escolher um produto num cartão: entra logo no rascunho e a escolha segue para a Olyvia. */
export function escolherProduto(fonte: () => Fonte, mid: number, i: number, pid: string, nome: string, para: string | null) {
  const id = fonte().d.id;
  mudarMsg(id, mid, (m) => ({ escolha: { ...(m.escolha ?? {}), [i]: pid } }));
  mudar(id, (c) => ({ rascunho: { ...c.rascunho, produtos: { ...c.rascunho.produtos, [pid]: c.rascunho.produtos[pid] ?? { q: 1, motivo: "Escolhido pelo cliente" } } }, novos: ["p:" + pid], fora: c.fora.filter((x) => x !== "p:" + pid) }));
  void enviar(fonte, `Escolhido: ${nome} (${pid})${para ? ` para ${para}` : ""}.`);
}
/** Ligar ou desligar um item do rascunho (fica, mas não entra ao validar). */
export const alternar = (id: number, chave: string) => mudar(id, (c) => ({ fora: c.fora.includes(chave) ? c.fora.filter((x) => x !== chave) : [...c.fora, chave] }));
/** Mudar a quantidade de um serviço ou produto do rascunho. */
export function mudarQtd(id: number, chave: string, q: number) {
  const [t, k] = [chave.slice(0, 1), chave.slice(2)];
  mudar(id, (c) => {
    const r = { ...c.rascunho, servicos: { ...c.rascunho.servicos }, produtos: { ...c.rascunho.produtos } };
    if (t === "s" && r.servicos[k]) r.servicos[k] = { ...r.servicos[k], q };
    if (t === "p" && r.produtos[k]) r.produtos[k] = { ...r.produtos[k], q };
    return { rascunho: r };
  });
}
/** Depois de validar: o rascunho fica vazio e a conversa diz o que entrou. */
export function validado(id: number, texto: string) {
  mudar(id, (c) => ({ rascunho: rascunhoVazio(), fora: [], novos: [], msgs: [...c.msgs, { id: proximoId++, de: "olyvia", texto, nota: true }] }));
}
/** Começar de novo (a conversa e o rascunho; o que já entrou na visita fica). */
export function recomecar(id: number) {
  api.delete(id);
  conversas.delete(id);
  try { localStorage.removeItem(CHAVE(id)); } catch { /* nada */ }
  avisar();
}
