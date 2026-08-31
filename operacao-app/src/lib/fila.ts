import {
  chaveDaMedicao,
  chaveDaTarefa,
  desistiu,
  especieDaFalha,
  juntar,
  type PorEnviar,
} from "../domain/fila";
import { ErroDeEscrita, responderMedicao, responderTarefa } from "./dados";

/**
 * As respostas que ainda não saíram do telemóvel.
 *
 * Guardadas em IndexedDB e não em memória, porque o problema que isto resolve
 * é precisamente **fechar a aplicação**: numa cave sem rede, o técnico responde
 * a seis tarefas, o telemóvel adormece, e hoje perde-se tudo.
 *
 * Também não em `localStorage`: esse é síncrono e bloqueia o ecrã, e alguns
 * browsers apagam-no com mais facilidade do que apagam uma base.
 *
 * ⚠ ISTO NÃO É MODO OFFLINE COMPLETO
 *
 * Isto salva o **que se escreve**. Não faz a aplicação **abrir** sem rede — se
 * o técnico fechar o separador numa cave, não consegue voltar a entrar até ter
 * sinal. Essa parte é um service worker, é outro trabalho, e está por fazer.
 * O ecrã não promete o que não faz.
 */

const BASE = "operacao-fila";
const LOJA = "por-enviar";
const VERSAO = 1;

let promessaDaBase: Promise<IDBDatabase | null> | null = null;

/**
 * Abre a base uma vez só.
 *
 * Devolve `null` — em vez de rebentar — quando não há IndexedDB: janela
 * privada em certos browsers, armazenamento bloqueado, um teste sem DOM. Nesse
 * caso a aplicação funciona como funcionava antes, e o técnico vê o erro em
 * cada resposta. É pior, mas é honesto, e nada deixa de funcionar por isto.
 */
function abrir(): Promise<IDBDatabase | null> {
  if (promessaDaBase) return promessaDaBase;

  promessaDaBase = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const p = indexedDB.open(BASE, VERSAO);
      p.onupgradeneeded = () => {
        if (!p.result.objectStoreNames.contains(LOJA)) {
          p.result.createObjectStore(LOJA, { keyPath: "chave" });
        }
      };
      p.onsuccess = () => resolve(p.result);
      p.onerror = () => resolve(null);
      p.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });

  return promessaDaBase;
}

function pedir<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function lerTudo(): Promise<PorEnviar[]> {
  const db = await abrir();
  if (!db) return [];
  try {
    const tx = db.transaction(LOJA, "readonly");
    const linhas = await pedir(tx.objectStore(LOJA).getAll() as IDBRequest<PorEnviar[]>);
    // A ordem por que o técnico respondeu é a que faz sentido no histórico.
    return [...linhas].sort((a, b) => a.criadaEm - b.criadaEm);
  } catch {
    return [];
  }
}

async function escrever(itens: readonly PorEnviar[]): Promise<void> {
  const db = await abrir();
  if (!db) return;
  const tx = db.transaction(LOJA, "readwrite");
  const loja = tx.objectStore(LOJA);
  for (const i of itens) loja.put(i);
  await new Promise<void>((resolve) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

async function apagar(chave: string): Promise<void> {
  const db = await abrir();
  if (!db) return;
  try {
    const tx = db.transaction(LOJA, "readwrite");
    tx.objectStore(LOJA).delete(chave);
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* uma resposta que não se conseguiu apagar tenta outra vez, e falha na
       chamada seguinte com o mesmo resultado. Não vale um ecrã de erro. */
  }
}

/* ─────────────────────── Quem quer saber da fila ───────────────────────── */

type Ouvinte = (estado: EstadoDaFila) => void;

export interface EstadoDaFila {
  porEnviar: PorEnviar[];
  aEnviar: boolean;
  /** As que o servidor recusou vezes de mais. Precisam de uma pessoa. */
  encalhadas: PorEnviar[];
  /**
   * Quantas saíram mesmo na última tentativa.
   *
   * O ecrã diz "saiu tudo" a partir daqui, e não de a contagem ter chegado a
   * zero. São coisas diferentes: uma resposta descartada também faz a
   * contagem cair, e dizer que ela "já está no servidor" seria mentira.
   */
  enviadasAgora: number;
}

const ouvintes = new Set<Ouvinte>();
let estado: EstadoDaFila = { porEnviar: [], aEnviar: false, encalhadas: [], enviadasAgora: 0 };

function anunciar(novo: Partial<EstadoDaFila>) {
  estado = { ...estado, ...novo };
  for (const o of ouvintes) o(estado);
}

export function ouvirFila(o: Ouvinte): () => void {
  ouvintes.add(o);
  o(estado);
  return () => ouvintes.delete(o);
}

export function estadoDaFila(): EstadoDaFila {
  return estado;
}

/** Lê o que ficou de uma sessão anterior. Chamado uma vez, ao arrancar. */
export async function recuperarFila(): Promise<void> {
  const todas = await lerTudo();
  anunciar({
    porEnviar: todas.filter((x) => !desistiu(x)),
    encalhadas: todas.filter(desistiu),
  });
}

/* ──────────────────────────── Pôr na fila ──────────────────────────────── */

async function guardar(item: PorEnviar): Promise<void> {
  const atual = await lerTudo();
  const nova = juntar(atual.filter((x) => !desistiu(x)), item);
  await escrever(nova);
  anunciar({ porEnviar: nova, encalhadas: atual.filter(desistiu) });
}

/**
 * Grava uma resposta a uma tarefa; se não conseguir por falta de rede, guarda.
 *
 * Devolve o que aconteceu, para o ecrã poder dizer a verdade: "gravado" é
 * diferente de "vai sair quando houver rede", e chamar às duas coisas o mesmo
 * seria a maneira mais rápida de se perder a confiança nisto.
 */
export type Resultado =
  | { fim: "gravado"; corretiva: string | null }
  | { fim: "na_fila" }
  | { fim: "recusado"; motivo: string };

export async function responderTarefaOuGuardar(
  ordemId: string,
  args: {
    tarefaId: string;
    estado?: string | null;
    valorNum?: number | null;
    valorTexto?: string | null;
    observacoes?: string | null;
  }
): Promise<Resultado> {
  try {
    const r = await responderTarefa(args);
    void tentarEnviar();
    return { fim: "gravado", corretiva: r.corretiva_gerada ?? null };
  } catch (e) {
    if (especieDaFalha(e) === "recusada") {
      return {
        fim: "recusado",
        motivo: e instanceof ErroDeEscrita ? e.message : "Não foi possível gravar a resposta.",
      };
    }
    await guardar({
      chave: chaveDaTarefa(args.tarefaId),
      tipo: "tarefa",
      ordemId,
      carga: { ...args },
      criadaEm: Date.now(),
      tentativas: 0,
    });
    return { fim: "na_fila" };
  }
}

export async function responderMedicaoOuGuardar(
  ordemId: string,
  args: {
    tarefaId: string;
    medicaoDefId: string;
    valorNum?: number | null;
    valorTexto?: string | null;
    opcaoId?: string | null;
  }
): Promise<Resultado> {
  try {
    const r = await responderMedicao(args);
    void tentarEnviar();
    return { fim: "gravado", corretiva: r.corretiva_gerada ?? null };
  } catch (e) {
    if (especieDaFalha(e) === "recusada") {
      return {
        fim: "recusado",
        motivo: e instanceof ErroDeEscrita ? e.message : "Não foi possível gravar a leitura.",
      };
    }
    await guardar({
      chave: chaveDaMedicao(args.tarefaId, args.medicaoDefId),
      tipo: "medicao",
      ordemId,
      carga: { ...args },
      criadaEm: Date.now(),
      tentativas: 0,
    });
    return { fim: "na_fila" };
  }
}

/* ────────────────────────────── Esvaziar ───────────────────────────────── */

let aEnviar = false;

/**
 * Tenta mandar o que está à espera, uma de cada vez e pela ordem em que foi
 * respondido.
 *
 * Uma de cada vez, e não todas de uma vez, porque uma resposta pode gerar uma
 * ordem corretiva; mandá-las em paralelo daria corretivas duplicadas quando
 * duas tarefas da mesma ordem falham juntas.
 *
 * Ao primeiro sinal de que a rede continua em baixo, pára. Não vale a pena
 * bater cinco vezes na mesma porta fechada, e cada tentativa gasta bateria de
 * um telemóvel que já está numa cave.
 */
export async function tentarEnviar(): Promise<void> {
  if (aEnviar) return;
  const fila = (await lerTudo()).filter((x) => !desistiu(x));
  if (fila.length === 0) return;

  aEnviar = true;
  anunciar({ aEnviar: true, enviadasAgora: 0 });
  let saidas = 0;

  try {
    for (const item of fila) {
      try {
        if (item.tipo === "tarefa") {
          await responderTarefa(item.carga as Parameters<typeof responderTarefa>[0]);
        } else {
          await responderMedicao(item.carga as Parameters<typeof responderMedicao>[0]);
        }
        await apagar(item.chave);
        saidas += 1;
      } catch (e) {
        if (especieDaFalha(e) === "sem_rede") break;

        // Recusada. Fica com mais uma tentativa contada e o motivo à vista: à
        // quinta desiste-se e diz-se a uma pessoa, em vez de bater à porta
        // para sempre.
        await escrever([
          {
            ...item,
            tentativas: item.tentativas + 1,
            ultimoErro: e instanceof Error ? e.message : "Recusado pelo servidor.",
          },
        ]);
      }
    }
  } finally {
    aEnviar = false;
    const todas = await lerTudo();
    anunciar({
      aEnviar: false,
      enviadasAgora: saidas,
      porEnviar: todas.filter((x) => !desistiu(x)),
      encalhadas: todas.filter(desistiu),
    });
  }
}

/** Deitar fora uma resposta que o servidor recusa e ninguém vai salvar. */
export async function esquecer(chave: string): Promise<void> {
  await apagar(chave);
  const todas = await lerTudo();
  // `enviadasAgora: 0` de propósito: descartar não é enviar, e o ecrã não
  // pode dizer que aquilo chegou ao servidor.
  anunciar({
    enviadasAgora: 0,
    porEnviar: todas.filter((x) => !desistiu(x)),
    encalhadas: todas.filter(desistiu),
  });
}

/**
 * Passa a tentar sozinho quando a rede voltar.
 *
 * `online` é o sinal do browser, e mente com alguma frequência — diz que há
 * rede assim que há wi-fi, mesmo que o wi-fi não vá a lado nenhum. Por isso
 * também se tenta ao voltar ao separador, que é quando o técnico sai da cave e
 * olha para o telemóvel.
 */
export function ligarAoRegressoDaRede(): () => void {
  const tentar = () => void tentarEnviar();
  const aoVoltar = () => {
    if (document.visibilityState === "visible") tentar();
  };

  window.addEventListener("online", tentar);
  document.addEventListener("visibilitychange", aoVoltar);
  return () => {
    window.removeEventListener("online", tentar);
    document.removeEventListener("visibilitychange", aoVoltar);
  };
}
