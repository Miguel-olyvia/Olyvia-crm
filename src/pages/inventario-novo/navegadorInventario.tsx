// O navegador do novo Inventário: dentro da moldura, as ligações dos ecrãs clássicos (Link, useNavigate,
// navigate("/purchase-orders?open=…"), setSearchParams) abrem o separador certo em vez de saírem para a rota clássica.
//
// · paraSeparador(caminho): função pura. Um caminho clássico do Inventário (INVENTORY_PATHS: /inventory, /purchase-orders,
//   /suppliers, /client-orders, /stock-counts, /receiving, /stocks, /stock-movements, /warehouses) passa a
//   /inventory/novo/<aba>, com o mesmo ?search e #hash. Tudo o resto (outras rotas, caminhos relativos, URLs absolutos,
//   o próprio /inventory/novo/…) fica igual.
// · <NavegadorDoInventario>: volta a fornecer o UNSAFE_NavigationContext do react-router (6.30) com um navigator que passa
//   push, replace, createHref e encodeLocation por paraSeparador. O react-router chama push/replace sem `this`
//   (useNavigate: `(replace ? navigator.replace : navigator.push)(path, …)`), por isso são funções soltas.
import { useContext, useMemo, type ReactNode } from "react";
import { UNSAFE_NavigationContext, type Navigator, type To } from "react-router-dom";
import { SEPARADORES, caminhoSeparador, type ChaveSeparador } from "./separadores";

const POR_CAMINHO: ReadonlyMap<string, ChaveSeparador> = new Map(SEPARADORES.map((s) => [s.path, s.chave]));

/** "/stocks/" → "/stocks" (a barra final não muda a rota). */
const semBarraFinal = (p: string) => (p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p);

/** O separador de um pathname clássico do Inventário (exato, sem subcaminhos); null nos outros. */
export function separadorDoCaminho(pathname: string): ChaveSeparador | null {
  return POR_CAMINHO.get(semBarraFinal(pathname)) ?? null;
}

/**
 * Traduz um caminho clássico do Inventário para o separador no novo Inventário, mantendo o search e o hash.
 * Ex.: "/purchase-orders?open=x#y" → "/inventory/novo/encomendas?open=x#y"; "/proposals?open=x" fica igual.
 */
export function paraSeparador(caminho: string): string {
  if (!caminho.startsWith("/")) return caminho;
  const corte = caminho.search(/[?#]/);
  const pathname = corte === -1 ? caminho : caminho.slice(0, corte);
  const resto = corte === -1 ? "" : caminho.slice(corte);
  const chave = separadorDoCaminho(pathname);
  return chave ? caminhoSeparador(chave) + resto : caminho;
}

/** O mesmo para o `To` do react-router (string ou { pathname, search, hash }). */
export function traduzirTo(to: To): To {
  if (typeof to === "string") return paraSeparador(to);
  if (!to.pathname) return to;
  const chave = separadorDoCaminho(to.pathname);
  return chave ? { ...to, pathname: caminhoSeparador(chave) } : to;
}

/** Um navigator que traduz os destinos e delega no do router. */
export function navegadorTradutor(base: Navigator): Navigator {
  const nav: Navigator = {
    createHref: (to) => base.createHref(traduzirTo(to)),
    go: (delta) => base.go(delta),
    push: (to, state, opts) => base.push(traduzirTo(to), state, opts),
    replace: (to, state, opts) => base.replace(traduzirTo(to), state, opts),
  };
  if (base.encodeLocation) {
    const encode = base.encodeLocation;
    nav.encodeLocation = (to) => encode(traduzirTo(to));
  }
  return nav;
}

/** Envolve o separador ativo: Link, useNavigate e setSearchParams dos ecrãs clássicos ficam dentro do novo Inventário. */
export function NavegadorDoInventario({ children }: { children: ReactNode }) {
  const ctx = useContext(UNSAFE_NavigationContext);
  const valor = useMemo(() => ({ ...ctx, navigator: navegadorTradutor(ctx.navigator) }), [ctx]);
  return <UNSAFE_NavigationContext.Provider value={valor}>{children}</UNSAFE_NavigationContext.Provider>;
}
