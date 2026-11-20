// As adendas no Financeiro do negócio (21/10/2026): cada adenda assinada fatura-se e paga-se nas mesmas parcelas do contrato
// (decisão C: uma fatura por parcela, por omissão 50% na adjudicação + 50% no fim); com a 1.ª parcela paga, os materiais dela vão
// numa encomenda própria para o Inventário (decisão B, como no contrato: nada se encomenda antes do pagamento).
// 20/11 (auditoria F10): as linhas são as da lista «Pagamentos» (Pagamentos.tsx), a mesma do Financeiro e da Obra: uma por parcela, com
// um só botão (registar o número do Eticadata → «Ok, já foi paga»). A Olyvia não emite faturas em nenhuma versão.
import type { Negocio } from "./motor";
import type { Ctx } from "./pecas";
import { assinadas } from "./adendas";
import { Pagamentos } from "./Pagamentos";

export function AdendasNoFinanceiro({ ctx, d }: { ctx: Ctx; d: Negocio; /** 19/11: já não muda nada (a fatura regista-se igual em todas as versões) */ v2?: boolean }) {
  if (!assinadas(d).length) return null;
  return (
    <section aria-labelledby={`fin-ad-${d.id}`} className="space-y-4">
      <div>
        <h3 id={`fin-ad-${d.id}`} className="text-[17px] font-semibold tracking-tight">Adendas ao contrato</h3>
        <p className="text-[15px] text-muted-foreground">Cada adenda assinada fatura-se e paga-se à parte, nas mesmas parcelas do contrato (uma fatura por parcela). Com a 1.ª parcela paga, os materiais dela vão numa encomenda própria para o Inventário.</p>
      </div>
      <Pagamentos ctx={ctx} d={d} so="adendas" />
    </section>
  );
}
