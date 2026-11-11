/**
 * As tres datas da pessoa (contratacao, antiguidade, saida) derivadas dos contratos. Puro, sem base e sem React.
 *
 * E o espelho em TypeScript da regra que o servidor aplica (`hr_pessoa_datas_calcular`): as colunas `pessoas.data_admissao`,
 * `data_antiguidade` e `data_saida` passam a ser CALCULADAS pelo servidor a partir de `pessoas_vinculos`, e o ecra usa esta
 * funcao para mostrar de antemao o que o servidor vai calcular. Nao depende de «hoje».
 *
 * A REGRA
 * - Contam os contratos com `deleted_at` nulo (os `futuro` incluidos).
 * - Agrupam-se em cadeias continuas, no criterio de `vinculoContinuoDoPeriodo`: um contrato liga-se a cadeia se comeca no maximo
 *   no dia a seguir ao maior fim dela; sem fim = cadeia aberta; sobrepostos fundem-se.
 * - Cadeia de referencia: a mais recente que tenha pelo menos um contrato que NAO seja `futuro`. Um `futuro` so conta se estiver
 *   ligado a essa cadeia, ou se nao houver mais nada (pessoa nova com admissao futura; nesse caso, a cadeia mais recente).
 * - Contratacao = inicio da cadeia. Saida = maior `data_fim` da cadeia, SO se todos os contratos dela estao `terminado`; senao
 *   `null`. (Um `terminado` sem `data_fim` nao existe na base: o CHECK `pessoas_vinculos_terminado_tem_data_fim` impede-o. Se
 *   chegasse aqui, a cadeia ficava aberta e a saida `null`; o servidor ignoraria os fins nulos. Nao e regra, so o que se faz.)
 * - Antiguidade = a do ultimo contrato da cadeia com antiguidade preenchida, na ordem (inicio, id), como o
 *   `ORDER BY di DESC, id DESC` do servidor; senao o inicio da cadeia. A cadeia ordena-se por (inicio, fim com `null` = sem
 *   fim, id), tambem como no servidor, para os empates darem o mesmo resultado.
 * - Sem contrato vivo: as tres a `null`.
 */
import type { EstadoVinculo } from "@/types/hr";

/** O que a regra le de um contrato. `data_antiguidade` e `deleted_at` sao opcionais: uma leitura que os nao traga nao os conta. */
export interface VinculoParaDatas {
  /** So desempata contratos com o mesmo inicio (a mesma ordem do servidor). Sem ele, vale a ordem em que chegam. */
  id?: string;
  estado: EstadoVinculo;
  /** `AAAA-MM-DD` (uma hora a seguir e ignorada). */
  data_inicio: string;
  /** `null` = sem fim. */
  data_fim: string | null;
  data_antiguidade?: string | null;
  /** Preenchido = contrato apagado: nao conta. */
  deleted_at?: string | null;
}

export interface DatasDaPessoa {
  data_admissao: string | null;
  data_antiguidade: string | null;
  data_saida: string | null;
}

const MS_DIA = 86_400_000;

const soData = (iso: string): string => iso.slice(0, 10);

/** Dias desde 1970 de uma data `AAAA-MM-DD`. */
function diaNumero(iso: string): number {
  const [a, m, d] = soData(iso).split("-").map(Number);
  return Math.round(Date.UTC(a, m - 1, d) / MS_DIA);
}

interface Cadeia {
  inicio: string;
  /** Maior fim da cadeia; `null` = aberta. */
  fim: string | null;
  /** Por inicio crescente. */
  membros: VinculoParaDatas[];
}

const comparar = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0);
const FIM_INFINITO = "9999-12-31";
const fimOuInfinito = (v: VinculoParaDatas): string => (v.data_fim === null ? FIM_INFINITO : soData(v.data_fim));

/** (inicio, id): a ordem do `ORDER BY di DESC, id DESC` do servidor, para escolher a antiguidade. */
const porInicioEId = (a: VinculoParaDatas, b: VinculoParaDatas): number =>
  comparar(soData(a.data_inicio), soData(b.data_inicio)) || comparar(a.id ?? "", b.id ?? "");

/** (inicio, fim com `null` = sem fim, id): a ordem em que o servidor percorre os contratos para formar as cadeias. */
const porInicio = (a: VinculoParaDatas, b: VinculoParaDatas): number =>
  comparar(soData(a.data_inicio), soData(b.data_inicio)) ||
  comparar(fimOuInfinito(a), fimOuInfinito(b)) ||
  comparar(a.id ?? "", b.id ?? "");

/** Agrupa contratos (ja filtrados) em cadeias continuas, da mais antiga para a mais recente. */
function cadeiasDe(vinculos: readonly VinculoParaDatas[]): Cadeia[] {
  const cadeias: Cadeia[] = [];
  for (const v of [...vinculos].sort(porInicio)) {
    const atual = cadeias[cadeias.length - 1];
    if (atual && (atual.fim === null || diaNumero(v.data_inicio) <= diaNumero(atual.fim) + 1)) {
      atual.membros.push(v);
      if (atual.fim !== null && (v.data_fim === null || diaNumero(v.data_fim) > diaNumero(atual.fim))) {
        atual.fim = v.data_fim === null ? null : soData(v.data_fim);
      }
      continue;
    }
    cadeias.push({ inicio: soData(v.data_inicio), fim: v.data_fim === null ? null : soData(v.data_fim), membros: [v] });
  }
  return cadeias;
}

/** A cadeia de referencia: a mais recente com um contrato que nao seja `futuro`; sem nenhuma, a mais recente. */
function cadeiaDeReferencia(cadeias: readonly Cadeia[]): Cadeia {
  for (let i = cadeias.length - 1; i >= 0; i -= 1) {
    if (cadeias[i].membros.some((m) => m.estado !== "futuro")) return cadeias[i];
  }
  return cadeias[cadeias.length - 1];
}

/**
 * A recusa legitima do trigger das datas derivadas (23514, `pessoas_datas_derivadas`): um formulario aberto antes de um
 * recalculo tentou gravar uma das tres datas. E resposta esperada, nao um defeito a reportar.
 */
export function eRecusaDasDatasDerivadas(erro: unknown): boolean {
  if (!erro || typeof erro !== "object") return false;
  const { message } = erro as { message?: unknown };
  return typeof message === "string" && /pessoas_datas_derivadas/i.test(message);
}

const SEM_DATAS: DatasDaPessoa = { data_admissao: null, data_antiguidade: null, data_saida: null };

/**
 * `saidaGravada` (`pessoas.data_saida`) so conta SEM contrato vivo: a base mantem-na (D8 revista; e barreira de acesso em
 * `fn_neg_pessoa_da_conta`, apagar o ultimo contrato nunca a limpa) e so a contratacao e a antiguidade voltam a `null`.
 * Com contrato vivo vale a regra normal e `saidaGravada` e ignorada.
 */
export function datasDaPessoa(
  vinculos: readonly VinculoParaDatas[] | null | undefined,
  saidaGravada?: string | null,
): DatasDaPessoa {
  const vivos = (vinculos ?? []).filter((v) => v.deleted_at === null || v.deleted_at === undefined);
  if (vivos.length === 0) return saidaGravada ? { ...SEM_DATAS, data_saida: soData(saidaGravada) } : SEM_DATAS;

  const cadeia = cadeiaDeReferencia(cadeiasDe(vivos));
  const todosTerminados = cadeia.membros.every((m) => m.estado === "terminado");

  const comAntiguidade = cadeia.membros.filter((m) => m.data_antiguidade).sort(porInicioEId);
  const ultimo = comAntiguidade[comAntiguidade.length - 1];
  const antiguidade = ultimo?.data_antiguidade ? soData(ultimo.data_antiguidade) : null;

  return {
    data_admissao: cadeia.inicio,
    data_antiguidade: antiguidade ?? cadeia.inicio,
    data_saida: todosTerminados ? cadeia.fim : null,
  };
}
