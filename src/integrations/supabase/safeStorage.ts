// Adaptador de armazenamento tolerante para o cliente Supabase.
//
// PORQUÊ: o cliente auth do Supabase escreve/lê o token de sessão em
// `window.localStorage`. Em contextos onde o browser BLOQUEIA o armazenamento
// — o formulário público embebido num iframe de terceiros (mudelar.pt) com a
// proteção de rastreio do Firefox/Safari, ou um utilizador com cookies/storage
// desativados — o simples acesso a `localStorage` (ou a cada `getItem`/
// `setItem`/`removeItem`) lança `SecurityError: The operation is insecure`, o
// que rebentava o arranque do form.
//
// SOLUÇÃO: envolver cada operação em try/catch e, quando o `localStorage` não
// está acessível, cair para um armazenamento EM MEMÓRIA (por carregamento de
// página). A sessão deixa de persistir entre reloads nesse contexto — o que é
// aceitável (o form público nem precisa de sessão; um utilizador com storage
// bloqueado degrada em vez de ver um ecrã de erro) — mas NUNCA lança.
//
// Nota: até o próprio acesso ao getter `window.localStorage` pode lançar em
// alguns browsers, por isso ele também é feito dentro de try/catch.

export interface SafeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Devolve `window.localStorage` ou `null` se o acesso lançar/estiver indisponível. */
function getLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage ?? null;
  } catch {
    // Firefox lança SecurityError logo no acesso ao getter quando o storage
    // está bloqueado (iframe de terceiros, cookies desativados).
    return null;
  }
}

export function createSafeStorage(): SafeStorage {
  const memory = new Map<string, string>();

  return {
    getItem(key: string): string | null {
      try {
        const ls = getLocalStorage();
        if (ls) return ls.getItem(key);
      } catch {
        // storage bloqueado a meio — usa a memória
      }
      return memory.has(key) ? memory.get(key)! : null;
    },

    setItem(key: string, value: string): void {
      try {
        const ls = getLocalStorage();
        if (ls) {
          ls.setItem(key, value);
          return;
        }
      } catch {
        // storage bloqueado ou sem quota (ex.: Safari privado) — usa a memória
      }
      memory.set(key, value);
    },

    removeItem(key: string): void {
      try {
        const ls = getLocalStorage();
        if (ls) {
          ls.removeItem(key);
          return;
        }
      } catch {
        // storage bloqueado — usa a memória
      }
      memory.delete(key);
    },
  };
}
