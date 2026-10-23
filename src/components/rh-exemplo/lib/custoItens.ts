/**
 * O que conta no mês no custo de uma pessoa, item a item (equipamentos e valores avulsos), cada um com o seu «como conta».
 * Serve a linha aberta do módulo «Custos». A soma dos `valorMes` é o que o `custoDoMes` da ficha põe em avulsos e equipamentos.
 */
import type { ContaItem } from "./comoConta";
import type { MesIso } from "./custo";
import { avulsosAtivos, valorDoAvulsoNoMes, type AvulsoCusto } from "./custoMes";
import { valorDoEquipamentoNoMes, type EquipamentoPessoa } from "./equipamentos";

export interface ItemDoMes {
  id: string;
  tipo: "equipamento" | "avulso";
  descricao: string;
  valorMes: number;
  conta: ContaItem;
}

export function itensDoMes(
  pessoaId: string,
  equipamentos: readonly EquipamentoPessoa[],
  avulsos: readonly AvulsoCusto[],
  mes: MesIso,
): ItemDoMes[] {
  const doEquipamento = equipamentos
    .filter((e) => e.pessoaId === pessoaId)
    .map((e): ItemDoMes => ({ id: e.id, tipo: "equipamento", descricao: e.descricao, valorMes: valorDoEquipamentoNoMes(e, mes), conta: e.conta }));
  const doAvulso = avulsosAtivos(avulsos)
    .filter((a) => a.pessoaId === pessoaId)
    .map((a): ItemDoMes => ({ id: a.id, tipo: "avulso", descricao: a.descricao, valorMes: valorDoAvulsoNoMes(a, mes), conta: a.conta }));
  return [...doEquipamento, ...doAvulso].filter((i) => i.valorMes > 0);
}
