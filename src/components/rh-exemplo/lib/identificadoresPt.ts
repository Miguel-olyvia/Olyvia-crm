/**
 * Digito de controlo do NIF e do NISS portugueses -- o UNICO modulo do
 * codigo da aplicacao para isto (PessoaPessoaisTab, novaPessoa e
 * conviteAdmissaoEcra importam daqui).
 *
 * So se verifica o DIGITO DE CONTROLO, nunca o prefixo: os prefixos mudam com
 * o tempo e nao se adivinham. E o ESPELHO de public.hr_nif_valido(text) e
 * public.hr_niss_valido(text) (migration 20261210010000): a base e a
 * autoridade (um trigger recusa o numero invalido em qualquer escrita); isto
 * existe para a pessoa ver o erro antes de submeter.
 *
 * AMARRA: `identificadoresPt.test.ts` le o bloco de conferir da migration e
 * exige que os vectores sejam os mesmos que os deste modulo.
 *
 * ESPACOS: ao contrario da base (que so aceita digitos), aqui tolera-se o
 * que a pessoa escreve a mao ("123 456 789"): remove-se o espaco antes de
 * validar. Quem GRAVA tem de gravar o valor ja sem espacos (ver
 * `novaPessoa.ts`), senao a base recusa o que o ecra aceitou.
 */

const PESOS_NISS = [29, 23, 19, 17, 13, 11, 7, 5, 3, 2] as const;

function semEspacos(valor: string): string {
  return valor.replace(/\s+/g, "");
}

/** NIF: 9 algarismos; soma dos oito primeiros x pesos 9..2; controlo = 11 - (soma mod 11), 0 se resto < 2. Vazio ou ausente: false. */
export function nifValido(nif: string | null | undefined): boolean {
  if (typeof nif !== "string") return false;
  const digitos = semEspacos(nif);
  if (!/^[0-9]{9}$/.test(digitos)) return false;
  let soma = 0;
  for (let i = 0; i < 8; i += 1) soma += Number(digitos[i]) * (9 - i);
  const resto = soma % 11;
  const controlo = resto < 2 ? 0 : 11 - resto;
  return controlo === Number(digitos[8]);
}

/** NISS: 11 algarismos, primeiro 1 ou 2; controlo = 9 - (soma ponderada mod 10). Vazio ou ausente: false. */
export function nissValido(niss: string | null | undefined): boolean {
  if (typeof niss !== "string") return false;
  const digitos = semEspacos(niss);
  if (!/^[12][0-9]{10}$/.test(digitos)) return false;
  let soma = 0;
  for (let i = 0; i < 10; i += 1) soma += Number(digitos[i]) * PESOS_NISS[i];
  return 9 - (soma % 10) === Number(digitos[10]);
}
