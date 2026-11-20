// Qual versão de idioma se mostra, quando um documento tem várias e o ecrã mostra UMA de cada vez (o portal do
// cliente). Ordem: a escolha do cliente (se o documento a tem), o idioma da interface (se o documento o tem), o
// primeiro idioma do documento. Nunca devolve vazio.

import { IDIOMA_BASE, normalizarCodigo } from "./registo";

export interface EntradaIdiomaVisivel {
  /** Os idiomas do documento, pela ordem das versões. */
  disponiveis: readonly string[];
  /** O que o cliente escolheu no seletor; ainda nada = vazio. */
  escolhido?: string | null;
  /** O idioma da interface (o botão PT | EN do portal). */
  idiomaDaInterface?: string | null;
}

export function idiomaVisivelDoDocumento({ disponiveis, escolhido, idiomaDaInterface }: EntradaIdiomaVisivel): string {
  const codigos: string[] = [];
  for (const c of disponiveis) {
    const codigo = normalizarCodigo(c);
    if (codigo && !codigos.includes(codigo)) codigos.push(codigo);
  }
  for (const candidato of [escolhido, idiomaDaInterface]) {
    const codigo = normalizarCodigo(candidato);
    if (codigo && codigos.includes(codigo)) return codigo;
  }
  return codigos[0] ?? IDIOMA_BASE;
}
