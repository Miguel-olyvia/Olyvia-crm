// As adendas no Financeiro do negócio (21/10/2026): cada adenda assinada tem a sua fatura, o seu pagamento e, com ele validado, a
// encomenda dos materiais dela no Inventário (decisão B, como no contrato: nada se encomenda antes do pagamento).
// As ações são as do motor (faturarAdendas, validarPagamentosAdenda; na V2, registarFaturaAdenda): aqui só se desenha o caminho.
import { useState, type ReactNode } from "react";
import { Check, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { eur, type Negocio } from "./motor";
import type { Ctx } from "./pecas";
import { assinadas, totalAdenda, totalComIva, type Adenda } from "./adendas";
import { ecDaAdenda, porEncomendarDe } from "./encomendasAjuste";
import { EC_ADENDA_NO_PAGAMENTO } from "./preparacaoObra";

function Passo({ feito, titulo, texto, children }: { feito: boolean; titulo: string; texto: string; children?: ReactNode }) {
  return (
    <li className="flex gap-3 py-3">
      <span className={cn("mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-colors duration-500",
        feito ? "border-success bg-success text-white" : "border-input text-transparent")}>
        {feito ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Circle className="h-2 w-2" aria-hidden="true" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium">{titulo}<span className="sr-only">{feito ? " (feito)" : " (por fazer)"}</span></span>
        <span className="block text-[15px] text-muted-foreground">{texto}</span>
        {children}
      </span>
    </li>
  );
}

/** V2: o número da fatura emitida no programa certificado, registado na Olyvia. */
function RegistarFatura({ ctx, d, a }: { ctx: Ctx; d: Negocio; a: Adenda }) {
  const [num, setNum] = useState("");
  const id = `ft-ad-${a.n.replace(/\W/g, "")}`;
  return (
    <div className="mt-2 flex flex-wrap items-end gap-2">
      <label htmlFor={id} className="text-sm">
        <span className="block text-muted-foreground">Número da fatura da adenda {a.n}</span>
        <input id={id} value={num} onChange={(e) => setNum(e.target.value)} placeholder="FT 2026/…" className="mt-1 h-11 w-44 rounded-lg border border-input bg-card px-3 text-[15px]" />
      </label>
      <Button className="min-h-11" variant="outline" disabled={!num.trim()} onClick={() => ctx.run(() => { ctx.A.registarFaturaAdenda(d.id, a.n, num); })}>Registar a fatura</Button>
    </div>
  );
}

export function AdendasNoFinanceiro({ ctx, d, v2 = false }: { ctx: Ctx; d: Negocio; v2?: boolean }) {
  const { S, A, go } = ctx;
  const L = assinadas(d);
  if (!L.length) return null;
  const fin = S.role === "financeiro";
  return (
    <section aria-labelledby={`fin-ad-${d.id}`} className="space-y-6">
      <div>
        <h3 id={`fin-ad-${d.id}`} className="text-base font-semibold">Adendas ao contrato</h3>
        <p className="text-[15px] text-muted-foreground">Cada adenda assinada fatura-se e paga-se à parte. Com o pagamento validado, os materiais dela vão numa encomenda própria para o Inventário.</p>
      </div>
      {L.map((a) => {
        const ea = ecDaAdenda(d, a.n), pend = porEncomendarDe(d, a.n).length;
        return (
          <div key={a.n} className="rounded-2xl border border-border bg-card p-4" data-testid={`fin-adenda-${a.n}`}>
            <p className="text-[15px] font-semibold">Adenda {a.n} <span className="font-normal tabular-nums text-muted-foreground">· {eur(totalComIva(a.linhas))} € com IVA ({eur(totalAdenda(a.linhas))} € + IVA a 6%)</span></p>
            <ol className="mt-1 divide-y divide-border">
              <Passo feito={!!a.fatura} titulo={a.fatura ? `Fatura ${a.fatura.n} ${v2 ? "registada" : "emitida"}` : v2 ? "Registar a fatura" : "Emitir a fatura"}
                texto={a.fatura ? `A ${a.fatura.q}, no portal do cliente.` : v2 ? "Emita-a no programa de faturação certificado e registe-a aqui." : "Só o Financeiro emite. Vai para o portal do cliente."}>
                {!a.fatura && fin && (v2
                  ? <RegistarFatura ctx={ctx} d={d} a={a} />
                  : <Button size="sm" className="mt-2 min-h-10" onClick={go(() => A.faturarAdendas(d.id))}>Emitir a fatura</Button>)}
              </Passo>
              <Passo feito={!!a.recibo} titulo={a.recibo ? `Pagamento validado · recibo ${a.recibo.n}` : "Validar o pagamento"}
                texto={a.recibo ? `Confirmado a ${a.recibo.q}${a.pag?.comprovativo ? " · " + a.pag.comprovativo : ""}.` : !a.fatura ? "Depois da fatura." : a.pag?.comprovativo ? `O cliente avisou no portal: ${a.pag.comprovativo}.` : "À espera do pagamento no portal do cliente."}>
                {a.fatura && !a.recibo && a.pag?.comprovativo && fin && <Button size="sm" className="mt-2 min-h-10" onClick={go(() => A.validarPagamentosAdenda(d.id))}>Validar o pagamento</Button>}
              </Passo>
              <Passo feito={!!ea || !pend} titulo={ea ? `Encomenda ${ea.n} no Inventário` : pend ? "Encomenda dos materiais da adenda" : "Sem materiais a encomendar"}
                texto={ea ? `${ea.linhas.length} ${ea.linhas.length === 1 ? "material" : "materiais"} · ${eur(ea.valor)} € sem IVA.` : !pend ? "Só mão de obra." : a.recibo ? "O pagamento está validado: emite-se logo a seguir à encomenda de cliente inicial." : EC_ADENDA_NO_PAGAMENTO} />
            </ol>
          </div>
        );
      })}
    </section>
  );
}
