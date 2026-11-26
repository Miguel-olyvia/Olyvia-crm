/**
 * O valor atual de um ativo: depreciação linear por tempo, calculada no ecrã (nunca em SQL).
 *
 * É a mesma conta de «repartido por N meses» do RH (`comoConta.ts`): a quota mensal é (compra - residual) / N, arredondada ao
 * cêntimo, e conta a partir do mês da compra (o mês da compra já conta uma quota) até completar os N meses ou até ao mês em que
 * o ativo foi desativado (a desativação corta). No último mês fica o resto, por isso o valor final é exatamente o residual.
 * O `comoConta.ts` limita a 120 meses e os ativos vão até 600, por isso a conta é repetida aqui com os MESMOS blocos
 * (`arredondar`, `quotaMensal`, `indiceDoMes`, `mesDaData`); `valorAtivo.test.ts` confere que dá o mesmo que o RH até 120 meses.
 */
import { quotaMensal } from "@/components/rh-exemplo/lib/comoConta";
import { arredondar, indiceDoMes, mesDaData, type MesIso } from "@/components/rh-exemplo/lib/custo";
import type { Ativo, CatEquipamentoLigado } from "./tipos";

/**
 * O que a conta precisa. Um alugado não tem compra nem data de compra (ambas `null`): não deprecia, e `valorAtual` dá `null`.
 * Um `Ativo` inteiro serve, tal como o `AtivoCompradoConta` do RH.
 */
type ParaValor = Pick<Ativo, "valorResidual" | "vidaMeses" | "desativadoEm"> & {
  valorCompra: number | null;
  dataCompra: string | null;
  catEquipamento?: Pick<CatEquipamentoLigado, "vidaAnos"> | null;
};

/** Os dados de um ativo que deprecia, com compra e data presentes. */
type ParaDepreciar = Omit<ParaValor, "valorCompra" | "dataCompra"> & { valorCompra: number; dataCompra: string };
const deprecia = (a: ParaValor): a is ParaDepreciar => a.valorCompra !== null && a.dataCompra !== null;

/**
 * A vida em meses: a do ativo; sem ela (só nos de serviço), a do modelo do catálogo (anos x 12). `null` quando não há vida em
 * tempo (por exemplo o modelo só tem vida em horas): o ativo não deprecia no tempo.
 */
export function vidaEfetivaMeses(a: ParaValor, catalogo: Pick<CatEquipamentoLigado, "vidaAnos"> | null = a.catEquipamento ?? null): number | null {
  if (!deprecia(a)) return null;
  if (a.vidaMeses !== null && a.vidaMeses > 0) return a.vidaMeses;
  if (catalogo?.vidaAnos && catalogo.vidaAnos > 0) return Math.max(1, Math.round(catalogo.vidaAnos * 12));
  return null;
}

/** A quota que deprecia por mês; `null` quando não há vida em tempo. */
export function depreciacaoMensal(a: ParaValor, catalogo?: Pick<CatEquipamentoLigado, "vidaAnos"> | null): number | null {
  const vida = vidaEfetivaMeses(a, catalogo);
  return vida === null || !deprecia(a) ? null : quotaMensal(Math.max(0, a.valorCompra - a.valorResidual), vida);
}

/** O valor depreciado (o que já «contou») até ao mês `mes` («AAAA-MM»), inclusive. */
function depreciadoAte(a: ParaDepreciar, vida: number, mes: MesIso): number {
  const inicio = indiceDoMes(mesDaData(a.dataCompra));
  const ultimo = a.desativadoEm ? Math.min(inicio + vida - 1, indiceDoMes(mesDaData(a.desativadoEm))) : inicio + vida - 1;
  const meses = Math.max(0, Math.min(indiceDoMes(mes), ultimo) - inicio + 1);
  const base = Math.max(0, a.valorCompra - a.valorResidual);
  // `min(base, …)`: a quota arredondada ao cêntimo vezes os meses pode passar do valor depreciável (1000 € a 600 meses: 1,67 × 599 =
  // 1000,33 €), e o valor atual ficava abaixo do residual. O RH tem o mesmo limite de 120 meses por causa disto; aqui chega ao fim exato.
  return meses >= vida ? arredondar(base) : Math.min(arredondar(base), arredondar(quotaMensal(base, vida) * meses));
}

/**
 * O valor atual no mês `mes`: compra - depreciado. Antes da compra vale a compra; depois da vida, o residual; desativado, o
 * valor do mês da desativação. `null` quando o ativo não deprecia no tempo (sem vida em meses).
 */
export function valorAtual(a: ParaValor, mes: MesIso, catalogo?: Pick<CatEquipamentoLigado, "vidaAnos"> | null): number | null {
  const vida = vidaEfetivaMeses(a, catalogo);
  if (vida === null || !deprecia(a)) return null;
  return arredondar(a.valorCompra - depreciadoAte(a, vida, mes));
}
