import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

if (!url || !anonKey) {
  // Falha cedo e clara se o .env não estiver preenchido.
  // eslint-disable-next-line no-console
  console.error(
    "[Operações] VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY em falta. Verifica o operacao-app/.env"
  );
}

// Flag "Manter sessão iniciada": quando "1", a sessão vive em localStorage
// (sobrevive a fechar o browser); caso contrário em sessionStorage (limpa ao
// fechar a aba). Controlada pelo toggle do ecrã de entrada.
const REMEMBER_KEY = "operacao-app-remember";
const AUTH_KEY = "operacao-app-auth";

/** Liga/desliga a persistência da sessão entre reinícios do browser. */
export function setRememberSession(remember: boolean): void {
  try {
    localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0");
    // Migra a sessão JÁ existente para o storage certo, senão fica órfã
    // (gravada num storage e lida noutro) ao alternar o toggle depois de entrar.
    const from = remember ? sessionStorage : localStorage;
    const to = remember ? localStorage : sessionStorage;
    const val = from.getItem(AUTH_KEY);
    if (val !== null) {
      to.setItem(AUTH_KEY, val);
      from.removeItem(AUTH_KEY);
    }
  } catch {
    // storage indisponível (modo privado restrito) — ignora
  }
}

/** Estado atual do "manter sessão" (default: ligado). */
export function getRememberSession(): boolean {
  try {
    return localStorage.getItem(REMEMBER_KEY) !== "0";
  } catch {
    return true;
  }
}

// Storage híbrido: escreve no alvo escolhido pela flag e lê de ambos, para a
// sessão ser encontrada onde quer que tenha ficado guardada.
const hybridStorage = {
  getItem: (key: string): string | null => {
    try {
      return localStorage.getItem(key) ?? sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    const remember = getRememberSession();
    const target = remember ? localStorage : sessionStorage;
    const other = remember ? sessionStorage : localStorage;
    try {
      other.removeItem(key);
    } catch {
      /* ignora */
    }
    try {
      target.setItem(key, value);
    } catch {
      /* ignora */
    }
  },
  removeItem: (key: string): void => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignora */
    }
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* ignora */
    }
  },
};

// Cliente Supabase próprio de Operações. Usa uma storage key própria para NÃO
// colidir com a sessão da app Olyvia nem com a do DUC, que correm na mesma
// origem. Mesma decisão que o duc-app tomou, pela mesma razão.
export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: AUTH_KEY,
    storage: hybridStorage,
  },
});
