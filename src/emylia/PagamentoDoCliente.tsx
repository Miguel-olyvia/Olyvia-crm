// 3/11 (Rúben): o passo "Pagamento" do Financeiro já não é um formulário. A fatura (registada com o número do Eticadata) vai ao portal
// do cliente com os dados para pagar. A Olyvia segue o estado no Eticadata (verificarErp: paga no ERP → recibo e Obra); o cliente pode
// avisar no portal que pagou (avisarPagamento); e validar à mão é opcional, a qualquer momento (validar). Paga por qualquer dos caminhos,
// aparece como paga também ao cliente, no portal.
import { useId } from "react";
import { Check, Clock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { eur, valorSinal, type Negocio } from "./motor";
import { resumoErp } from "./erpEticadata";
import { em3, ibanAVista, metodoDe, referenciaMb, useDadosPagamento } from "./pagamentoCliente";
import type { Ctx } from "./pecas";
import { SEM_PERM, podeNeg } from "./permissoes";

const dataPt = (iso?: string) => (iso ? iso.split("-").reverse().join("/") : "");

/** O estado do pagamento: a fatura, o valor e como o cliente paga; o que diz o Eticadata, o aviso do cliente e o validar à mão. */
export function PagamentoDoCliente({ S, A, run, d }: Ctx & { d: Negocio }) {
  const empresa = useDadosPagamento();
  // 5/11: validar pede finance.validate_payment (o motor recusa sem ela, e o servidor também: negocios.validar_pagamento); o botão
  // diz isso antes do clique, como o BotaoFase (PaginaNegocio.tsx, PERM_DO_PASSO). Com as permissões reais, é a base que responde.
  const idSemPerm = useId();
  const podeValidar = podeNeg(S.role, "finance.validate_payment");
  const ft = d.fin.fatura;
  if (!ft) return <p className="text-[15px] text-muted-foreground">Primeiro regista-se a fatura, no passo «Fatura». Depois fica aqui o pagamento.</p>;
  const metodo = metodoDe(d.f.metodo), valor = valorSinal(d, S), avisou = !!d.f.comprovativo && !d.fin.pago;
  const linhas: [string, string][] = [
    ["Fatura", ft.n],
    ["Valor a pagar", eur(valor) + " € com IVA"],
    ["Como paga", d.f.metodo ? metodo : "o cliente escolhe no portal"],
    ...(metodo === "Referência MB" ? [["Entidade · referência", `${empresa?.mbEntidade ?? "sem entidade"} · ${em3(referenciaMb(d.id, ft.n))}`] as [string, string]] : []),
    ...(metodo === "MB Way" ? [["MB Way para", empresa?.mbway ?? "sem número"] as [string, string]] : []),
    ...(metodo === "Transferência" ? [["IBAN", empresa?.iban ? ibanAVista(empresa.iban) : "ainda não indicado"] as [string, string]] : []),
    ["No Eticadata", d.fin.erp ? resumoErp(d.fin.erp) : "ainda não lido aqui (a Olyvia verifica sozinha de 10 em 10 minutos)"],
  ];
  return (
    <div className="max-w-xl space-y-6">
      {!empresa?.iban && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-[15px] text-amber-900">
          A empresa ainda não tem o IBAN para o cliente pagar. Indique-o em Pessoas, Workflow, separador «Pagamentos».
        </p>
      )}
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
          Paga{d.fin.recibo ? ` · ${d.fin.recibo.n}` : ""}{d.f.comprovativo ? ` · ${d.f.comprovativo}` : ""}. O cliente vê-a como paga no portal.
        </p>
      ) : (
        <div className="space-y-4">
          {avisou ? (
            <p className="rounded-xl bg-primary/[0.06] px-4 py-3 text-[15px]">
              O cliente diz no portal que pagou{d.f.data_pag ? ` a ${dataPt(d.f.data_pag)}` : ""}: <span className="font-medium">{d.f.comprovativo}</span>.
            </p>
          ) : (
            <p className="flex items-start gap-2 rounded-xl bg-muted px-4 py-3 text-[15px]">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span>
                À espera do pagamento. A fatura está no portal do cliente, com os dados para pagar.
                <span className="mt-1 block text-muted-foreground">Quando o Eticadata a der como paga, o negócio avança sozinho. Validar à mão é opcional.</span>
              </span>
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button size="lg" variant={avisou ? "default" : "outline"} disabled={!podeValidar} aria-describedby={podeValidar ? undefined : idSemPerm}
              onClick={() => run(() => A.validar(d.id))}>{avisou ? "Validar pagamento" : "Validar à mão"}</Button>
            <Button size="lg" variant="ghost" onClick={() => run(() => A.verificarErp(d.id))}><RefreshCw className="mr-2 h-4 w-4" aria-hidden />Verificar no Eticadata</Button>
          </div>
          {!podeValidar && <p id={idSemPerm} className="text-sm text-muted-foreground">{SEM_PERM["finance.validate_payment"].sub}</p>}
        </div>
      )}
    </div>
  );
}
