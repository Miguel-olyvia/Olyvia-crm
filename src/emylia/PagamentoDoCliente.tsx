// 3/11 (Rúben): o passo "Pagamento" do Financeiro já não é um formulário. A fatura vai ao portal do cliente com a referência para pagar;
// o cliente diz no portal que pagou (a data e a referência ficam no negócio: A.avisarPagamento) e só então o Financeiro valida, à mão,
// enquanto não houver Eticadata. Validar emite o recibo e passa o negócio à Obra (A.validar).
import { Check, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { eur, valorSinal, type Negocio } from "./motor";
import { PAGAMENTO_EMPRESA, em3, metodoDe, referenciaMb } from "./pagamentoCliente";
import type { Ctx } from "./pecas";

const dataPt = (iso?: string) => (iso ? iso.split("-").reverse().join("/") : "");

/** O estado do pagamento pedido ao cliente: a fatura, o valor e como paga; à espera, ou com o aviso do cliente e o botão de validar. */
export function PagamentoDoCliente({ S, A, run, d }: Ctx & { d: Negocio }) {
  const ft = d.fin.fatura;
  if (!ft) return <p className="text-[15px] text-muted-foreground">A fatura ainda não foi emitida. O pagamento pede-se ao cliente quando ela for para o portal.</p>;
  const metodo = metodoDe(d.f.metodo), valor = valorSinal(d, S), avisou = !!d.f.comprovativo;
  const linhas: [string, string][] = [
    ["Fatura", ft.n],
    ["Valor a pagar", eur(valor) + " € com IVA"],
    ["Como paga", d.f.metodo ? metodo : "o cliente escolhe no portal"],
    ...(metodo === "Referência MB" ? [["Entidade · referência", `${PAGAMENTO_EMPRESA.entidade} · ${em3(referenciaMb(d.id, ft.n))}`] as [string, string]] : []),
    ...(metodo === "Transferência" ? [["IBAN", PAGAMENTO_EMPRESA.iban] as [string, string]] : []),
  ];
  return (
    <div className="max-w-xl space-y-6">
      <dl className="divide-y divide-border rounded-2xl border border-border bg-card px-5">
        {linhas.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-4 py-3 text-[15px]">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-right font-medium tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      {d.fin.pago ? (
        <p className="flex items-start gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-[15px] text-emerald-900">
          <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Pagamento validado{d.fin.recibo ? ` · ${d.fin.recibo.n}` : ""}.
        </p>
      ) : avisou ? (
        <div className="space-y-4">
          <p className="rounded-xl bg-primary/[0.06] px-4 py-3 text-[15px]">
            O cliente diz no portal que pagou{d.f.data_pag ? ` a ${dataPt(d.f.data_pag)}` : ""}: <span className="font-medium">{d.f.comprovativo}</span>.
            <span className="mt-1 block text-muted-foreground">Confirme que o valor entrou na conta. Ao validar sai o recibo e o negócio passa à Obra.</span>
          </p>
          <Button size="lg" onClick={() => run(() => A.validar(d.id))}>Validar pagamento</Button>
        </div>
      ) : (
        <p className="flex items-start gap-2 rounded-xl bg-muted px-4 py-3 text-[15px]">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span>
            À espera do cliente. A fatura está no portal com a referência para pagar.
            <span className="mt-1 block text-muted-foreground">Quando o cliente disser no portal que pagou, aparece aqui para validar.</span>
          </span>
        </p>
      )}
    </div>
  );
}
