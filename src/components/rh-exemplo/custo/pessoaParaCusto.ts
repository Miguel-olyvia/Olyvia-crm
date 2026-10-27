/**
 * Os dados REAIS de uma pessoa de que o custo precisa: nome, cargo, centro, filial, a retribuicao do mes (o total bruto
 * estimado do processamento salarial) e as horas por semana.
 *
 * Duas coisas que nao tem fonte organizacional na base e por isso se dizem aqui:
 *  - `tipoContrato` fica `null`: nao existe hook que devolva o tipo de contrato de toda a organizacao (so o da ficha
 *    de uma pessoa), por isso o filtro «Contrato» dos Custos nao tem opcoes.
 *  - `horasSemanais` DERIVA das horas realmente planeadas no mes (relatorio de assiduidade): e escolhida de forma a que
 *    as horas previstas do custo (`horasPrevistasDoMes`) sejam exactamente as horas planeadas do mes. Sem horas
 *    planeadas ficam a 0 e o custo por hora fica «sem valor».
 */
import { horasPrevistasDoMes } from "@/components/rh-exemplo/lib/custo";
import type { PessoaParaCusto } from "@/components/rh-exemplo/lib/custoOrganizacao";
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
  planeadoMinutos: number;
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
  return {
    pessoaId: pessoa.id,
    nome: pessoa.nome_completo,
    cargo,
    centroId: centro?.id ?? null,
    centro: centro?.nome ?? null,
    filialId: filial?.id ?? null,
    filial: filial?.name ?? null,
    tipoContrato: null,
    retribuicaoMes: dados.retribuicaoMes,
    horasSemanais: horasSemanaisDoPlaneado(dados.planeadoMinutos, mes),
  };
}
