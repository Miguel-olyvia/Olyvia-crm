/**
 * As regras do cargo e da parte pessoal da retribuicao no rascunho do
 * assistente de nova pessoa (fluxo 2). Pura: nem React nem base.
 *
 * Moram aqui, e nao em `novaPessoa.ts`, para esse ficheiro nao engordar.
 *
 * TODA A PESSOA TEM CARGO. Sem `cargo_id` a base recusa o INSERT (HRC08), por
 * isso aqui e um PROBLEMA bloqueante e ja nao um aviso de pendencia.
 *
 * O SALARIO BASE JA NAO SE ESCREVE NO ASSISTENTE: vem do cargo. O subsidio de
 * almoco tambem nao: e obrigatorio no cargo e vem da regra salarial da
 * organizacao, sem opcao nem excepcao por pessoa. O que a pessoa tem de seu sao
 * os duodecimos, e vai por `rpc_hr_retribuicao_definir_pessoal` depois de a
 * ficha existir. Se nada disso foi tocado, nao ha parte da pessoa e nao se cria
 * versao nenhuma -- o RH completa na ficha (e a pendencia da admissao di-lo).
 */
import type { ProblemaCampo } from "@/lib/hr/novaPessoa";

/** Os duodecimos propostos quando se define a parte pessoal e nada foi escolhido. */
export const DUODECIMOS_PROPOSTO = 50;

/** O campo de cargo no assistente (o mesmo `id` de sempre: a pendencia e o resumo focam-no). */
export const CAMPO_CARGO_NOVO = "hr-novo-cargo";

export interface ContratoParteDaPessoa {
  duodecimos_pct: "" | "0" | "50" | "100";
}

/** O que vai para `rpc_hr_retribuicao_definir_pessoal`. */
export interface ParteDaPessoa {
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

/** A parte da pessoa (so os duodecimos), ou `null` se ainda nao foram escolhidos. */
export function parteDaPessoaDoContrato(contrato: ContratoParteDaPessoa): ParteDaPessoa | null {
  if (contrato.duodecimos_pct === "") return null;
  return {
    duodecimosPct: Number(contrato.duodecimos_pct) as 0 | 50 | 100,
  };
}
