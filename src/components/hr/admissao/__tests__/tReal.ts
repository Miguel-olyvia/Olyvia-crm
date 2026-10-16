/**
 * `t` dos testes do pipeline e da revisao: devolve o texto PORTUGUES REAL (de `translations.pt`), com os parametros
 * trocados como o `useTranslation` faz. Assim um teste que procura «Pipeline de admissões» falha tambem se a chave
 * faltar ou estiver sem acentos, e nao so se o codigo mudar. Uma chave em falta devolve a propria chave (como na app).
 */
import { translations } from "@/translations/index";

const PT = translations.pt as unknown as Record<string, string>;
const EN = translations.en as unknown as Record<string, string>;

function traduzir(tabela: Record<string, string>, chave: string, params?: Record<string, string | number>): string {
  // Sem cair para o ingles: um texto portugues em falta tem de se ver como a chave, nao escondido por outra lingua.
  let texto = tabela[chave] ?? chave;
  for (const [nome, valor] of Object.entries(params ?? {})) {
    texto = texto.replace(new RegExp(`\\{\\{${nome}\\}\\}`, "g"), String(valor));
    texto = texto.replace(new RegExp(`\\{${nome}\\}`, "g"), String(valor));
  }
  return texto;
}

export const tPt = (chave: string, params?: Record<string, string | number>): string => traduzir(PT, chave, params);
export const tEn = (chave: string, params?: Record<string, string | number>): string => traduzir(EN, chave, params);
