/**
 * O aviso de nome parecido ao criar um centro ("ja existe um centro com nome
 * parecido, e o mesmo?").
 *
 * PORQUE UM AVISO, E NAO UMA RECUSA NEM UMA FUSAO
 * ------------------------------------------------
 * "Worten" e "Worten Colombo" podem ser mesmo dois sitios diferentes -- uma
 * recusa por nome parecido impediria um caso legitimo. Mas sem morada nem
 * aviso nenhum, alguem cria "Worten" e outro dia outra pessoa cria "Worten "
 * (com espaco a mais, que o indice unico ja apanha) ou "Wortem" (erro de
 * escrita, que o indice unico NAO apanha) -- e o historico de afectacoes
 * parte-se entre dois centros gemeos. Este modulo so avisa; quem decide se e
 * o mesmo sitio ou dois e sempre quem esta a criar.
 *
 * NAO E O QUE JA EXISTE NA BASE
 * -----------------------------
 * `idx_hr_locais_trabalho_nome_org` (20261120130000) e um indice UNICO sobre
 * `lower(btrim(nome))` -- apanha "Porto"/"porto"/"Porto " (a mesma string, a
 * menos de maiusculas e espacos nas pontas), e RECUSA o INSERT. Este ficheiro
 * apanha o caso seguinte, mais dificil: strings DIFERENTES mas parecidas
 * ("Worten"/"Wortem", "Loja Cascais"/"Loja Cascais 2"), onde a base nao pode
 * recusar porque nao sabe se sao o mesmo sitio -- so o aviso e que faz
 * sentido.
 */

/** Minusculas, sem acentos, espacos colapsados e aparados. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Distancia de Levenshtein, sem dependencias externas. */
function distanciaLevenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let linhaAnterior = Array.from({ length: b.length + 1 }, (_, indice) => indice);

  for (let i = 1; i <= a.length; i++) {
    const linhaAtual = [i];
    for (let j = 1; j <= b.length; j++) {
      const custoSubstituicao = a[i - 1] === b[j - 1] ? 0 : 1;
      linhaAtual.push(
        Math.min(
          linhaAnterior[j] + 1, // remover
          linhaAtual[j - 1] + 1, // inserir
          linhaAnterior[j - 1] + custoSubstituicao, // substituir
        ),
      );
    }
    linhaAnterior = linhaAtual;
  }

  return linhaAnterior[b.length];
}

/**
 * `true` quando `nomeNovo` e `nomeExistente` sao parecidos o suficiente para
 * merecerem o aviso -- mas NAO identicos (esse caso e o indice unico da base
 * a recusar, nunca chega aqui).
 *
 * Dois criterios, qualquer um basta:
 *  - um contem o outro por inteiro ("Worten" dentro de "Worten Colombo");
 *  - a distancia de edicao e pequena FACE ao tamanho do nome mais curto (25%
 *    ou menos, minimo 1) -- "Wortem" fica a 1 de "Worten" (17%), mas
 *    "Escritorio Porto" e "Escritorio Lisboa" ficam bem acima disso.
 */
export function nomesParecidos(nomeNovo: string, nomeExistente: string): boolean {
  const a = normalizar(nomeNovo);
  const b = normalizar(nomeExistente);
  if (a === "" || b === "" || a === b) return false;

  if (a.includes(b) || b.includes(a)) return true;

  const maisCurto = Math.min(a.length, b.length);
  const distancia = distanciaLevenshtein(a, b);
  const limite = Math.max(1, Math.floor(maisCurto * 0.25));
  return distancia <= limite;
}

/**
 * Devolve o primeiro nome existente parecido com `nomeNovo`, ou `null` se
 * nenhum for. Percorre TODOS os centros da organizacao (activos e
 * desactivados -- um centro desactivado ainda e o mesmo sitio para efeitos
 * deste aviso), nunca so os activos.
 */
export function encontrarNomeParecido(
  nomeNovo: string,
  existentes: readonly { id: string; nome: string }[],
  idAIgnorar?: string,
): { id: string; nome: string } | null {
  for (const existente of existentes) {
    if (existente.id === idAIgnorar) continue;
    if (nomesParecidos(nomeNovo, existente.nome)) return existente;
  }
  return null;
}
