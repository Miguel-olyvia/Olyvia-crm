/** Os dados de uma ficha de RH de que o custo precisa: nome, cargo, centro, filial, tipo de contrato e horas por semana. */
import type { FichaRh } from "@/components/rh-exemplo/dados/tiposLoja";
import { horasSemanaisDaFicha } from "@/components/rh-exemplo/fluxosC/salarioEntrada";
import type { PessoaParaCusto } from "@/components/rh-exemplo/lib/custoOrganizacao";
import type { LocalTrabalho } from "@/components/rh-exemplo/tipos";

interface Catalogos {
  locais: readonly Pick<LocalTrabalho, "id" | "nome" | "organograma_node_id">[];
  filiais: ReadonlyArray<{ id: string; name: string }>;
}

/** O tipo de contrato do vínculo mais recente da ficha. */
function tipoDeContrato(ficha: FichaRh): string | null {
  const recente = [...ficha.vinculos].sort((a, b) => b.data_inicio.localeCompare(a.data_inicio))[0];
  return recente?.tipo_contrato ?? null;
}

export function pessoaParaCusto(ficha: FichaRh, catalogos: Catalogos, retribuicaoMes: number | null): PessoaParaCusto {
  const centro = catalogos.locais.find((l) => l.id === ficha.pessoa.local_id) ?? null;
  const filial = catalogos.filiais.find((f) => f.id === centro?.organograma_node_id) ?? null;
  return {
    pessoaId: ficha.pessoa.id,
    nome: ficha.pessoa.nome_completo,
    cargo: ficha.pessoa.cargo,
    centroId: centro?.id ?? null,
    centro: centro?.nome ?? null,
    filialId: filial?.id ?? null,
    filial: filial?.name ?? null,
    tipoContrato: tipoDeContrato(ficha),
    retribuicaoMes,
    horasSemanais: horasSemanaisDaFicha(ficha),
  };
}
