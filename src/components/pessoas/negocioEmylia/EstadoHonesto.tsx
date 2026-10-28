// O que o Pipeline não pode mostrar ainda, dito em texto: sem números de exemplo a parecerem reais. As funções das fases 2 a 5 do plano do Ben
// (neg_registar_fatura, neg_anular_contrato, abrir a obra) ainda não estão na base; até existirem, o que depende delas diz que não está disponível.
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
