// Os códigos de denúncias anónimas que a pessoa escolheu guardar nesta sessão, em «As minhas denúncias». Só os CÓDIGOS,
// nunca os PIN, e só em memória: recarregar a página esquece-os. Guardar um código não liga a denúncia à pessoa: a
// denúncia anónima continua sem ninguém por trás, e sem o PIN o código sozinho não abre nada.
import { useSyncExternalStore } from "react";

let codigos: readonly string[] = [];
const ouvintes = new Set<() => void>();

const lerCodigos = (): readonly string[] => codigos;

function subscrever(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

export const useCodigosGuardados = (): readonly string[] => useSyncExternalStore(subscrever, lerCodigos, lerCodigos);

export function guardarCodigo(codigo: string): void {
  if (codigos.includes(codigo)) return;
  codigos = [...codigos, codigo];
  ouvintes.forEach((o) => o());
}

export function esquecerCodigos(): void {
  codigos = [];
  ouvintes.forEach((o) => o());
}
