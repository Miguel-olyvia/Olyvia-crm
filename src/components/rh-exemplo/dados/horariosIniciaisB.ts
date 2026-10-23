/**
 * Os horarios por tipo de cada pessoa de exemplo. Quase todas tem o horario padrao das suas linhas planeadas
 * (09:00-13:00 e 14:00-18:00, a pausa sai da diferenca); algumas mostram os outros tipos, e a Sofia tem duas
 * versoes para o historico ter o que mostrar.
 */
import { diaIso } from "@/components/rh-exemplo/dados/datas";
import type { EstadoRh } from "@/components/rh-exemplo/dados/tiposLoja";
import {
  configInicial,
  diaPadraoVazio,
  type ConfigHorario,
  type ExcecaoDia,
  type HorarioPessoa,
  type TipoHorario,
  type VersaoHorario,
} from "@/components/rh-exemplo/lib/horarioTipos";
import type { HorarioPlaneado } from "@/components/rh-exemplo/tipos";

/** Uma excepcao de um dia que ja esta marcada: a Sofia entra mais tarde na sexta-feira, 16 de Outubro. */
export const EXCECOES_EXEMPLO: Record<string, ExcecaoDia[]> = {
  "p-sofia": [
    {
      id: "exc-sofia-1",
      data: "2026-10-16",
      dia: { trabalha: true, entrada: "10:00", saida: "15:00", pausaMin: 0 },
      motivo: "Consulta de manhã",
      autor: "Sofia Rebelo",
      criadaEm: "2026-10-01T09:00:00.000Z",
    },
  ],
};

const TIPO_POR_PESSOA: Record<string, TipoHorario> = {
  "p-marta": "isencao",
  "p-rui": "banco",
  "p-ines": "livre",
  "p-hugo": "repartido",
};

function diasDasLinhas(linhas: HorarioPlaneado[]): number[] {
  const dias = linhas.filter((l) => l.dia_semana !== null && !l.nao_trabalha && l.data === null).map((l) => l.dia_semana as number);
  return [...new Set(dias)].sort((a, b) => a - b);
}

export function configDaPessoa(pessoaId: string, linhas: HorarioPlaneado[], horasSemanais: number): ConfigHorario {
  const dias = diasDasLinhas(linhas);
  const base = configInicial(TIPO_POR_PESSOA[pessoaId] ?? "padrao");
  const usados = dias.length > 0 ? dias : base.isencao.dias;
  return {
    ...base,
    padrao: Array.from({ length: 7 }, (_, dia) => diaPadraoVazio(usados.includes(dia))),
    repartido: { ...base.repartido, dias: usados },
    isencao: { dias: usados, horasSemanais },
    livre: { dias: usados, horasSemanais },
  };
}

function versao(id: string, config: ConfigHorario, campos: Partial<VersaoHorario>): VersaoHorario {
  return {
    id,
    config,
    desde: diaIso(-365),
    ate: null,
    motivo: "Horário inicial do contrato",
    anexoNome: null,
    autor: "Sofia Rebelo",
    criadaEm: `${diaIso(-365)}T09:00:00.000Z`,
    corrigeId: null,
    correccao: false,
    autorizadaPor: null,
    substituidaPor: null,
    ...campos,
  };
}

function horasDaFicha(estado: EstadoRh, pessoaId: string): number {
  const horas = estado.fichas[pessoaId]?.horasVersoes.find((h) => h.valido_ate === null);
  return horas?.horas_semanais_equivalentes ?? 40;
}

export function horariosIniciais(estado: EstadoRh): Record<string, HorarioPessoa> {
  const resultado: Record<string, HorarioPessoa> = {};
  for (const [pessoaId, ficha] of Object.entries(estado.fichas)) {
    const config = configDaPessoa(pessoaId, ficha.horarioPlaneado, horasDaFicha(estado, pessoaId));
    const versoes =
      pessoaId === "p-sofia"
        ? [
            versao("hvb-sofia-1", { ...config, tipo: "padrao" }, { ate: diaIso(-61), motivo: "Horário inicial do contrato" }),
            versao("hvb-sofia-2", config, { desde: diaIso(-60), motivo: "Passou a trabalhar no horário padrão das 09:00 às 18:00", anexoNome: "acordo-horario.pdf" }),
          ]
        : [versao(`hvb-${pessoaId}-1`, config, {})];
    resultado[pessoaId] = { versoes, excecoes: EXCECOES_EXEMPLO[pessoaId] ?? [] };
  }
  return resultado;
}
