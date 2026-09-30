/**
 * As etiquetas que se colam nos equipamentos.
 *
 * ⚠ NÃO HÁ LEITOR DE CÓDIGOS DENTRO DA APLICAÇÃO, E É DE PROPÓSITO
 *
 * A câmara de qualquer telemóvel — Android ou iPhone — já lê um QR code e
 * abre o endereço que ele carrega. Um leitor nosso precisaria da API
 * `BarcodeDetector`, que existe no Chrome de Android e **não** existe em boa
 * parte dos iPhones: metade da equipa ficava de fora.
 *
 * Por isso a etiqueta carrega um endereço normal. O técnico aponta a câmara,
 * carrega na notificação que aparece, e a ficha do equipamento abre. Zero
 * código nosso no caminho, e funciona em todos os telemóveis.
 *
 * O Infraspeak usa NFC. Uma etiqueta NFC custa dinheiro por unidade e precisa
 * de telemóvel com NFC ligado; um QR imprime-se numa folha de autocolantes.
 */

/**
 * O endereço que a etiqueta carrega.
 *
 * Leva o **código** e não o id: o código é único por organização, é o que se
 * diz ao telefone, e é o que uma pessoa consegue escrever à mão se a etiqueta
 * se rasgar. Um uuid numa etiqueta rasgada não serve para nada.
 */
export function enderecoDaEtiqueta(origem: string, base: string, codigo: string): string {
  const raiz = `${origem.replace(/\/+$/, "")}${base.replace(/\/+$/, "")}`;
  return `${raiz}/ativos/${encodeURIComponent(codigo)}`;
}

/**
 * Se este endereço serve para imprimir.
 *
 * Uma etiqueta impressa a partir do computador de quem desenvolve fica com um
 * QR que aponta para `localhost` — e no telemóvel do técnico não abre nada.
 * É um erro caro: descobre-se depois de colar trezentos autocolantes.
 */
export function serveParaImprimir(origem: string): boolean {
  // O fim do nome tem de ser mesmo o fim: `localhost-teste.pt` é um domínio
  // a sério, e sem esta âncora era tratado como a máquina de quem programa.
  return !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(origem);
}

/** Quantas etiquetas cabem numa folha A4, na grelha que usamos. */
export const POR_FOLHA = 24;
