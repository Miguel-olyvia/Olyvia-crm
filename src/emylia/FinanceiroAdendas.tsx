// As adendas no Financeiro do negócio (21/10/2026): cada adenda assinada fatura-se e paga-se nas mesmas parcelas do contrato
// (decisão C: uma fatura por parcela, por omissão 50% na adjudicação + 50% no fim); com a 1.ª parcela paga, os materiais dela vão
// numa encomenda própria para o Inventário (decisão B, como no contrato: nada se encomenda antes do pagamento).
// As ações são as do motor (faturarAdendas / faturarParcelaAdenda, validarPagamentosAdenda; na V2, registarFaturaAdenda): aqui só se
// desenha o caminho, um passo por parcela (a fatura e o pagamento) e a encomenda.
import { useState, type ReactNode } from "react";
import { Check, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { eur, type Negocio } from "./motor";
import type { Ctx } from "./pecas";
import { assinadas, faturaAValidar, nomeParcela, parcelaFaturavel, parcelasAdenda, primeiraPaga, proximaParcela, totaisAdenda, type Adenda, type ParcelaAdenda } from "./adendas";
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

/** V2: o número da fatura emitida no programa certificado, registado na Olyvia (a da parcela seguinte). */
function RegistarFatura({ ctx, d, a, x }: { ctx: Ctx; d: Negocio; a: Adenda; x: ParcelaAdenda }) {
  const [num, setNum] = useState("");
  const id = `ft-ad-${a.n.replace(/\W/g, "")}-${x.i}`;
  return (
    <div className="mt-2 flex flex-wrap items-end gap-2">
      <label htmlFor={id} className="text-sm">
        <span className="block text-muted-foreground">Número da fatura da adenda {a.n}{x.i > 0 ? ` (${nomeParcela(x.i)})` : ""}</span>
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
        <h3 id={`fin-ad-${d.id}`} className="text-[17px] font-semibold tracking-tight">Adendas ao contrato</h3>
        <p className="text-[15px] text-muted-foreground">Cada adenda assinada fatura-se e paga-se à parte, nas mesmas parcelas do contrato (uma fatura por parcela). Com a 1.ª parcela paga, os materiais dela vão numa encomenda própria para o Inventário.</p>
      </div>
      {L.map((a) => {
        const ea = ecDaAdenda(d, a.n), pend = porEncomendarDe(d, a.n).length, T = totaisAdenda(a), P = parcelasAdenda(d, a), prox = proximaParcela(d, a);
        // 21/10: como no contrato: a seguinte só depois de paga a 1.ª (a do fim, com a obra concluída); valida-se pela ordem das parcelas
        const fat = parcelaFaturavel(d, a), aValidar = faturaAValidar(a);
        return (
          <div key={a.n} className="rounded-2xl border border-border bg-card p-4" data-testid={`fin-adenda-${a.n}`}>
            <p className="text-[15px] font-semibold">Adenda {a.n} <span className="font-normal tabular-nums text-muted-foreground">· {eur(T.total)} € com IVA ({eur(T.mo)} € de mão de obra + IVA a 6%{T.mat > 0 ? `, ${eur(T.mat)} € de materiais + IVA a 23%` : ""})</span></p>
            <ol className="mt-1 divide-y divide-border">
              {P.flatMap((x) => {
                const f = x.ft, nome = `${nomeParcela(x.i)} (${x.l.toLowerCase()}, ${Math.round(x.p * 100)}%) · ${eur(x.v)} €`;
                return [
                  <Passo key={"f" + x.i} feito={!!f} titulo={f ? `Fatura ${f.n} ${v2 ? "registada" : "emitida"} · ${nomeParcela(x.i)}` : `${v2 ? "Registar" : "Emitir"} a fatura da ${nome}`}
                    texto={f ? `A ${f.q}, no portal do cliente · ${eur(f.v)} €.` : prox?.i !== x.i ? "Depois da parcela anterior." : fat.motivo ? fat.motivo : v2 ? "Emita-a no programa de faturação certificado e registe-a aqui." : "Só o Financeiro emite. Vai para o portal do cliente."}>
                    {!f && prox?.i === x.i && fin && (v2
                      ? (fat.motivo ? null : <RegistarFatura ctx={ctx} d={d} a={a} x={x} />)
                      : <Button size="sm" className="mt-2 min-h-10" disabled={!!fat.motivo} onClick={go(() => (x.i === 0 ? A.faturarAdendas(d.id, a.n) : A.faturarParcelaAdenda(d.id, a.n)))}>Emitir a fatura</Button>)}
                  </Passo>,
                  <Passo key={"p" + x.i} feito={!!f?.recibo} titulo={f?.recibo ? `Pagamento validado · recibo ${f.recibo.n}` : `Validar o pagamento da ${nomeParcela(x.i)}`}
                    texto={f?.recibo ? `Confirmado a ${f.recibo.q}${f.pag?.comprovativo ? " · " + f.pag.comprovativo : ""}.` : !f ? "Depois da fatura."
                      : aValidar.f?.n !== f.n ? `Depois do pagamento da ${nomeParcela(0)}.`
                      : f.pag?.comprovativo ? `O cliente avisou no portal: ${f.pag.comprovativo}.` : "Confirmar que o valor entrou (o cliente paga no portal ou por transferência)."}>
                    {f && !f.recibo && fin && <Button size="sm" className="mt-2 min-h-10" disabled={aValidar.f?.n !== f.n} onClick={go(() => A.validarPagamentosAdenda(d.id, a.n))}>Validar o pagamento</Button>}
                  </Passo>,
                  ...(x.i === 0 ? [
                    <Passo key="ec" feito={!!ea || !pend} titulo={ea ? `Encomenda ${ea.n} no Inventário` : pend ? "Encomenda dos materiais da adenda" : "Sem materiais a encomendar"}
                      texto={ea ? `${ea.linhas.length} ${ea.linhas.length === 1 ? "material" : "materiais"} · ${eur(ea.valor)} € sem IVA.` : !pend ? "Só mão de obra." : primeiraPaga(a) ? "A 1.ª parcela está paga: emite-se logo a seguir à encomenda de cliente inicial." : EC_ADENDA_NO_PAGAMENTO} />,
                  ] : []),
                ];
              })}
            </ol>
          </div>
        );
      })}
    </section>
  );
}
