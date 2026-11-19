// Mensagens que ficam em estado (erros de OTP, de ficheiro, de validação): guarda-se a CHAVE e traduz-se ao
// mostrar, com o idioma de então. Assim, mudar de idioma com a mensagem visível muda também a mensagem.
// O que vem do servidor guarda-se como texto e fica como vem.
import { traduzir } from "./traduzir";
import type { ParamsDeTraducao, PortalIdioma } from "./tipos";

export type MensagemDoPortal =
  | { readonly chave: string; readonly params?: ParamsDeTraducao }
  | { readonly texto: string }
  | { readonly de: (idioma: PortalIdioma) => string };

export const mensagemDeChave = (chave: string, params?: ParamsDeTraducao): MensagemDoPortal => ({ chave, params });
export const mensagemDeTexto = (texto: string): MensagemDoPortal => ({ texto });

export function resolverMensagem(mensagem: MensagemDoPortal | null | undefined, idioma: PortalIdioma): string {
  if (!mensagem) return "";
  if ("texto" in mensagem) return mensagem.texto;
  if ("de" in mensagem) return mensagem.de(idioma);
  return traduzir(idioma, mensagem.chave, mensagem.params);
}

/**
 * Para sítios que só guardam `string` (por exemplo os erros por campo de um formulário): a mensagem de chave
 * escreve-se como texto com marca, e `resolverMensagemMarcada` traduz-a ao mostrar. Um texto sem marca
 * (do servidor) volta como veio.
 */
const MARCA = "\u0001msg:";

export function marcarMensagem(chave: string, params?: ParamsDeTraducao): string {
  return MARCA + JSON.stringify({ chave, params });
}

export function resolverMensagemMarcada(texto: string | null | undefined, idioma: PortalIdioma): string {
  if (!texto) return "";
  if (!texto.startsWith(MARCA)) return texto;
  try {
    const { chave, params } = JSON.parse(texto.slice(MARCA.length)) as { chave: string; params?: ParamsDeTraducao };
    return traduzir(idioma, chave, params);
  } catch {
    return texto;
  }
}
