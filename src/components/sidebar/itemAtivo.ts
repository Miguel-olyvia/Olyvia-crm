/**
 * Quando é que uma entrada do menu lateral aparece realçada. Antes era só o caminho (igual, ou a começar por ele);
 * agora também o parâmetro do endereço (`to` pode trazer `?chave=valor`), para duas entradas do mesmo caminho se distinguirem.
 */
export interface ItemAtivavel {
  to: string;
  /** Só o caminho exato conta: `/a` não realça com `/a/b` (um ecrã filho com entrada própria ou sem entrada). */
  exact?: boolean;
}

/** Todos os parâmetros de `consulta` estão em `search` com o mesmo valor. */
function contem(search: string, consulta: string): boolean {
  const presentes = new URLSearchParams(search);
  for (const [chave, valor] of new URLSearchParams(consulta)) {
    if (presentes.get(chave) !== valor) return false;
  }
  return true;
}

export function itemAtivo(item: ItemAtivavel, pathname: string, search = ""): boolean {
  const [caminho, consulta = ""] = item.to.split("?");
  const noCaminho = pathname === caminho || (!item.exact && pathname.startsWith(`${caminho}/`));
  if (!noCaminho) return false;
  if (consulta && !contem(search, consulta)) return false;
  return true;
}
