// 20/11 (auditoria de 19/11, lote 3): os separadores abertos durante um deploy. Um só tratamento para os ficheiros JS que o deploy novo
// removeu (antes havia um em main.tsx e outro no ErrorBoundary, «mantidos à mão»):
//  - recarrega sozinho UMA vez por sessão de erro (a marca em sessionStorage evita um ciclo de recargas), sempre a saltar a cache
//    (forceReload: o index.html em cache aponta para os ficheiros removidos e um reload normal falhava outra vez);
//  - a marca limpa-se quando a app fica bem montada durante um bocado, para poder voltar a recarregar sozinha num deploy seguinte;
//  - o aviso do Vite (vite:preloadError) é o sinal: antes de a app montar recarrega; com a app montada não se mexe no ecrã (pode haver
//    trabalho por gravar): mostra-se o aviso de versão nova e o erro segue (uma página que já não carrega cai no ErrorBoundary, que
//    recarrega pela mesma regra).
import { isModuleLoadError } from "@/lib/sentry/scrub";

export const MARCA_RECARREGOU = "olyvia-module-load-retried";
/** Quanto tempo a app tem de ficar montada para a marca se limpar (um chunk partido logo a seguir a montar não faz um ciclo). */
export const ESTAVEL_MS = 30_000;

let aRecarregar = false;

/** A navegação do browser (à parte, para os testes a trocarem: o jsdom não navega). */
export const navegacao = {
  substituir: (url: string) => window.location.replace(url),
  recarregar: () => window.location.reload(),
};

/** Recarrega a saltar a cache: um parâmetro que muda a cada tentativa torna o pedido do documento num endereço novo. */
export function forceReload(): void {
  aRecarregar = true;
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("v", Date.now().toString(36));
    navegacao.substituir(url.toString());
  } catch {
    navegacao.recarregar();
  }
}

/** Já se mandou recarregar (o que falhar entretanto não se mostra). */
export const estaARecarregar = (): boolean => aRecarregar;
/** Para os testes: como se a página tivesse acabado de abrir. */
export const reporRecarga = (): void => { aRecarregar = false; };

const jaRecarregou = (): boolean => { try { return !!sessionStorage.getItem(MARCA_RECARREGOU); } catch { return true; } };

/** Recarrega uma vez (a marca impede a segunda). true: vai recarregar; false: já se tinha tentado, quem chama mostra o erro. */
export function recarregarUmaVez(): boolean {
  if (aRecarregar) return true;
  if (jaRecarregou()) return false;
  try { sessionStorage.setItem(MARCA_RECARREGOU, "true"); } catch { return false; }
  forceReload();
  return true;
}

/** Depois de a app montar bem: passado ESTAVEL_MS, a marca sai (um deploy seguinte volta a recarregar sozinho). Devolve o cancelar. */
export function limparMarcaQuandoEstavel(ms = ESTAVEL_MS): () => void {
  const t = setTimeout(() => { try { sessionStorage.removeItem(MARCA_RECARREGOU); } catch { /* fica */ } }, ms);
  return () => clearTimeout(t);
}

export interface OpcoesDeploy {
  /** A app já montou? */
  montada: () => boolean;
  /** O aviso não destrutivo de versão nova (com a app montada). */
  aviso: () => void;
  /** Antes de montar, sem recarga possível: o ecrã de falha. */
  falhou: (erro: unknown) => void;
  /** Os outros erros por apanhar (Sentry). */
  outro?: (erro: unknown) => void;
}

/** Instala o tratamento global (vite:preloadError e as promessas rejeitadas). Devolve o desinstalar (para os testes). */
export function instalarTratamentoDeDeploy(o: OpcoesDeploy): () => void {
  const aoPreload = (e: Event) => {
    if (!o.montada()) {
      // a app ainda não montou: recarrega (e o erro não segue, a página vai-se)
      if (recarregarUmaVez()) e.preventDefault();
      return;
    }
    // montada: nada de recarregar por cima do trabalho; o aviso, e o erro segue para quem importou (o ErrorBoundary numa página)
    o.aviso();
  };
  const aoRejeitar = (event: PromiseRejectionEvent) => {
    if (!isModuleLoadError(event.reason)) { o.outro?.(event.reason); return; }
    if (o.montada()) { event.preventDefault(); o.aviso(); return; }
    if (recarregarUmaVez()) { event.preventDefault(); return; }
    o.falhou(event.reason);
  };
  window.addEventListener("vite:preloadError", aoPreload);
  window.addEventListener("unhandledrejection", aoRejeitar);
  return () => { window.removeEventListener("vite:preloadError", aoPreload); window.removeEventListener("unhandledrejection", aoRejeitar); };
}
