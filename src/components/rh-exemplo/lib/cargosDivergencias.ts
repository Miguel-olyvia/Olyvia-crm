/**
 * Retribuições em vigor que não batem com o salário do cargo da pessoa (fluxo 2). É um relatório só de leitura: nada se
 * corrige sozinho. Deve dar zero; uma divergência aparece, por exemplo, quando a retribuição de uma pessoa é escrita à mão
 * com um valor diferente do do cargo.
 */
import type { FichaRh } from "@/components/rh-exemplo/dados/tiposLoja";
import { periodoDoCargoEm, type HrCargoPeriodo } from "@/components/rh-exemplo/lib/cargosPeriodos";
import type { Periodicidade } from "@/components/rh-exemplo/tipos";

export interface DivergenciaRetribuicao {
  pessoa_id: string;
  pessoa_nome: string;
  cargo_id: string;
  cargo_nome: string;
  retribuicao_id: string;
  valor_base: number;
  periodicidade: Periodicidade;
  valido_de: string;
  esperado_valor_base: number;
  esperado_periodicidade: Periodicidade;
}

export function retribuicoesDivergentes(
  fichas: Record<string, FichaRh>,
  cargos: ReadonlyArray<{ id: string; nome: string }>,
  periodos: readonly HrCargoPeriodo[],
  hoje: string,
): DivergenciaRetribuicao[] {
  const lista: DivergenciaRetribuicao[] = [];
  for (const ficha of Object.values(fichas)) {
    const cargoId = ficha.pessoa.cargo_id;
    if (!cargoId) continue;
    const vigente = ficha.retribuicoes.find((r) => r.valido_de <= hoje && (r.valido_ate === null || hoje < r.valido_ate));
    const esperado = periodoDoCargoEm(periodos, cargoId, hoje);
    if (!vigente || !esperado) continue;
    if (vigente.valor_base === esperado.salario_base && vigente.periodicidade === esperado.periodicidade) continue;
    lista.push({
      pessoa_id: ficha.pessoa.id,
      pessoa_nome: ficha.pessoa.nome_completo,
      cargo_id: cargoId,
      cargo_nome: cargos.find((c) => c.id === cargoId)?.nome ?? "—",
      retribuicao_id: vigente.id,
      valor_base: vigente.valor_base,
      periodicidade: vigente.periodicidade,
      valido_de: vigente.valido_de,
      esperado_valor_base: esperado.salario_base,
      esperado_periodicidade: esperado.periodicidade,
    });
  }
  return lista.sort((a, b) => a.pessoa_nome.localeCompare(b.pessoa_nome));
}
