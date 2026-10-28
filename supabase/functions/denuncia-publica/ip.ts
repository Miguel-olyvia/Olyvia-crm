/**
 * O IP do pedido, so para limitar abusos (nunca se guarda em claro: ver `hmacIp`).
 *
 * `_shared/clientIp.ts` toma o PRIMEIRO valor de x-forwarded-for, que o cliente controla
 * (basta rodar o cabecalho para fugir ao limite). Aqui:
 *  1. `cf-connecting-ip`, que o proxy da frente define e sobrepoe, quando existe;
 *  2. senao, a entrada de x-forwarded-for que a PLATAFORMA acrescentou: a ultima, menos os
 *     `saltosConfiaveis` proxies conhecidos a frente (por omissao 0).
 * `x-real-ip` ignora-se (tambem se forja). Sem IP valido devolve `null`, nunca "unknown".
 *
 * ANTES DE PUBLICAR: confirmar na nike, com um pedido real com x-forwarded-for forjado, qual
 * e a entrada que a plataforma acrescenta e ajustar `DENUNCIAS_XFF_SALTOS` se preciso.
 */

const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6 = /^[0-9a-fA-F:]+$/;

function normalizar(bruto: string): string {
  const valor = bruto.trim();
  const entreParentesis = valor.match(/^\[([^\]]+)\](?::\d+)?$/);
  if (entreParentesis) return entreParentesis[1];
  // Exactamente um ":" => host:porta (IPv4); IPv6 tem varios.
  if (valor.split(":").length === 2) return valor.split(":")[0];
  return valor;
}

function pareceIp(valor: string): boolean {
  if (IPV4.test(valor)) return valor.split(".").every((o) => Number(o) <= 255);
  return valor.includes(":") && IPV6.test(valor);
}

export function ipDoPedido(req: Request, saltosConfiaveis = 0): string | null {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) {
    const v = normalizar(cf);
    if (pareceIp(v)) return v;
  }
  const xff = req.headers.get("x-forwarded-for");
  if (!xff) return null;
  const entradas = xff.split(",");
  const indice = entradas.length - 1 - Math.max(0, saltosConfiaveis);
  if (indice < 0) return null;
  const v = normalizar(entradas[indice]);
  return pareceIp(v) ? v : null;
}
