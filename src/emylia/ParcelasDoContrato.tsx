// 19/11/2026 (Rúben): as parcelas do contrato no negócio (o passo «Pagamentos» da Obra). Cada parcela diz quando cai no Financeiro e em
// que estado está; a que é a vez tem o registo da fatura do Eticadata e, registada, o «Ok, já foi paga». A 1.ª é a do passo Fatura.
import { useId, useState, type FormEvent } from "react";
import { Check, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { eur, type Negocio } from "./motor";
import type { Ctx } from "./pecas";
import { SEM_PERM, podeNeg } from "./permissoes";
import { parcelasDoContrato, type MomentoParcela, type Parcela } from "./parcelas";

/** Quando cai cada parcela, como se diz ao Financeiro. */
export const QUANDO_CAI: Record<MomentoParcela, string> = {
  inicio: "No início, antes de tudo",
  arranque: "Ao carregar em «Arrancar a obra»",
  obra: "Com a obra a andar",
  fim: "No fim, antes da entrega (sem ela não há auto de receção)",
};

function RegistarParcela({ ctx, d, x }: { ctx: Ctx; d: Negocio; x: Parcela }) {
  const { A, run, S } = ctx;
  const [numero, setNumero] = useState("");
  const id = useId();
  const pode = podeNeg(S.role, "finance.invoice");
  const registar = (e: FormEvent) => { e.preventDefault(); if (pode && numero.trim()) run(() => { if (A.registarFaturaParcela(d.id, x.id, numero)) setNumero(""); }); };
  if (!pode) return <p className="text-sm text-muted-foreground">{SEM_PERM["finance.invoice"].sub}</p>;
  return (
    <form onSubmit={registar} className="flex w-full flex-wrap gap-2" aria-label={`Registar a fatura da parcela ${x.i + 1}`}>
      <label className="sr-only" htmlFor={id}>Número da fatura no Eticadata</label>
      <input id={id} value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="FAT 15200126/538" autoComplete="off"
        className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-[15px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 sm:max-w-xs" />
      <Button type="submit" size="lg" disabled={!numero.trim()}>Registar a fatura</Button>
    </form>
  );
}

/** As parcelas do contrato, pela ordem, com o que falta em cada uma. */
export function ParcelasDoContrato({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const { A, run, S } = ctx;
  const P = parcelasDoContrato(S, d);
  const podeValidar = podeNeg(S.role, "finance.validate_payment");
  if (P.length < 2) return <p className="text-[15px] text-muted-foreground">Pagamento único, no início: está no passo Fatura do Financeiro.</p>;
  return (
    <ol className="space-y-3" aria-label="Parcelas do contrato">
      {P.map((x) => {
        const estado = x.paga ? "paga" : x.fatura ? `fatura ${x.fatura.numero} por pagar` : x.devida ? "por faturar" : "ainda não é a vez";
        return (
          <li key={x.id} className={cn("rounded-2xl border p-4", x.devida && !x.paga ? "border-primary/40 bg-primary/[0.04]" : "border-border bg-card")}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[17px] font-semibold tracking-tight">{x.i + 1}.ª parcela · {String(Math.round(x.p * 10000) / 100).replace(".", ",")}% · <span className="tabular-nums">{eur(x.v)} €</span></p>
              <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-medium",
                x.paga ? "bg-success/15 text-success" : x.devida ? "bg-warning/15 text-foreground" : "bg-muted text-muted-foreground")}>
                {x.paga ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Clock className="h-3.5 w-3.5" aria-hidden />}{estado}
              </span>
            </div>
            <p className="mt-1 text-[15px] text-muted-foreground">{x.l} · {QUANDO_CAI[x.momento]}{x.paga && x.fatura?.recibo ? ` · recibo ${x.fatura.recibo}` : ""}</p>
            {x.i > 0 && x.devida && !x.paga && (
              <div className="mt-3 space-y-2">
                {!x.fatura ? (
                  <>
                    <p className="text-[15px]">Emita-a no Eticadata e escreva aqui o número: vai para o portal do cliente, com os dados para pagar.</p>
                    <RegistarParcela ctx={ctx} d={d} x={x} />
                  </>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <Button size="lg" disabled={!podeValidar} onClick={() => run(() => A.validarParcela(d.id, x.id))}>Ok, já foi paga</Button>
                    <span className="text-sm text-muted-foreground">{x.momento === "arranque" ? "Paga, as Operações arrancam a obra." : x.momento === "fim" ? "Paga, o auto de receção vai ao cliente." : "A fatura está no portal do cliente."}</span>
                    {!podeValidar && <p className="w-full text-sm text-muted-foreground">{SEM_PERM["finance.validate_payment"].sub}</p>}
                  </div>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
