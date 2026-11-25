/**
 * 24/11 (testarh com os contratos reais da Mudelar: nomes, emails e telefones verdadeiros dos clientes). Num ambiente de teste
 * com dados reais, nenhum email nem SMS pode chegar às pessoas. A variável ENVIOS_SO_PARA (segredo das Edge Functions) diz para
 * quem se pode enviar; tudo o resto fica bloqueado. Sem a variável (produção) nada muda: envia-se como sempre.
 *
 * Cada entrada, separada por vírgulas:
 *   - um email exato:              ruben@exemplo.pt
 *   - um email com *:              ruben+*@gmail.com   (o * vale qualquer texto, sem @)
 *   - um domínio inteiro:          @mudelar.pt
 *   - um telefone (só algarismos): +351 929 220 322    (compara os 9 últimos algarismos)
 *
 * Sem Deno: a lista entra por parâmetro (testável em vitest).
 */

export type ListaEnvios = string[] | null;

/** A lista de ENVIOS_SO_PARA; null quando a variável não existe ou está vazia (sem bloqueio). */
export function lerListaEnvios(valor: string | null | undefined): ListaEnvios {
  if (typeof valor !== "string") return null;
  const itens = valor.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  return itens.length ? itens : null;
}

const soAlgarismos = (s: string) => s.replace(/\D/g, "");
const fimDoTelefone = (s: string) => soAlgarismos(s).slice(-9);
const escapar = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");

/** O email pode receber? Com a lista vazia (null) pode sempre. */
export function emailPermitido(email: string, lista: ListaEnvios): boolean {
  if (!lista) return true;
  const e = email.trim().toLowerCase();
  if (!e.includes("@")) return false;
  return lista.some((item) => {
    if (!item.includes("@")) return false;
    if (item.startsWith("@")) return e.endsWith(item);
    if (item.includes("*")) return new RegExp("^" + item.split("*").map(escapar).join("[^@]*") + "$").test(e);
    return e === item;
  });
}

/** O telefone pode receber SMS? Com a lista vazia (null) pode sempre. */
export function telefonePermitido(telefone: string, lista: ListaEnvios): boolean {
  if (!lista) return true;
  const fim = fimDoTelefone(telefone);
  if (fim.length < 9) return false;
  return lista.some((item) => !item.includes("@") && soAlgarismos(item).length >= 9 && fimDoTelefone(item) === fim);
}

/** Separa os destinatários de um email: os que podem receber e os bloqueados. */
export function separarDestinatarios(destinos: string | string[] | undefined, lista: ListaEnvios): { permitidos: string[]; bloqueados: string[] } {
  const todos = (Array.isArray(destinos) ? destinos : typeof destinos === "string" ? destinos.split(",") : []).map((x) => x.trim()).filter(Boolean);
  const permitidos = todos.filter((d) => emailPermitido(d, lista));
  return { permitidos, bloqueados: todos.filter((d) => !permitidos.includes(d)) };
}

export const MENSAGEM_BLOQUEIO =
  "Envio bloqueado neste ambiente de teste: só se envia para a lista ENVIOS_SO_PARA, para os dados reais não chegarem às pessoas.";
