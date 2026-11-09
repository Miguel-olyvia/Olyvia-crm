/**
 * O fecho grava o desconto de faltas para sempre. Antes de gravar confere-se que o que o calculo do ecra usou e o que esta agora na
 * base: as faltas (`pessoas_faltas`, em vigor e anuladas), as picagens em vigor (`pessoas_horario_realizado`) e as ausencias
 * aprovadas (`pessoas_ausencias_dias`) da organizacao no periodo. Se alguem marcou, anulou ou justificou uma falta, corrigiu uma
 * picagem ou aprovou uma ausencia depois de o ecra ter calculado, o calculo e mais antigo que os dados e o fecho nao avanca (o
 * ecra relê tudo). As assinaturas sao puras; a leitura e a unica parte com I/O.
 */
import { LEITOR_FALTAS, LEITOR_REALIZADO, emVigor } from "@/lib/hr/assiduidade";
import { assinaturaDeFaltas, type FaltaDoPeriodo } from "@/lib/hr/descontoFalta";
import { hrFrom } from "@/lib/hr/hrDb";
import type { Falta } from "@/types/hrAssiduidade";

type FaltaLida = Pick<
  Falta,
  "id" | "pessoa_id" | "data" | "minutos" | "estado" | "justificacao_estado" | "remunerada" | "motivo_codigo" | "corrige_falta_id"
>;

/** O que da uma picagem interessa ao calculo (as horas contadas) e o que decide se esta em vigor. */
export interface RealizadoLido {
  id: string;
  pessoa_id: string;
  data: string;
  hora_inicio: string | null;
  hora_fim: string | null;
  minutos: number | null;
  estado: string;
  corrige_realizado_id: string | null;
  deleted_at?: string | null;
}

/** Uma ausencia aprovada de um dia. */
export interface AusenciaLida {
  pessoa_id: string;
  data: string;
  tipo_id: string;
  fraccao_dia: number;
}

export const COLUNAS_FALTA_CHAVE =
  "id, pessoa_id, data, minutos, estado, justificacao_estado, remunerada, motivo_codigo, corrige_falta_id";
export const COLUNAS_REALIZADO_CHAVE = "id, pessoa_id, data, hora_inicio, hora_fim, minutos, estado, corrige_realizado_id, deleted_at";
export const COLUNAS_AUSENCIA_CHAVE = "pessoa_id, data, tipo_id, fraccao_dia";

const TAMANHO_PAGINA = 1000;

/**
 * A assinatura das faltas marcadas de UMA pessoa: as em vigor E as anuladas (uma anulacao nova trata o dia e tem de invalidar o
 * calculo). Sem faltas anuladas a chave e so a das em vigor.
 */
export function chaveDeFaltasMarcadas(linhas: readonly FaltaLida[]): string {
  const doPeriodo: FaltaDoPeriodo[] = emVigor(linhas, LEITOR_FALTAS).map((f) => ({
    data: f.data,
    minutos: f.minutos ?? 0,
    estado: f.estado,
    justificacao_estado: f.justificacao_estado,
    remunerada: f.remunerada,
    motivo_codigo: f.motivo_codigo,
  }));
  const anuladas = linhas
    .filter((f) => f.estado === "anulada")
    .map((f) => `${f.data}|${f.id}`)
    .sort();
  const vigor = assinaturaDeFaltas(doPeriodo);
  return anuladas.length > 0 ? `${vigor}#anuladas:${anuladas.join(",")}` : vigor;
}

/** A assinatura das picagens em vigor (nao rejeitadas, nao corrigidas, nao apagadas) de UMA pessoa. */
export function chaveDeRealizado(linhas: readonly RealizadoLido[]): string {
  return emVigor(linhas, LEITOR_REALIZADO)
    .filter((l) => !l.deleted_at)
    .map((l) => `${l.data}|${l.hora_inicio ?? ""}|${l.hora_fim ?? ""}|${l.minutos ?? 0}`)
    .sort()
    .join(";");
}

/** A assinatura das ausencias aprovadas de UMA pessoa. */
export function chaveDeAusencias(linhas: readonly AusenciaLida[]): string {
  return linhas
    .map((a) => `${a.data}|${a.tipo_id}|${a.fraccao_dia}`)
    .sort()
    .join(";");
}

/**
 * A chave de conferencia do fecho de UMA pessoa: faltas, picagens e ausencias. Cada parte so aparece se existir, por isso uma
 * pessoa sem nada tem a chave vazia (a mesma que o fecho assume para quem nao tem linhas).
 */
export function chaveDeAssiduidade(dados: {
  faltas: readonly FaltaLida[];
  realizado: readonly RealizadoLido[];
  ausencias: readonly AusenciaLida[];
}): string {
  const faltas = chaveDeFaltasMarcadas(dados.faltas);
  const realizado = chaveDeRealizado(dados.realizado);
  const ausencias = chaveDeAusencias(dados.ausencias);
  return faltas + (realizado ? `#R:${realizado}` : "") + (ausencias ? `#A:${ausencias}` : "");
}

function agrupar<T extends { pessoa_id: string }>(linhas: readonly T[]): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const linha of linhas) {
    const lista = mapa.get(linha.pessoa_id) ?? [];
    lista.push(linha);
    mapa.set(linha.pessoa_id, lista);
  }
  return mapa;
}

/** As assinaturas por pessoa a partir de linhas de varias pessoas (so faltas, quando as outras nao se leram). */
export function chavesDeFaltasPorPessoa(
  linhas: readonly FaltaLida[],
  realizado: readonly RealizadoLido[] = [],
  ausencias: readonly AusenciaLida[] = [],
): Map<string, string> {
  const faltas = agrupar(linhas);
  const picagens = agrupar(realizado);
  const dias = agrupar(ausencias);
  const pessoas = new Set([...faltas.keys(), ...picagens.keys(), ...dias.keys()]);
  return new Map(
    [...pessoas].map((id) => [
      id,
      chaveDeAssiduidade({ faltas: faltas.get(id) ?? [], realizado: picagens.get(id) ?? [], ausencias: dias.get(id) ?? [] }),
    ]),
  );
}

/** Quantas pessoas tem agora uma assinatura diferente da que o calculo usou (sem linhas = chave vazia). */
export function pessoasComFaltasMudadas(
  calculadas: ReadonlyMap<string, string>,
  atuais: ReadonlyMap<string, string>,
): number {
  let mudou = 0;
  for (const [pessoaId, usada] of calculadas) if ((atuais.get(pessoaId) ?? "") !== usada) mudou += 1;
  return mudou;
}

export type ConferenciaDeFaltas = { ok: true } | { ok: false; motivo: "mudaram"; mudou: number } | { ok: false; motivo: "erro" };

/** Le uma tabela da organizacao no periodo, por paginas; `null` se a leitura falhou (erro ou recusa de permissao). */
async function lerPaginas<T>(
  tabela: string,
  colunas: string,
  args: { organizationId: string; de: string; ate: string },
  filtrar?: (query: any) => any,
): Promise<T[] | null> {
  const linhas: T[] = [];
  for (let desde = 0; ; desde += TAMANHO_PAGINA) {
    let query = hrFrom(tabela)
      .select(colunas)
      .eq("organization_id", args.organizationId)
      .gte("data", args.de)
      .lte("data", args.ate);
    if (filtrar) query = filtrar(query);
    const { data, error } = await query.order("pessoa_id", { ascending: true }).order("data", { ascending: true }).range(desde, desde + TAMANHO_PAGINA - 1);
    if (error) return null;
    const pagina = (data ?? []) as unknown as T[];
    linhas.push(...pagina);
    if (pagina.length < TAMANHO_PAGINA) break;
  }
  return linhas;
}

/**
 * Le as faltas, as picagens e as ausencias aprovadas do periodo da organizacao e compara com as que o calculo usou. Uma leitura
 * recusada ou com erro e um ERRO: sem ela nao se pode garantir que o calculo e o de agora e o fecho grava para sempre.
 */
export async function conferirFaltasDoFecho(args: {
  organizationId: string;
  de: string;
  ate: string;
  calculadas: ReadonlyMap<string, string>;
}): Promise<ConferenciaDeFaltas> {
  const [faltas, realizado, ausencias] = await Promise.all([
    lerPaginas<FaltaLida>("pessoas_faltas", COLUNAS_FALTA_CHAVE, args),
    lerPaginas<RealizadoLido>("pessoas_horario_realizado", COLUNAS_REALIZADO_CHAVE, args),
    lerPaginas<AusenciaLida>("pessoas_ausencias_dias", COLUNAS_AUSENCIA_CHAVE, args, (q) => q.eq("estado", "aprovado")),
  ]);
  if (!faltas || !realizado || !ausencias) return { ok: false, motivo: "erro" };
  const mudou = pessoasComFaltasMudadas(args.calculadas, chavesDeFaltasPorPessoa(faltas, realizado, ausencias));
  return mudou > 0 ? { ok: false, motivo: "mudaram", mudou } : { ok: true };
}