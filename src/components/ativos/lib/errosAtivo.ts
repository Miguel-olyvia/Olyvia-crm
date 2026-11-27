/**
 * O que a base responde de errado, em três tipos que o ecrã trata de forma diferente (cliente TOLERANTE):
 *  - `indisponivel`: a RPC ainda não existe (PGRST202 / 42883): a migration não foi aplicada; não é um defeito, o ecrã diz «ainda não disponível».
 *  - `recusado`: falta a permissão (42501, PGRST301, 401, 403): não é um defeito, o ecrã diz «sem acesso».
 *  - um código `ATVnn` (a base responde `P0001` com a mensagem `ATV05`, e o motivo em pt-PT no DETAIL): uma regra do registo.
 * O ecrã nunca recebe o texto em bruto da base: ou o texto próprio do código, ou o DETAIL pt-PT dos códigos genéricos (ATV03, ATV16, ATV18).
 */

export const CODIGOS_ATV = [
  "ATV02", "ATV03", "ATV04", "ATV05", "ATV06", "ATV07", "ATV08", "ATV09", "ATV10",
  "ATV11", "ATV12", "ATV13", "ATV14", "ATV15", "ATV16", "ATV17", "ATV18",
  // Fase A1: comprado/alugado, armazém, equipamento do RH como ativo, correção com ativos.edit.
  "ATV19", "ATV20", "ATV21", "ATV22", "ATV23", "ATV24", "ATV25", "ATV26", "ATV27", "ATV28",
  "ATV29", "ATV30", "ATV31", "ATV32", "ATV33",
  // Fase 1: ATV34 prefixo do código, ATV35 horizonte do «por devolver», ATV36 e ATV37 do termo de entrega ou devolução.
  "ATV34", "ATV35", "ATV36", "ATV37",
] as const;
export type CodigoAtv = (typeof CODIGOS_ATV)[number];

type ErroBase = { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
const comoErro = (e: unknown): ErroBase => (e && typeof e === "object" ? (e as ErroBase) : {});

/**
 * A RPC não existe na base (migration por aplicar): não é um defeito. Atenção: o PostgREST responde PGRST202 também quando a função
 * existe mas com OUTROS argumentos (um nome de parâmetro mudado); nesse caso o ecrã diria «ainda não disponível» em vez de falhar alto.
 * Aceita-se: os nomes dos argumentos estão fixados pelos testes de `useAtivos.test.tsx` contra o desenho da migration.
 */
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
  | "nome" | "tipo" | "modelo" | "data" | "valorCompra" | "residual" | "vida" | "manutencao" | "codigo" | "centroCusto"
  | "numSerie" | "localizacao" | "notas" | "renda" | "inicioAluguer" | "fimAluguer" | "armazem";

const CAMPO_DO_CODIGO: Partial<Record<CodigoAtv, CampoAtivo>> = {
  ATV03: "nome", ATV04: "tipo", ATV05: "modelo", ATV06: "modelo", ATV07: "data", ATV08: "valorCompra",
  ATV09: "residual", ATV10: "vida", ATV11: "manutencao", ATV12: "codigo", ATV13: "centroCusto",
  // A1: ATV21 (datas do aluguer) mostra-se junto do início; ATV28 (compra ou início depois da primeira entrega) junto da data.
  ATV20: "renda", ATV21: "inicioAluguer", ATV22: "armazem", ATV24: "vida", ATV28: "data",
};

export const campoDoCodigo = (codigo: string | null): CampoAtivo | null => (codigo ? CAMPO_DO_CODIGO[codigo as CodigoAtv] ?? null : null);

/** O DETAIL (texto pt-PT) que a base manda com o erro, ou `null`. */
function detalheDoErro(erro: unknown): string | null {
  const { details } = comoErro(erro);
  return typeof details === "string" && details.trim() !== "" ? details.trim() : null;
}

/**
 * O campo de um erro. O ATV03 serve vários campos (nome, código, número de série, localização, notas) e o DETAIL da base diz qual;
 * sem DETAIL legível é o nome.
 */
export function campoDoErro(erro: unknown): CampoAtivo | null {
  const codigo = codigoAtv(erro);
  if (codigo !== "ATV03") return campoDoCodigo(codigo);
  const d = detalheDoErro(erro) ?? "";
  if (/código/i.test(d)) return "codigo";
  if (/série/i.test(d)) return "numSerie";
  if (/localiza/i.test(d)) return "localizacao";
  if (/notas/i.test(d)) return "notas";
  return "nome";
}

/** Os códigos cujo texto próprio é genérico: a base diz porquê no DETAIL (pt-PT) e é esse que se mostra. */
const COM_DETALHE_DA_BASE: readonly CodigoAtv[] = ["ATV03", "ATV16", "ATV18"];

export function detalheDaBase(erro: unknown): string | null {
  const codigo = codigoAtv(erro);
  return codigo && COM_DETALHE_DA_BASE.includes(codigo) ? detalheDoErro(erro) : null;
}

/**
 * O ATV26 (entrega recusada) tem várias causas e a base diz qual no DETAIL (pt-PT). Cada uma tem texto próprio, nas duas línguas:
 * `ATV26.<causa>`. Sem DETAIL legível (ou uma causa que este ecrã não conhece) fica o texto geral do ATV26.
 */
const CAUSAS_ATV26: readonly { sub: string; detalhe: RegExp }[] = [
  { sub: "grupo", detalhe: /grupo Pessoas/i },
  { sub: "desativado", detalhe: /est[aá] desativado/i },
  { sub: "ocupado", detalhe: /j[aá] est[aá] entregue a outra pessoa/i },
  { sub: "antesDoInicio", detalhe: /anterior [aà] compra ou ao in[ií]cio do aluguer/i },
  { sub: "depoisDoFim", detalhe: /depois do fim do aluguer/i },
  { sub: "contratoTerminado", detalhe: /contrato de aluguer j[aá] terminou/i },
  { sub: "cruza", detalhe: /cruza outra ocupa/i },
  { sub: "mudou", detalhe: /mudou entretanto/i },
];

/** `ATV26.<causa>` para um ATV26 cuja causa se conhece; `null` nos outros casos. */
export function subcodigoAtv(erro: unknown): string | null {
  if (codigoAtv(erro) !== "ATV26") return null;
  const detalhe = detalheDoErro(erro) ?? "";
  const causa = CAUSAS_ATV26.find((c) => c.detalhe.test(detalhe));
  return causa ? `ATV26.${causa.sub}` : null;
}

/** Concorrência: o ativo mudou entretanto (não existe, já está desativado, ficou atribuído, a ligação mudou). A lista refaz-se sozinha. */
export const refazListaAposErro = (erro: unknown): boolean => {
  const codigo = codigoAtv(erro);
  return codigo === "ATV14" || codigo === "ATV15" || codigo === "ATV17" || codigo === "ATV18" || subcodigoAtv(erro) === "ATV26.mudou";
};

/** A chave do texto de um erro da base. */
export function chaveDoErro(erro: unknown): string {
  const codigo = codigoAtv(erro);
  if (codigo) return `ativos.erro.${subcodigoAtv(erro) ?? codigo}`;
  if (ativosRecusado(erro)) return "ativos.erro.semPermissao";
  if (ativosIndisponivel(erro)) return "ativos.erro.indisponivel";
  return "ativos.erro.generico";
}
