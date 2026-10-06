/**
 * As regras de datas do cargo e do seu salario, no cliente (puras, sem base).
 *
 * O SALARIO DE UMA PESSOA NUMA DATA e o salario do cargo que ela tinha NESSA
 * data, nessa data. Dois eixos de tempo: o cargo da pessoa (`pessoas_cargos`) e
 * o salario do cargo (`hr_cargos_periodos`). Os periodos tem fim EXCLUSIVO
 * (`valido_ate` ja nao vale), como as retribuicoes; mudar de cargo ou de salario
 * numa data D fecha o anterior em D e abre o novo em D, sem lacuna.
 *
 * Este ficheiro espelha, para o ecra poder AVISAR antes de confirmar, o que a
 * base decide em `hr_cargo_salario_em` e `hr_pessoa_cargo_em`:
 *
 *  - o salario do cargo ANTES do primeiro periodo e o do primeiro (o primeiro
 *    valor de um cargo vale "desde sempre": o cargo pode ter sido criado depois
 *    de alguem ser admitido);
 *  - o cargo da pessoa e ESTRITO: antes da primeira linha nao havia cargo.
 *
 * A base e quem decide; isto so evita mostrar um aviso que nao bate certo.
 */
import { dataDeHojeBase } from "@/lib/hr/dataBase";
import type { Periodicidade } from "@/types/hr";

export interface HrCargoPeriodo {
  id: string;
  cargo_id: string;
  salario_base: number;
  periodicidade: Periodicidade;
  valido_de: string;
  /** EXCLUSIVO. `null` = em aberto. */
  valido_ate: string | null;
  motivo: string | null;
}

export interface PessoaCargoPeriodo {
  id: string;
  pessoa_id: string;
  cargo_id: string;
  valido_de: string;
  /** EXCLUSIVO. `null` = em aberto. */
  valido_ate: string | null;
  motivo: string | null;
}

export type EstadoDoPeriodo = "passado" | "vigente" | "agendado";

export interface ValorDoSalario {
  salarioBase: number;
  periodicidade: Periodicidade;
}

export interface SegmentoHistoricoCargo {
  cargoId: string;
  /** `null` quando o cargo ja nao esta no catalogo que o ecra tem. */
  cargoNome: string | null;
  desde: string;
  /** EXCLUSIVO. `null` = em aberto. */
  ate: string | null;
  /** `null` quando nao ha periodo conhecido do cargo. */
  salarioBase: number | null;
  periodicidade: Periodicidade | null;
}

export type TipoComparacaoSalario =
  | "primeiro"
  | "igual"
  | "sobe"
  | "desce"
  | "muda_periodicidade";

export interface ComparacaoSalario {
  tipo: TipoComparacaoSalario;
  antes: ValorDoSalario | null;
  depois: ValorDoSalario;
}

/** O dia a seguir a uma data ISO (AAAA-MM-DD), em UTC para nao depender do fuso. */
export function diaSeguinte(data: string): string {
  const dia = new Date(`${data}T00:00:00Z`);
  dia.setUTCDate(dia.getUTCDate() + 1);
  return dia.toISOString().slice(0, 10);
}

const porInicio =<T extends { valido_de: string }>(a: T, b: T) => a.valido_de.localeCompare(b.valido_de);

/** Os periodos de UM cargo, do mais antigo para o mais recente. */
function periodosDe(periodos: readonly HrCargoPeriodo[], cargoId: string): HrCargoPeriodo[] {
  return periodos.filter((p) => p.cargo_id === cargoId).sort(porInicio);
}

/** O periodo do cargo que cobre `data` (fim exclusivo); antes do primeiro vale o primeiro. */
export function periodoDoCargoEm(
  periodos: readonly HrCargoPeriodo[],
  cargoId: string,
  data: string,
): HrCargoPeriodo | null {
  const doCargo = periodosDe(periodos, cargoId);
  if (doCargo.length === 0) return null;
  if (data < doCargo[0].valido_de) return doCargo[0];
  return doCargo.find((p) => p.valido_de <= data && (p.valido_ate === null || data < p.valido_ate)) ?? null;
}

/** O cargo da linha que cobre `data` (fim exclusivo). ESTRITO: antes da primeira linha, `null`. */
export function cargoDaPessoaEm(
  linhas: readonly PessoaCargoPeriodo[],
  data: string,
): string | null {
  const linha = linhas.find(
    (l) => l.valido_de <= data && (l.valido_ate === null || data < l.valido_ate),
  );
  return linha?.cargo_id ?? null;
}

/**
 * Passado (ja fechou), vigente hoje, ou agendado (ainda nao comecou). Sem `hoje`
 * explicito vale o dia da BASE (UTC): ver `dataBase.ts`.
 */
export function estadoDoPeriodo(
  periodo: Pick<HrCargoPeriodo, "valido_de" | "valido_ate">,
  hoje: string = dataDeHojeBase(),
): EstadoDoPeriodo {
  if (periodo.valido_de > hoje) return "agendado";
  if (periodo.valido_ate !== null && periodo.valido_ate <= hoje) return "passado";
  return "vigente";
}

/** O periodo do cargo que ainda nao comecou e esta mais proximo. */
export function proximoPeriodoAgendado(
  periodos: readonly HrCargoPeriodo[],
  cargoId: string,
  hoje: string = dataDeHojeBase(),
): HrCargoPeriodo | null {
  return periodosDe(periodos, cargoId).find((p) => p.valido_de > hoje) ?? null;
}

/**
 * O historico do cargo de uma pessoa, do mais recente para o mais antigo: um
 * segmento por cada troco em que NEM o cargo da pessoa NEM o salario do cargo
 * mudam. So cobre o tempo em que a pessoa teve cargo -- nao inventa um segmento
 * para antes da primeira linha.
 */
export function segmentosHistoricoCargo(
  linhasPessoa: readonly PessoaCargoPeriodo[],
  periodos: readonly HrCargoPeriodo[],
  cargos: ReadonlyArray<{ id: string; nome: string }>,
): SegmentoHistoricoCargo[] {
  const nomeDe = new Map(cargos.map((c) => [c.id, c.nome]));
  const cronologicas: SegmentoHistoricoCargo[] = [];

  for (const linha of [...linhasPessoa].sort(porInicio)) {
    const cortes = periodosDe(periodos, linha.cargo_id)
      .map((p) => p.valido_de)
      .filter((d) => d > linha.valido_de && (linha.valido_ate === null || d < linha.valido_ate));
    const inicios = [linha.valido_de, ...cortes];

    inicios.forEach((desde, i) => {
      const periodo = periodoDoCargoEm(periodos, linha.cargo_id, desde);
      const segmento: SegmentoHistoricoCargo = {
        cargoId: linha.cargo_id,
        cargoNome: nomeDe.get(linha.cargo_id) ?? null,
        desde,
        ate: i + 1 < inicios.length ? inicios[i + 1] : linha.valido_ate,
        salarioBase: periodo?.salario_base ?? null,
        periodicidade: periodo?.periodicidade ?? null,
      };
      const anterior = cronologicas[cronologicas.length - 1];
      const igual =
        anterior !== undefined &&
        anterior.cargoId === segmento.cargoId &&
        anterior.ate === segmento.desde &&
        anterior.salarioBase === segmento.salarioBase &&
        anterior.periodicidade === segmento.periodicidade;
      if (igual) {
        cronologicas[cronologicas.length - 1] = { ...anterior, ate: segmento.ate };
      } else {
        cronologicas.push(segmento);
      }
    });
  }

  return cronologicas.reverse();
}

/** "1500 mensal": o valor e a periodicidade traduzida, para os avisos e as listas. */
export function formatarSalario(
  valor: ValorDoSalario,
  traduzir: (chave: string) => string,
): string {
  return `${valor.salarioBase} ${traduzir(`hr.periodicidade.${valor.periodicidade}`)}`;
}

/** Compara o salario que a pessoa tinha com o que passa a ter: primeiro, igual, sobe, desce ou muda de periodicidade. */
export function compararSalario(
  antes: ValorDoSalario | null,
  depois: ValorDoSalario,
): ComparacaoSalario {
  if (antes === null) return { tipo: "primeiro", antes, depois };
  if (antes.periodicidade !== depois.periodicidade) {
    return { tipo: "muda_periodicidade", antes, depois };
  }
  if (antes.salarioBase === depois.salarioBase) return { tipo: "igual", antes, depois };
  return { tipo: depois.salarioBase > antes.salarioBase ? "sobe" : "desce", antes, depois };
}
