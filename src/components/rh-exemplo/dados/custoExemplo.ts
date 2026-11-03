/**
 * Os valores avulsos de exemplo do custo (quilómetros e ajudas de custo) de Setembro de 2026. São pagos de uma vez, na sua
 * data. Tudo inventado, só em memória; os valores avulsos reais são os lançamentos do processamento (da base).
 *
 * Os equipamentos e as exceções de taxa de exemplo foram retirados: equipamentos, taxas e exceções vêm da base.
 */
import { contaUmaVez } from "@/components/rh-exemplo/lib/comoConta";
import type { AvulsoCusto } from "@/components/rh-exemplo/lib/custoMes";

/** O mês dos valores avulsos de exemplo: o mesmo do «Cálculo do mês» (`MES_PROCESSAVEL`). */
const MES_EXEMPLO = "2026-09";
const AUTOR = "Sofia Rebelo";

export function avulsosIniciais(): AvulsoCusto[] {
  const base = { conta: contaUmaVez(), autor: AUTOR, criadoEm: `${MES_EXEMPLO}-28T10:00:00.000Z`, anulado: null };
  const km = (id: string, pessoaId: string, dia: string, descricao: string, kms: number): AvulsoCusto =>
    ({ ...base, id, pessoaId, tipo: "km", data: `${MES_EXEMPLO}-${dia}`, descricao, quantidade: kms, valorUnitario: 0.4, valor: Math.round(kms * 40) / 100 });
  const ajuda = (id: string, pessoaId: string, dia: string, descricao: string, dias: number): AvulsoCusto =>
    ({ ...base, id, pessoaId, tipo: "ajuda", data: `${MES_EXEMPLO}-${dia}`, descricao, quantidade: dias, valorUnitario: 25, valor: dias * 25 });
  return [
    km("cu-1", "p-tiago", "09", "Visita ao cliente do Porto", 120),
    ajuda("cu-2", "p-tiago", "09", "Deslocação a feira", 2),
    km("cu-4", "p-hugo", "16", "Entrega de encomenda em Braga", 85),
    km("cu-5", "p-rui", "21", "Reunião com fornecedor em Setúbal", 60),
    ajuda("cu-6", "p-ines", "23", "Formação em Lisboa", 1),
    ajuda("cu-7", "p-andre", "11", "Descarga fora do horário", 1),
  ];
}
