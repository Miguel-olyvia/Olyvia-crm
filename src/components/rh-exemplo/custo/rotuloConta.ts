/** O texto curto de «Como conta» de um valor, para as listas: «Pago de uma vez», «Repartido por 36 meses», «Todos os meses, desde …». */
import type { ContaItem } from "@/components/rh-exemplo/lib/comoConta";
import type { AtivoDoEquipamento } from "@/components/rh-exemplo/lib/equipamentos";
import { euros, nomeDoMes } from "./formato";

type Traduzir = (chave: string, parametros?: Record<string, string | number>) => string;

export function rotuloDaConta(t: Traduzir, conta: ContaItem, lingua: string): string {
  if (conta.modo === "umaVez") return t("rhCustos.conta.umaVez");
  if (conta.modo === "repartido") return conta.meses === 1 ? t("rhCustos.conta.repartido1") : t("rhCustos.conta.repartidoN", { n: conta.meses });
  const mes = conta.inicio ? nomeDoMes(conta.inicio, lingua) : "";
  return conta.fim
    ? t("rhCustos.conta.todosMesesAte", { mes, fim: nomeDoMes(conta.fim, lingua) })
    : t("rhCustos.conta.todosMesesDesde", { mes });
}

/**
 * O texto de «Como conta» de uma linha do RH. Com ativo vem do ativo e nunca de `conta_*`: «Comprado, 36 meses» ou «Alugado, 450,00 € por
 * mês». Sem ativo (a farda) é o «como conta» da linha.
 */
export function rotuloDoEquipamento(t: Traduzir, e: { conta: ContaItem; ativo?: AtivoDoEquipamento | null }, lingua: string): string {
  const a = e.ativo;
  if (!a) return rotuloDaConta(t, e.conta, lingua);
  if (a.forma === "alugado") return t("rhCustos.conta.ativoAlugado", { valor: euros(a.rendaMensal, "—") });
  return a.vidaMeses ? t("rhCustos.conta.ativoComprado", { n: a.vidaMeses }) : t("rhCustos.conta.ativoCompradoSemVida");
}
