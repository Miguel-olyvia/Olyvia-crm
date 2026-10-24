/** O texto curto de «Como conta» de um valor, para as listas: «Pago de uma vez», «Repartido por 36 meses», «Todos os meses, desde …». */
import type { ContaItem } from "@/components/rh-exemplo/lib/comoConta";
import { nomeDoMes } from "./formato";

type Traduzir = (chave: string, parametros?: Record<string, string | number>) => string;

export function rotuloDaConta(t: Traduzir, conta: ContaItem, lingua: string): string {
  if (conta.modo === "umaVez") return t("rhCustos.conta.umaVez");
  if (conta.modo === "repartido") return conta.meses === 1 ? t("rhCustos.conta.repartido1") : t("rhCustos.conta.repartidoN", { n: conta.meses });
  const mes = conta.inicio ? nomeDoMes(conta.inicio, lingua) : "";
  return conta.fim
    ? t("rhCustos.conta.todosMesesAte", { mes, fim: nomeDoMes(conta.fim, lingua) })
    : t("rhCustos.conta.todosMesesDesde", { mes });
}
