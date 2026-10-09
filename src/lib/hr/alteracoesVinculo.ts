/**
 * Como se mostra uma linha de `pessoas_vinculos_alteracoes` (o historico de
 * alteracoes do contrato): o nome do campo e os valores antes e depois.
 *
 * A tabela guarda TEXTO: `valor_antes`/`valor_depois` sao o `->>` do jsonb da
 * linha, por isso um booleano chega como "true"/"false", os dias uteis como um
 * array JSON e os enumerados como o valor cru da base. Aqui traduzem-se para
 * a lingua do ecra. Um campo ou valor que nao se reconhece mostra-se tal como
 * esta -- nunca desaparece, que num historico seria esconder uma alteracao.
 */

/** Campo (coluna) -> prefixo das chaves de traducao dos seus valores. */
const PREFIXO_ENUMERADO: Readonly<Record<string, string>> = {
  tipo_contrato: "hr.tipoContrato",
  regime: "hr.regime",
  regime_contratual: "hr.regimeContratual",
  estado: "hr.estadoVinculo",
  tipo_trabalho: "hr.tipoTrabalho",
  horas_frequencia: "hr.horasFrequencia",
  politica_feriados: "hr.politicaFeriados",
  categoria_funcao: "hr.categoriaFuncao",
  periodo_experimental_origem: "hr.periodoExperimentalOrigem",
};

const CAMPOS_BOOLEANOS: ReadonlySet<string> = new Set(["renovavel", "isencao_horario"]);

type Traduzir = (key: string) => string;

/** O nome do campo na lingua do ecra; um campo sem traducao mostra-se pelo nome da coluna. */
export function rotuloDoCampo(campo: string, t: Traduzir): string {
  const chave = `hr.contrato.campo.${campo}`;
  const texto = t(chave);
  return texto === chave ? campo : texto;
}

function traduzirOuCru(chave: string, cru: string, t: Traduzir): string {
  const texto = t(chave);
  return texto === chave ? cru : texto;
}

function diasUteisLegiveis(valor: string, t: Traduzir): string {
  try {
    const dias: unknown = JSON.parse(valor);
    if (Array.isArray(dias) && dias.every((dia) => typeof dia === "string")) {
      return dias.length === 0
        ? "—"
        : dias.map((dia) => traduzirOuCru(`hr.dias.${dia}`, dia, t)).join(", ");
    }
  } catch {
    // Nao e JSON: mostra-se cru, abaixo.
  }
  return valor;
}

/** O valor de um campo na lingua do ecra. `null` (sem valor) e "—". */
export function valorLegivel(campo: string, valor: string | null, t: Traduzir): string {
  if (valor === null || valor === "") return "—";
  const prefixo = PREFIXO_ENUMERADO[campo];
  if (prefixo) return traduzirOuCru(`${prefixo}.${valor}`, valor, t);
  if (CAMPOS_BOOLEANOS.has(campo)) {
    if (valor === "true") return t("common.yes");
    if (valor === "false") return t("common.no");
    return valor;
  }
  if (campo === "dias_uteis") return diasUteisLegiveis(valor, t);
  return valor;
}
