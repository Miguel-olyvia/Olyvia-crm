/**
 * A conta bancaria da pessoa: o que o ecra pode validar antes de submeter.
 *
 * O QUE ESTE FICHEIRO NAO FAZ
 * ---------------------------
 * Nao guarda o numero da conta em lado nenhum. O numero vai para o Vault pela
 * RPC `rpc_hr_definir_conta` e a aplicacao nunca o volta a ver: da linha
 * gravada le-se o formato, os ultimos quatro caracteres e -- so no caso do
 * IBAN -- o pais. Aqui apenas se antecipa a validacao que a RPC faz, para nao
 * mandar ao servidor o que ele vai recusar.
 *
 * A validacao e A MESMA DA RPC, de proposito, e por ramos:
 *   - `iban`: formato ISO 13616 e mod-97, como `hr_iban_valido` (20261120070000);
 *   - todos os outros: alfanumerico maiusculo, 4 a 34 caracteres.
 * O ramo do IBAN nao foi enfraquecido para acomodar os outros formatos; os
 * outros ganharam um ramo proprio. E se as duas validacoes divergirem, quem
 * manda e a base -- esta e uma conveniencia, nao a garantia.
 */
import type { FormatoConta } from "@/types/hr";

/** Maiusculas e sem espacos, como a RPC normaliza antes de validar. */
export function normalizarConta(valor: string): string {
  return valor.replace(/\s+/g, "").toUpperCase();
}

const FORMATO_IBAN = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/;
const FORMATO_CONTA_LOCAL = /^[0-9A-Z]{4,34}$/;

/**
 * IBAN valido: formato ISO 13616 mais o resto 97 do mod-97.
 *
 * O mod-97 e feito por blocos de sete digitos pela mesma razao que na base: o
 * numero inteiro de um IBAN nao cabe num inteiro de 64 bits, e em JavaScript
 * perderia precisao muito antes disso.
 */
export function ibanValido(valor: string): boolean {
  const iban = normalizarConta(valor);
  if (!FORMATO_IBAN.test(iban)) return false;

  const rearranjo = iban.slice(4) + iban.slice(0, 4);
  let digitos = "";
  for (const caracter of rearranjo) {
    digitos += caracter >= "0" && caracter <= "9"
      ? caracter
      : String(caracter.charCodeAt(0) - 55);
  }

  let resto = 0;
  for (let i = 0; i < digitos.length; i += 7) {
    resto = Number(String(resto) + digitos.slice(i, i + 7)) % 97;
  }
  return resto === 1;
}

/** O valor serve para o formato escolhido? Vazio nao e invalido -- e ausencia. */
export function contaValida(formato: FormatoConta, valor: string): boolean {
  const conta = normalizarConta(valor);
  if (conta === "") return true;
  if (formato === "iban") return ibanValido(conta);
  return FORMATO_CONTA_LOCAL.test(conta);
}

/**
 * A mascara que se mostra na ficha.
 *
 * So o IBAN tem pais no numero, e so nesse caso se mostra o prefixo do pais --
 * nos outros formatos nao ha pais nenhum guardado (a base obriga a NULL).
 */
export function mascaraDaConta(
  formato: FormatoConta,
  ultimos4: string | null,
  pais: string | null,
): string | null {
  if (!ultimos4) return null;
  if (formato === "iban") {
    return `${pais ?? "??"}•• •••• •••• •••• ${ultimos4}`;
  }
  return `•••• ${ultimos4}`;
}

/**
 * A chave de traducao do rotulo do campo do numero, pelo formato escolhido.
 *
 * O rotulo acompanha o formato -- quem escolheu CLABE nao devia estar a ler
 * "IBAN" em cima do campo. Vive aqui, e nao em cada ecra, para os dois sitios
 * que pedem uma conta (o assistente e a ficha) dizerem a mesma coisa.
 */
export function chaveDoRotuloDaConta(formato: FormatoConta): string {
  if (formato === "iban") return "hr.campos.iban";
  if (formato === "clabe") return "hr.campos.clabe";
  return "hr.campos.numeroConta";
}

/**
 * O comprimento minimo aceitavel, para o botao de gravar nao estar activo
 * sobre um valor que a RPC vai recusar.
 *
 * 15 para o IBAN (o mais curto do mundo, o noruegues, tem 15); 4 para os
 * outros -- que e tambem o minimo da propria mascara: com menos, os "ultimos
 * quatro" seriam o numero inteiro.
 */
export function minimoDaConta(formato: FormatoConta): number {
  return formato === "iban" ? 15 : 4;
}
