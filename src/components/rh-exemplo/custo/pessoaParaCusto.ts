/**
 * Os dados REAIS de uma pessoa de que o custo precisa: nome, cargo, centro, filial, a retribuicao do mes (o total bruto
 * estimado do processamento salarial) e as horas por semana.
 *
 * O tipo de contrato e as horas por semana vem do vinculo em vigor da pessoa (`pessoas_vinculos`), lido para toda a
 * organizacao de uma vez. Sem vinculo em vigor (ou sem permissao para o ler):
 *  - `tipoContrato` fica `null`: a pessoa nao entra em nenhuma opcao do filtro «Contrato».
 *  - `horasSemanais` DERIVA das horas realmente planeadas no mes (relatorio de assiduidade): e escolhida de forma a que
 *    as horas previstas do custo (`horasPrevistasDoMes`) sejam exactamente as horas planeadas do mes. Sem horas
 *    planeadas ficam a 0 e o custo por hora fica «sem valor».
 */
import { horasPrevistasDoMes } from "@/components/rh-exemplo/lib/custo";
import type { HrCargoPeriodo } from "@/components/rh-exemplo/lib/cargosPeriodos";
import type { PessoaParaCusto } from "@/components/rh-exemplo/lib/custoOrganizacao";
import { estimativaPeloCargo, type EstimativaCargo } from "@/components/rh-exemplo/lib/estimativaCusto";
import type { Pessoa } from "@/components/rh-exemplo/tipos";

export interface CatalogosDoCusto {
  locais: ReadonlyArray<{ id: string; nome: string; organograma_node_id: string | null }>;
  filiais: ReadonlyArray<{ id: string; name: string }>;
  cargos: ReadonlyArray<{ id: string; nome: string }>;
}

export const SEM_CATALOGOS: CatalogosDoCusto = { locais: [], filiais: [], cargos: [] };

/** Horas por semana tais que `horasPrevistasDoMes(horasSemanais, mes)` = as horas planeadas do mes (AAAA-MM). */
export function horasSemanaisDoPlaneado(planeadoMinutos: number, mes: string): number {
  // Com 5 h por semana, as horas previstas sao os dias uteis do mes.
  const diasUteis = horasPrevistasDoMes(5, mes);
  if (planeadoMinutos <= 0 || diasUteis <= 0) return 0;
  return ((planeadoMinutos / 60) * 5) / diasUteis;
}

export interface DadosRetribuicaoDoMes {
  /** O total bruto estimado do mes; `null` = sem retribuicao registada. */
  retribuicaoMes: number | null;
  /** So em meses vivos: o que dizer de quem nao tem retribuicao (estimativa pelo cargo, ou a razao). Ausente = nada a acrescentar. */
  estimativa?: EstimativaCargo;
  planeadoMinutos: number;
  /** O tipo do contrato em vigor; ausente/`null` = sem vinculo em vigor lido. */
  tipoContrato?: string | null;
  /** As horas por semana do contrato em vigor; ausente/`null`/0 = o contrato nao as fixa (ou nao se leu). */
  horasContratuais?: number | null;
}

/** As horas por semana da base do custo por hora previsto: as do contrato, se as ha; senao as derivadas do planeado. */
export function horasSemanaisDaBase(horasContratuais: number | null | undefined, planeadoMinutos: number, mes: string): number {
  if (horasContratuais !== null && horasContratuais !== undefined && horasContratuais > 0) return horasContratuais;
  return horasSemanaisDoPlaneado(planeadoMinutos, mes);
}

type PessoaDoCusto = Pick<Pessoa, "id" | "nome_completo" | "cargo" | "cargo_id" | "local_id">;

export function pessoaParaCusto(
  pessoa: PessoaDoCusto,
  catalogos: CatalogosDoCusto,
  dados: DadosRetribuicaoDoMes,
  mes: string,
): PessoaParaCusto {
  const centro = catalogos.locais.find((l) => l.id === pessoa.local_id) ?? null;
  const filial = catalogos.filiais.find((f) => f.id === centro?.organograma_node_id) ?? null;
  const cargo = catalogos.cargos.find((c) => c.id === pessoa.cargo_id)?.nome ?? pessoa.cargo ?? null;
  // A estimativa so vale para quem NAO tem retribuicao: com ela, nada muda.
  const estimativa = dados.retribuicaoMes === null ? dados.estimativa : undefined;
  const estimado = estimativa?.estado === "estimado" ? estimativa : null;
  return {
    pessoaId: pessoa.id,
    nome: pessoa.nome_completo,
    cargo,
    centroId: centro?.id ?? null,
    centro: centro?.nome ?? null,
    filialId: filial?.id ?? null,
    filial: filial?.name ?? null,
    tipoContrato: dados.tipoContrato ?? null,
    retribuicaoMes: estimado ? estimado.salario : dados.retribuicaoMes,
    ...(estimado ? { estimadoPeloCargo: { cargo: estimado.cargo || (cargo ?? ""), salario: estimado.salario } } : {}),
    ...(estimativa?.estado === "sem" ? { razaoSemValor: estimativa.razao } : {}),
    horasSemanais: horasSemanaisDaBase(dados.horasContratuais, dados.planeadoMinutos, mes),
  };
}

/** A estimativa pelo salario do cargo da pessoa no mes (cargo e nome vem da pessoa e do catalogo de cargos). */
export function estimativaDaPessoa(
  pessoa: Pick<PessoaDoCusto, "cargo" | "cargo_id">,
  cargos: ReadonlyArray<{ id: string; nome: string }>,
  periodos: readonly HrCargoPeriodo[],
  mes: string,
): EstimativaCargo {
  const cargoNome = cargos.find((c) => c.id === pessoa.cargo_id)?.nome ?? pessoa.cargo ?? null;
  return estimativaPeloCargo({ cargoId: pessoa.cargo_id ?? null, cargoNome, periodos, mes });
}

interface VersaoDeHoras {
  valido_de: string;
  /** Fim EXCLUSIVO; `null` = em vigor. */
  valido_ate: string | null;
  horas_semanais_equivalentes: number | null;
}

/** As horas por semana contratadas que cobrem o mes (AAAA-MM): a versao de inicio mais recente. `null` = nenhuma cobre o mes. */
export function horasContratuaisNoMes(versoes: readonly VersaoDeHoras[], mes: string): number | null {
  const primeiro = `${mes}-01`;
  const ultimo = `${mes}-31`;
  let escolhida: VersaoDeHoras | null = null;
  for (const v of versoes) {
    if (v.valido_de > ultimo) continue;
    if (v.valido_ate !== null && v.valido_ate <= primeiro) continue;
    if (!escolhida || v.valido_de > escolhida.valido_de) escolhida = v;
  }
  return escolhida?.horas_semanais_equivalentes ?? null;
}
