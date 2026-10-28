// O rascunho do assistente: o que se escreve nos passos que ainda não gravam sozinhos (Preparar a visita, a morada da obra e o levantamento a meio).
// Fica em sessionStorage por negócio (ou por pessoa, sem negócio): sobrevive a mudar de passo, ao passo «Marcar a visita» e a recarregar a página.
// Lê com cuidado: um valor estragado ou de outra forma volta ao vazio em vez de rebentar o ecrã. Só lógica pura e o armazenamento.
import { CHAVES_MORADA, MORADA_VAZIA, type MoradaObraForm, type OrigemMoradaObra } from "@/components/negocio-metas/moradaObra";
import type { LinhaForm } from "@/components/negocio-metas/levantamento";

/** As durações do passo «Preparar a visita» (as chaves são as da agenda de visitas). */
export const DURACOES_PREPARAR = ["m30", "h1", "h1m30", "h2"] as const;
/** Quem vai estar na visita (as chaves são as da marcação). */
export const QUEM_VAI_ESTAR = ["cliente", "casal", "familia", "outra"] as const;

const ORIGENS: readonly string[] = ["entidade", "manual", "localizacao"];

export interface PrepararVisita {
  /** Vazio: ainda não se escolheu. */
  duracao: string;
  quem: string;
  nota: string;
}

export interface RascunhoAssistente {
  preparar: PrepararVisita;
  morada: MoradaObraForm;
  moradaOrigem: OrigemMoradaObra | null;
  /** As respostas do levantamento (as secções da Visita), por chave de pergunta. */
  respostas: Record<string, string>;
  /** As linhas de medidas e as observações gerais do levantamento. */
  linhas: LinhaForm[];
  observacoes: string;
}

/** Um rascunho vazio NOVO: nada se partilha entre leituras, por isso um passo que o mude não estraga o vazio das outras. */
export const rascunhoVazio = (): RascunhoAssistente => ({
  preparar: { duracao: "", quem: "", nota: "" }, morada: { ...MORADA_VAZIA }, moradaOrigem: null, respostas: {}, linhas: [], observacoes: "",
});

/** Só para comparar com o vazio (testes): quem precisa de um objeto seu usa `rascunhoVazio()`. */
export const RASCUNHO_VAZIO: Readonly<RascunhoAssistente> = rascunhoVazio();

let contadorLocal = 0;

/** O id de uma linha de medidas: `crypto.randomUUID` só existe em contexto seguro (https), por isso há uma alternativa local para o resto. */
export function novoIdLocal(): string {
  const c = typeof crypto === "undefined" ? undefined : crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  contadorLocal += 1;
  return `l-${Date.now().toString(36)}-${contadorLocal.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const chaveDoRascunho = (id: string): string => `olyvia.assistente:${id}`;

/** A duração que segue para a agenda de «Marcar a visita»; vazia não escolhe nada (a agenda usa a sua). */
export const duracaoParaAgenda = (duracao: string): string | undefined => ((DURACOES_PREPARAR as readonly string[]).includes(duracao) ? duracao : undefined);

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): string => (typeof v === "string" ? v : "");
const dentroDa = (lista: readonly string[], v: unknown): string => (typeof v === "string" && lista.includes(v) ? v : "");

function lerLinhas(v: unknown): LinhaForm[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((l): LinhaForm[] => {
    if (!ehObjeto(l) || typeof l.id !== "string" || l.id === "") return [];
    return [{
      id: l.id, divisao: texto(l.divisao), trabalho: texto(l.trabalho), trabalhoOutro: texto(l.trabalhoOutro), medida: texto(l.medida),
      unidade: texto(l.unidade) || "m2", observacoes: texto(l.observacoes),
    }];
  });
}

/** O rascunho guardado, validado campo a campo; o que não se reconhece fica vazio. */
export function lerRascunho(id: string): RascunhoAssistente {
  let cru: unknown;
  try {
    cru = JSON.parse(window.sessionStorage.getItem(chaveDoRascunho(id)) ?? "null");
  } catch {
    return rascunhoVazio();
  }
  if (!ehObjeto(cru)) return rascunhoVazio();
  const p = ehObjeto(cru.preparar) ? cru.preparar : {};
  const m = ehObjeto(cru.morada) ? cru.morada : {};
  const morada = Object.fromEntries(CHAVES_MORADA.map((c) => [c, texto(m[c])])) as unknown as MoradaObraForm;
  const respostas = ehObjeto(cru.respostas)
    ? Object.fromEntries(Object.entries(cru.respostas).filter((e): e is [string, string] => typeof e[1] === "string"))
    : {};
  return {
    preparar: { duracao: dentroDa(DURACOES_PREPARAR, p.duracao), quem: dentroDa(QUEM_VAI_ESTAR, p.quem), nota: texto(p.nota) },
    morada, moradaOrigem: typeof cru.moradaOrigem === "string" && ORIGENS.includes(cru.moradaOrigem) ? (cru.moradaOrigem as OrigemMoradaObra) : null,
    respostas, linhas: lerLinhas(cru.linhas), observacoes: texto(cru.observacoes),
  };
}

/** Guarda o rascunho; se o armazenamento recusar (modo privado, cheio) o assistente continua a funcionar só em memória. */
export function guardarRascunho(id: string, rascunho: RascunhoAssistente): void {
  try {
    window.sessionStorage.setItem(chaveDoRascunho(id), JSON.stringify(rascunho));
  } catch {
    // Sem armazenamento: o rascunho vive só enquanto o ecrã estiver aberto.
  }
}

export function existeRascunho(id: string): boolean {
  try {
    return window.sessionStorage.getItem(chaveDoRascunho(id)) !== null;
  } catch {
    return false;
  }
}

/** Leva o rascunho da chave antiga para a nova (a pessoa passou a ter negócio) e apaga a antiga. Um rascunho que a chave nova já tinha não se pisa. */
export function migrarRascunho(de: string, para: string): void {
  if (de === para) return;
  try {
    const antigo = window.sessionStorage.getItem(chaveDoRascunho(de));
    if (antigo === null) return;
    if (window.sessionStorage.getItem(chaveDoRascunho(para)) === null) window.sessionStorage.setItem(chaveDoRascunho(para), antigo);
    window.sessionStorage.removeItem(chaveDoRascunho(de));
  } catch {
    // Sem armazenamento: o rascunho continua em memória (o hook leva-o consigo).
  }
}

export function apagarRascunho(id: string): void {
  try {
    window.sessionStorage.removeItem(chaveDoRascunho(id));
  } catch {
    // Nada a apagar.
  }
}
