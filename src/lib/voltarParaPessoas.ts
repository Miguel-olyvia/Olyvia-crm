// O regresso à ficha da pessoa. Os ecrãs partilhados (orçamentos, propostas e contratos) recebem um `?voltar=` com o endereço a que se regressa
// depois de um passo do processo. É um sítio clássico de redirecionamento aberto, por isso SÓ se aceitam caminhos desta aplicação que
// começam por /pessoas (a própria página, com ou sem query): tudo o resto (sítios externos, `//`, barras do Windows, outras páginas,
// caracteres de controlo, valores enormes) é recusado e o ecrã não mostra nenhuma ligação.

const MAX_COMPRIMENTO = 1000;
/** Espaços, caracteres de controlo e barras do Windows nunca aparecem num caminho que aceitamos. */
const PROIBIDOS = /[\u0000-\u001f\u007f\\\s]/;

/** O caminho a que se regressa, se for seguro; senão `null`. */
export function caminhoVoltarSeguro(valor: string | null | undefined): string | null {
  if (typeof valor !== "string" || valor.length === 0 || valor.length > MAX_COMPRIMENTO) return null;
  if (PROIBIDOS.test(valor)) return null;
  return valor === "/pessoas" || valor.startsWith("/pessoas?") ? valor : null;
}

/** O caminho com o parâmetro acrescentado (ou substituído, na mesma posição, se já lá estava). */
export function comParametro(caminho: string, chave: string, valor: string): string {
  const corte = caminho.indexOf("?");
  const base = corte === -1 ? caminho : caminho.slice(0, corte);
  const query = new URLSearchParams(corte === -1 ? "" : caminho.slice(corte + 1));
  query.set(chave, valor);
  return `${base}?${query.toString()}`;
}

/** O endereço da ficha de uma pessoa, já com um dos negócios dela aberto. */
export const enderecoDeRegresso = (pessoaId: string, negocioId: string): string =>
  `/pessoas?open=${encodeURIComponent(pessoaId)}&negocio=${encodeURIComponent(negocioId)}`;

/** Uma ligação a um ecrã partilhado que sabe voltar à ficha: `destino` mais `?voltar=<regresso>` (codificado). */
export const ligacaoComVoltar = (destino: string, regresso: string): string =>
  `${destino}${destino.includes("?") ? "&" : "?"}voltar=${encodeURIComponent(regresso)}`;
