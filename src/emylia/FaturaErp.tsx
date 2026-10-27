// 22/10/2026: a fatura do Eticadata no V1. O Financeiro emite no ERP e escreve aqui o número; a Olyvia lê no ERP o estado (erpEticadata.ts)
// e, quando estiver paga, o negócio passa à Obra com o recibo do ERP. Sem ligação ao ERP, regista-se na mesma e valida-se à mão.
import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { eur, type Negocio } from "./motor";
import type { Ctx } from "./pecas";
import { lerFaturaErp, resumoErp } from "./erpEticadata";

/** De quanto em quanto tempo a Olyvia volta a ler o ERP enquanto a fatura está por pagar e o negócio está aberto. */
const INTERVALO_MS = 60_000;
const dmy = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "—");

/** O passo «Registar a fatura do ERP»: o número da fatura emitida no Eticadata; confirma-a no ERP antes de a registar. */
export function RegistarFaturaErp({ ctx, d, tamanho = "lg", aEsquerda = false }: { ctx: Ctx; d: Negocio; tamanho?: "lg" | "default"; aEsquerda?: boolean }) {
  const { A, go } = ctx;
  const [numero, setNumero] = useState("");
  const [aLer, setALer] = useState(false);
  const [erro, setErro] = useState<{ msg: string; semLigacao: boolean } | null>(null);
  const registar = async (e: FormEvent) => {
    e.preventDefault();
    const n = numero.trim().replace(/\s+/g, " ");
    if (!n) { setErro({ msg: "Escreva o número da fatura, como aparece no Eticadata.", semLigacao: false }); return; }
    setALer(true); setErro(null);
    const r = await lerFaturaErp(n);
    setALer(false);
    if ("info" in r) { go(() => A.registarFaturaErp(d.id, n, r.info))(); return; }
    setErro({ msg: r.msg, semLigacao: r.motivo === "sem_ligacao" });
  };
  return (
    <form onSubmit={registar} className={cn("grid w-full gap-1.5 sm:w-auto", !aEsquerda && "sm:justify-items-end")} aria-label="Registar a fatura do ERP">
      <div className="flex w-full flex-wrap gap-2 sm:w-auto">
        <label className="sr-only" htmlFor={`fat-erp-${d.id}`}>Número da fatura no Eticadata</label>
        <input id={`fat-erp-${d.id}`} value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="FAT 15200126/538" autoComplete="off"
          className={cn("min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-[15px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 sm:w-56",
            tamanho === "lg" ? "h-11" : "h-10")} aria-invalid={!!erro} aria-describedby={erro ? `fat-erp-erro-${d.id}` : undefined} />
        <Button type="submit" size={tamanho} disabled={aLer}>{aLer ? "A confirmar no ERP…" : "Registar fatura"}<ArrowRight className="ml-2 h-4 w-4" /></Button>
      </div>
      {erro && (
        <p id={`fat-erp-erro-${d.id}`} role="alert" className="text-sm text-destructive">
          {erro.msg}
          {erro.semLigacao && <> <button type="button" className="font-medium underline underline-offset-4" onClick={go(() => A.registarFaturaErp(d.id, numero.trim().replace(/\s+/g, " "), null))}>Registar sem confirmar</button></>}
        </p>
      )}
    </form>
  );
}

/** O estado da fatura no Eticadata (Financeiro do negócio): o que está pago, o que falta, os recibos; volta a ler sozinho a cada minuto. */
export function EstadoFaturaErp({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const { A, go, S } = ctx;
  const i = d.fin.erp, ft = d.fin.fatura, porPagar = !!ft && !d.fin.pago;
  const financeiro = S.role === "financeiro";
  // enquanto o negócio está aberto e a fatura por pagar: lê já e depois a cada minuto (sem avisos, a não ser que o estado mude)
  useEffect(() => {
    if (!porPagar || !i || !financeiro) return;
    const t = setInterval(() => go(() => A.verificarErp(d.id, true))(), INTERVALO_MS);
    return () => clearInterval(t);
  }, [porPagar, !!i, financeiro, d.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ft) return null;
  if (!i) return porPagar ? (
    <p className="rounded-xl border border-border bg-muted/40 p-4 text-[15px] text-muted-foreground">
      A {ft.n} foi registada sem ligação ao Eticadata. A Olyvia vai verificando sozinha se já foi paga, sempre que um PC na rede da empresa tiver a Olyvia aberta; até lá, pode validar o pagamento à mão no passo seguinte.
      {financeiro && <> <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={go(() => A.verificarErp(d.id))}>Verificar no ERP</button></>}
    </p>
  ) : null;
  return (
    <section aria-labelledby={`erp-t-${d.id}`} className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id={`erp-t-${d.id}`} className="text-[17px] font-semibold tracking-tight">No Eticadata</h3>
          <p className="text-[15px] text-muted-foreground">{ft.n}{i.atcud ? ` · ATCUD ${i.atcud}` : ""} · {resumoErp(i)}</p>
        </div>
        <span className={cn("rounded-full px-2.5 py-0.5 text-sm font-medium",
          i.estado === "paga" ? "bg-success/15 text-success" : i.estado === "vencida" || i.estado === "anulada" ? "bg-destructive/10 text-destructive" : "bg-warning/15 text-foreground")}>{i.estado}</span>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-3 text-[15px]">
        <div><dt className="text-muted-foreground">Total</dt><dd className="font-semibold tabular-nums">{eur(i.total)} €</dd></div>
        <div><dt className="text-muted-foreground">Pago</dt><dd className="font-semibold tabular-nums">{eur(i.pago)} €</dd></div>
        <div><dt className="text-muted-foreground">Em falta</dt><dd className="font-semibold tabular-nums">{eur(i.emFalta)} €</dd></div>
      </dl>
      {i.recibos.length > 0 && (
        <ul className="mt-4 divide-y divide-border border-t border-border text-[15px]" aria-label="Recibos no Eticadata">
          {i.recibos.map((r) => (
            <li key={r.n} className="flex flex-wrap justify-between gap-2 py-2">
              <span>{r.n} · {dmy(r.data)}{r.meio ? " · " + r.meio : ""}</span><span className="tabular-nums">{eur(r.valor)} €</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>Lido a {new Date(i.lidaEm).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · {i.bd}{porPagar ? " · volta a ler a cada minuto" : ""}</span>
        {porPagar && financeiro && (
          <span className="flex gap-3">
            <button type="button" className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline" onClick={go(() => A.verificarErp(d.id))}><RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />Verificar agora</button>
            <button type="button" className="font-medium underline-offset-4 hover:underline" onClick={go(() => A.validar(d.id))}>Validar à mão</button>
          </span>
        )}
      </div>
    </section>
  );
}
