// O nome de um idioma para usar dentro de uma frase: «texto em inglês» (pt), «text in English» (en).
// Nas listas e escolhas usa-se o nome nativo do registo (Português, English, Español…); aqui, o nome
// da língua da interface, com a capitalização própria dessa língua.

import { obterIdioma } from "@/lib/idiomaDocumento";

type Traduzir = (chave: string) => string;

export function nomeNaFrase(t: Traduzir, codigo: string): string {
  const chave = `proposalTemplateEditor.versions.lang.${codigo}`;
  const nome = t(chave);
  return nome === chave ? (obterIdioma(codigo)?.nomeNativo ?? codigo) : nome;
}
