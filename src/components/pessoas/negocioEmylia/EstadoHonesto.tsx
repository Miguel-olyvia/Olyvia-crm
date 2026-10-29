// O que o Pipeline não pode mostrar, dito em texto: sem números de exemplo a parecerem reais (sem orçamento, sem contrato, só de leitura…).
// F3 (28/10, 20261231999700): o Financeiro já está na base (neg_registar_fatura, neg_validar_pagamento, neg_anular_contrato): a fatura, o
// pagamento, o recibo, a encomenda de cliente e a anulação mostram-se pelos passos da Emylia, já não por aqui.
// Os textos são das traduções (pessoasPagina.real.neg.*); o chamador passa-os já traduzidos.
import type { ReactNode } from "react";

interface EstadoHonestoProps {
  titulo: string;
  children?: ReactNode;
}

export function EstadoHonesto({ titulo, children }: EstadoHonestoProps) {
  return (
    <div role="status" className="rounded-xl border border-dashed border-border bg-muted/40 p-4 text-[15px]">
      <p className="font-medium text-foreground">{titulo}</p>
      {children ? <p className="mt-1 text-muted-foreground">{children}</p> : null}
    </div>
  );
}
