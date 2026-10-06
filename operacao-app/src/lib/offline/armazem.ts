/**
 * Onde o telemóvel guarda o que precisa para trabalhar sem rede.
 *
 * Duas "gavetas": `cache` (o que se leu da base da última vez que houve rede)
 * e `fila` (o que se fez sem rede e ainda não chegou à base). IndexedDB,
 * porque guarda Blobs (as fotos) e sobrevive a fechar a aplicação. Sem
 * IndexedDB (testes, modo privado restrito) usa memória — a app funciona na
 * mesma, só não guarda entre aberturas.
 */

export type Gaveta = "cache" | "fila";

export interface Armazem {
  ler<T>(gaveta: Gaveta, chave: string): Promise<T | undefined>;
  gravar<T>(gaveta: Gaveta, chave: string, valor: T): Promise<void>;
  apagar(gaveta: Gaveta, chave: string): Promise<void>;
  todos<T>(gaveta: Gaveta): Promise<T[]>;
}

export function armazemEmMemoria(): Armazem {
  const g: Record<Gaveta, Map<string, unknown>> = { cache: new Map(), fila: new Map() };
  return {
    async ler<T>(gaveta: Gaveta, chave: string) {
      return g[gaveta].get(chave) as T | undefined;
    },
    async gravar<T>(gaveta: Gaveta, chave: string, valor: T) {
      g[gaveta].set(chave, valor);
    },
    async apagar(gaveta: Gaveta, chave: string) {
      g[gaveta].delete(chave);
    },
    async todos<T>(gaveta: Gaveta) {
      return [...g[gaveta].values()] as T[];
    },
  };
}

const NOME_BD = "operacao-offline";
const VERSAO_BD = 1;

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const pedido = indexedDB.open(NOME_BD, VERSAO_BD);
    pedido.onupgradeneeded = () => {
      const bd = pedido.result;
      for (const nome of ["cache", "fila"] as const) {
        if (!bd.objectStoreNames.contains(nome)) bd.createObjectStore(nome);
      }
    };
    pedido.onsuccess = () => resolve(pedido.result);
    pedido.onerror = () => reject(pedido.error);
  });
}

function comoPromessa<T>(pedido: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    pedido.onsuccess = () => resolve(pedido.result);
    pedido.onerror = () => reject(pedido.error);
  });
}

export function armazemIndexedDb(): Armazem {
  let bd: Promise<IDBDatabase> | null = null;
  const loja = async (gaveta: Gaveta, modo: IDBTransactionMode) => {
    bd ??= abrir();
    return (await bd).transaction(gaveta, modo).objectStore(gaveta);
  };
  return {
    async ler<T>(gaveta: Gaveta, chave: string) {
      return (await comoPromessa((await loja(gaveta, "readonly")).get(chave))) as T | undefined;
    },
    async gravar<T>(gaveta: Gaveta, chave: string, valor: T) {
      await comoPromessa((await loja(gaveta, "readwrite")).put(valor, chave));
    },
    async apagar(gaveta: Gaveta, chave: string) {
      await comoPromessa((await loja(gaveta, "readwrite")).delete(chave));
    },
    async todos<T>(gaveta: Gaveta) {
      return (await comoPromessa((await loja(gaveta, "readonly")).getAll())) as T[];
    },
  };
}

/** IndexedDB se houver; memória se não. */
export function armazemPadrao(): Armazem {
  try {
    if (typeof indexedDB !== "undefined" && indexedDB) return armazemIndexedDb();
  } catch {
    /* sem IndexedDB */
  }
  return armazemEmMemoria();
}
