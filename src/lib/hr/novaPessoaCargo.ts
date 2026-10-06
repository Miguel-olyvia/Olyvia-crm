/**
 * As regras do cargo e da parte pessoal da retribuicao no rascunho do
 * assistente de nova pessoa (fluxo 2). Pura: nem React nem base.
 *
 * Moram aqui, e nao em `novaPessoa.ts`, para esse ficheiro nao engordar.
 *
 * TODA A PESSOA TEM CARGO. Sem `cargo_id` a base recusa o INSERT (HRC08), por
 * isso aqui e um PROBLEMA bloqueante e ja nao um aviso de pendencia.
 *
 * O SALARIO BASE JA NAO SE ESCREVE NO ASSISTENTE: vem do cargo. O que a pessoa
 * tem de seu e o subsidio de alimentacao (valor e modo) e os duodecimos, e vai
 * por `rpc_hr_retribuicao_definir_pessoal` depois de a ficha existir. Se nada
 * disso foi tocado, nao ha parte da pessoa e nao se cria versao nenhuma -- o RH
 * completa na ficha (e a pendencia da admissao di-lo).
 */
import type { ProblemaCampo } from "@/lib/hr/novaPessoa";
import { numeroDe } from "@/lib/hr/numeros";
import type { SubsidioAlimentacaoModo } from "@/types/hr";

/** Os duodecimos propostos quando se define a parte pessoal e nada foi escolhido. */
export const DUODECIMOS_PROPOSTO = 50;

/** O campo de cargo no assistente (o mesmo `id` de sempre: a pendencia e o resumo focam-no). */
export const CAMPO_CARGO_NOVO = "hr-novo-cargo";
export const CAMPO_SUBSIDIO_NOVO = "hr-novo-subsidio";

export interface ContratoParteDaPessoa {
  subsidio: string;
  subsidio_modo: SubsidioAlimentacaoModo | "";
  duodecimos_pct: "" | "0" | "50" | "100";
}

/** O que vai para `rpc_hr_retribuicao_definir_pessoal`. */
export interface ParteDaPessoa {
  subsidio: number | null;
  subsidioModo: SubsidioAlimentacaoModo | null;
  duodecimosPct: 0 | 50 | 100;
}

/**
 * A data em que o trigger `hr_pessoas_cargo_primeira_linha` abre o cargo da
 * pessoa nova: a data de admissao, ou o `current_date` da base. `hoje` e o
 * "hoje" da base (`dataDeHojeBase`).
 */
export function dataDeAberturaDoCargo(dataAdmissao: string | null, hoje: string): string {
  return dataAdmissao ?? hoje;
}

/**
 * Desde quando vale a primeira retribuicao (a parte da pessoa): o inicio do
 * vinculo, senao a admissao, senao hoje -- mas NUNCA antes de o cargo abrir.
 * Antes dessa data a pessoa nao tem cargo e a base recusa com HRC11. O cargo
 * nao se pode abrir mais cedo (`pessoas.data_admissao` e o que e), por isso a
 * retribuicao e que acompanha: um vinculo anterior a admissao fica com a
 * retribuicao a partir da admissao. Datas fora dos 10 anos para tras / 5 para
 * a frente sao recusadas pela base (HRC04) e voltam traduzidas: nao se
 * corrigem em silencio.
 */
export function dataDaPrimeiraRetribuicao(
  vinculoDataInicio: string | null | undefined,
  dataAdmissao: string | null,
  hoje: string,
): string {
  const cargoAbre = dataDeAberturaDoCargo(dataAdmissao, hoje);
  const desde = vinculoDataInicio ?? cargoAbre;
  return desde < cargoAbre ? cargoAbre : desde;
}

/** Sem cargo escolhido: problema bloqueante do passo das informacoes laborais. */
export function problemaDoCargo(laborais: { cargo_id: string }): ProblemaCampo | null {
  if (laborais.cargo_id.trim() !== "") return null;
  return {
    seccao: "laborais",
    campoId: CAMPO_CARGO_NOVO,
    rotuloKey: "hr.columns.cargo",
    mensagemKey: "hr.form.cargoObrigatorio",
  };
}

/** Subsidio escrito mas ilegivel ou negativo: erro de formato. Vazio nao e erro. */
export function problemaDoSubsidio(contrato: ContratoParteDaPessoa): ProblemaCampo | null {
  if (contrato.subsidio.trim() === "") return null;
  const valor = numeroDe(contrato.subsidio);
  if (valor !== null && valor >= 0) return null;
  return {
    seccao: "contrato",
    campoId: CAMPO_SUBSIDIO_NOVO,
    rotuloKey: "hr.retribuicaoCartao.subsidioAlimentacao",
    mensagemKey: "hr.form.erroNumero",
  };
}

/**
 * A parte da pessoa, ou `null` se nada foi tocado. Os duodecimos propoem 50
 * quando ha parte mas nao foram escolhidos.
 */
export function parteDaPessoaDoContrato(contrato: ContratoParteDaPessoa): ParteDaPessoa | null {
  const subsidio = numeroDe(contrato.subsidio);
  const modo = contrato.subsidio_modo === "" ? null : contrato.subsidio_modo;
  const tocou =
    contrato.subsidio.trim() !== "" || modo !== null || contrato.duodecimos_pct !== "";
  if (!tocou) return null;
  return {
    subsidio,
    subsidioModo: modo,
    duodecimosPct:
      contrato.duodecimos_pct === ""
        ? DUODECIMOS_PROPOSTO
        : (Number(contrato.duodecimos_pct) as 0 | 50 | 100),
  };
}
