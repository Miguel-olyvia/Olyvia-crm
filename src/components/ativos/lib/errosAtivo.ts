/**
 * O que a base responde de errado, em três tipos que o ecrã trata de forma diferente (cliente TOLERANTE):
 *  - `indisponivel`: a RPC ainda não existe (PGRST202 / 42883): a migration não foi aplicada; não é um defeito, o ecrã diz «ainda não disponível».
 *  - `recusado`: falta a permissão (42501, PGRST301, 401, 403): não é um defeito, o ecrã diz «sem acesso».
 *  - um código `ATVnn` (a base responde `P0001` com a mensagem `ATV05`...): uma regra do registo, com texto próprio.
 * O ecrã nunca recebe o texto em bruto da base.
 */

export const CODIGOS_ATV = [
  "ATV02", "ATV03", "ATV04", "ATV05", "ATV06", "ATV07", "ATV08", "ATV09", "ATV10",
  "ATV11", "ATV12", "ATV13", "ATV14", "ATV15", "ATV16", "ATV17", "ATV18",
] as const;
export type CodigoAtv = (typeof CODIGOS_ATV)[number];

type ErroBase = { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
const comoErro = (e: unknown): ErroBase => (e && typeof e === "object" ? (e as ErroBase) : {});

/** A RPC não existe na base (migration por aplicar): não é um defeito. */
export function ativosIndisponivel(erro: unknown): boolean {
  const { code, message } = comoErro(erro);
  if (code === "PGRST202" || code === "42883") return true;
  return typeof message === "string" && /could not find the function|function .* does not exist/i.test(message);
}

/** A base recusou por permissão: não é um defeito, é a resposta certa para quem não pode. */
export function ativosRecusado(erro: unknown): boolean {
  const { code, message } = comoErro(erro);
  if (typeof code === "string" && ["42501", "PGRST301", "401", "403"].includes(code)) return true;
  return typeof message === "string" && /permission denied|insufficient_privilege/i.test(message);
}

/** O código `ATVnn` de uma recusa de regra, ou `null`. Só se aceitam os que o desenho define. */
export function codigoAtv(erro: unknown): CodigoAtv | null {
  const { message, details } = comoErro(erro);
  for (const texto of [message, details]) {
    const achado = typeof texto === "string" ? /\bATV\d{2}\b/.exec(texto)?.[0] : undefined;
    if (achado && (CODIGOS_ATV as readonly string[]).includes(achado)) return achado as CodigoAtv;
  }
  return null;
}

/** O campo do formulário a que cada erro se refere (os outros mostram-se no resumo). */
export type CampoAtivo =
  | "nome" | "tipo" | "modelo" | "data" | "valorCompra" | "residual" | "vida" | "manutencao" | "codigo" | "centroCusto";

const CAMPO_DO_CODIGO: Partial<Record<CodigoAtv, CampoAtivo>> = {
  ATV03: "nome", ATV04: "tipo", ATV05: "modelo", ATV06: "modelo", ATV07: "data", ATV08: "valorCompra",
  ATV09: "residual", ATV10: "vida", ATV11: "manutencao", ATV12: "codigo", ATV13: "centroCusto",
};

export const campoDoCodigo = (codigo: string | null): CampoAtivo | null => (codigo ? CAMPO_DO_CODIGO[codigo as CodigoAtv] ?? null : null);

/** A chave do texto de um erro da base. */
export function chaveDoErro(erro: unknown): string {
  const codigo = codigoAtv(erro);
  if (codigo) return `ativos.erro.${codigo}`;
  if (ativosRecusado(erro)) return "ativos.erro.semPermissao";
  if (ativosIndisponivel(erro)) return "ativos.erro.indisponivel";
  return "ativos.erro.generico";
}
