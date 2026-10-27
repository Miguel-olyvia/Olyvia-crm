// "Receber" numa PO (lista, folha e menu): vai direto para Armazém › Receção com a PO escolhida (16/10, em vez do diálogo).
import { poPorId } from "./base";
import { useCtxInv } from "./ctxInv";
import { abrirRececaoDaPo } from "./rececao";
import type { Po } from "./tipos";

export function useIrReceber(): (id: string) => void {
  const { agir, ir } = useCtxInv();
  return (id) => {
    const r = agir((d) => abrirRececaoDaPo(d, poPorId(d, id) as Po));
    if (r.ok) ir({ aba: "guia" });
  };
}
