/**
 * A guarda "ficha completa" de `criar-acesso-pessoa`, como funcao pura.
 *
 * Quem recebe acesso a aplicacao tem de ter a ficha de admissao completa:
 * `hr_admissao_pendencias` chamada com `service_role` (sem `auth.uid()`, ramo
 * de servico) devolve TODAS as pendencias -- as da posicao `convite` e as da
 * posicao `ficha`, nunca as `opcional`. Qualquer linha trava a criacao.
 *
 * FECHA, NAO ABRE: se a consulta falhar, a resposta e 500 e nada se cria.
 * Dar acesso a uma ficha que nao se sabe se esta completa e o erro caro.
 *
 * A guarda aplica-se so a PRIMEIRA criacao de acesso; reenviar credenciais a
 * quem ja tem conta nao passa por aqui (decisao do RH).
 */

export interface RespostaFichaIncompleta {
  status: number;
  body: { error: "ficha_incompleta" | "erro_inesperado"; campos?: string[] };
}

export interface ResultadoPendencias {
  data: ReadonlyArray<{ codigo?: unknown }> | null;
  error: unknown;
}

/** `null` quando a ficha esta completa e a criacao pode seguir. */
export function avaliarFichaCompleta(resultado: ResultadoPendencias): RespostaFichaIncompleta | null {
  if (resultado.error || !Array.isArray(resultado.data)) {
    return { status: 500, body: { error: "erro_inesperado" } };
  }
  if (resultado.data.length === 0) return null;
  const campos = Array.from(
    new Set(
      resultado.data
        .map((linha) => linha?.codigo)
        .filter((c): c is string => typeof c === "string" && c !== ""),
    ),
  ).sort();
  return { status: 409, body: { error: "ficha_incompleta", campos } };
}
