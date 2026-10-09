// Financeiro e Obra na proposta simples: estados em frases, listas em vez de
// cartões e tabelas, um botão por coisa.
import { ArrowRight, Check, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TECS, conflitos, eur, fatorReal, nfmt, pct, r2, tot, type Negocio } from "./motor";
import type { Ctx } from "./pecas";
import { FaturaDoc, Partilhar, totais } from "./DocsCliente";

function Passo({ feito, titulo, texto }: { feito: boolean; titulo: string; texto: string }) {
  return (
    <li className="flex gap-3 py-3">
      <span className={cn("mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-colors duration-500",
        feito ? "border-success bg-success text-white" : "border-input text-transparent")}>
        {feito ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Circle className="h-2 w-2" aria-hidden="true" />}
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-medium">{titulo}</span>
        <span className="block text-[15px] text-muted-foreground">{texto}</span>
      </span>
      <span className="sr-only">{feito ? "(feito)" : "(por fazer)"}</span>
    </li>
  );
}

export function DocumentosSimples(ctx: Ctx & { d: Negocio }) {
  const { S, d } = ctx;
  const T = d.orc ? tot(d, S) : null, TI = totais(d, S), ft = d.fin.fatura, rc = d.fin.recibo;
  return (
    <div className="max-w-2xl space-y-8">
      <section aria-label="Valor" className="rounded-2xl border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground">A faturar, com IVA</p>
        <p className="text-3xl font-semibold tabular-nums">{T ? eur(TI.total) : "—"} €</p>
        <p className="mt-1 text-[15px] text-muted-foreground">
          {eur(TI.base)} € sem IVA · IVA de {eur(TI.iva)} € (6% na mão de obra, 23% nos materiais) · {d.f.pagamento || "condições de pagamento por definir"}
        </p>
      </section>
      <section aria-labelledby="fin-t">
        <h3 id="fin-t" className="text-base font-semibold">O que acontece</h3>
        <ol className="mt-1 divide-y divide-border">
          <Passo feito={!!ft} titulo={ft ? `Fatura ${ft.n} emitida` : "Emitir a fatura"} texto={ft ? `A ${ft.q}, enviada ao portal do cliente.` : "Só o Financeiro emite. Vai para o portal do cliente."} />
          <Passo feito={d.fin.pago} titulo={d.fin.pago ? "Pagamento validado" : "Validar o pagamento"} texto={d.fin.pago ? `Confirmado${d.f.data_pag ? " a " + d.f.data_pag.split("-").reverse().join("/") : ""}${d.f.comprovativo ? " · " + d.f.comprovativo : ""}.` : "Confirmar que o valor entrou na conta. Por agora é à mão."} />
          <Passo feito={!!rc} titulo={rc ? `Recibo ${rc.n} emitido` : "Recibo"} texto="Sai sozinho ao validar o pagamento e põe a obra a andar:" />
        </ol>
        <ul className="ml-9 mt-1 space-y-1.5 text-[15px] text-muted-foreground">
          <li className={cn(rc && "text-foreground")}>{rc ? "✓" : "·"} Inventário confirma os materiais e encomenda o que falta</li>
          <li className={cn(rc && "text-foreground")}>{rc ? "✓" : "·"} Operações recebem o plano da obra com os técnicos</li>
          <li className={cn(rc && "text-foreground")}>{rc ? "✓" : "·"} O cliente recebe o recibo no portal</li>
        </ul>
      </section>
      <Partilhar ctx={ctx} d={d} tipo="fatura" estado={rc ? `paga · ${rc.n}` : ft ? `emitida ${ft.q} · por pagar` : "rascunho: ainda não emitida"}>
        <FaturaDoc S={S} d={d} />
      </Partilhar>
    </div>
  );
}

export function ObraSimples({ S, A, go, d }: Ctx & { d: Negocio }) {
  const pl = d.obra.plano!, e = d.obra.enc, R = d.obra.real, T = tot(d, S);
  const horas = pl.tasks.reduce((a, t) => a + t.h, 0), nc = conflitos(pl).length;
  const estado = { "por aprovar": "O plano está à espera das Operações.", aprovado: "Plano aprovado. Falta arrancar.", "em curso": `Obra em curso: dia ${pl.dia + 1}.`, "concluída": "Obra concluída." }[pl.estado];
  const mx = R ? Math.max(...R.tasks.map((t) => Math.max(t.prev, t.real))) : 1;
  return (
    <div className="max-w-3xl space-y-10">
      <section aria-labelledby="plano-t">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 id="plano-t" className="text-base font-semibold">Plano</h3>
          <Button variant="ghost" onClick={go(() => A.abrirPlano(d.id))}>Abrir nas Operações<ArrowRight className="ml-1.5 h-4 w-4" /></Button>
        </div>
        <p className="mt-1 text-[15px]">{estado} <span className="text-muted-foreground">{pl.tasks.length} fases · {nfmt(horas)} h de equipa{nc ? ` · ${nc} conflito por resolver` : ""}</span></p>
        <ol className="mt-3 divide-y divide-border rounded-2xl border border-border bg-card px-4 shadow-[var(--shadow-sm)] sm:px-5">
          {pl.tasks.map((t, i) => {
            const tec = TECS.find((x) => x.id === t.tec);
            const feita = pl.estado === "concluída" || (pl.estado === "em curso" && t.dia + t.dur <= pl.dia);
            return (
              <li key={i} className="flex min-h-14 items-center gap-3 py-2.5">
                <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full border", feita ? "border-success bg-success text-white" : "border-input")}>{feita && <Check className="h-3.5 w-3.5" />}</span>
                <span className="min-w-0 flex-1"><span className="block text-[15px]">{t.nome}</span><span className="block text-sm text-muted-foreground">{tec ? tec.n : "sem técnico"} · {nfmt(t.h)} h · {t.dur} {t.dur === 1 ? "dia" : "dias"}</span></span>
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-labelledby="mat-t">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 id="mat-t" className="text-base font-semibold">Materiais</h3>
          <Button variant="ghost" onClick={go(() => A.abrirInv())}>Abrir no Inventário<ArrowRight className="ml-1.5 h-4 w-4" /></Button>
        </div>
        <p className="mt-1 text-[15px]">{!e ? "Tudo em stock e reservado." : e.estado === "recebida" ? `Encomenda ${e.n} recebida: tudo reservado.` : `Encomenda ${e.n} ${e.estado}.`}</p>
        <ul className="mt-3 divide-y divide-border rounded-2xl border border-border bg-card px-4 shadow-[var(--shadow-sm)] sm:px-5">
          {(d.obra.mats || []).map((x) => (
            <li key={x.n} className="flex min-h-12 items-center justify-between gap-3 py-2 text-[15px]">
              <span>{x.n}</span>
              <span className={cn("tabular-nums", x.falta > 0 ? "text-warning" : "text-muted-foreground")}>{x.falta > 0 ? `faltam ${nfmt(x.falta)} ${x.un}` : `${nfmt(x.q)} ${x.un} ✓`}</span>
            </li>
          ))}
        </ul>
      </section>

      {R && (
        <section aria-labelledby="real-t">
          <h3 id="real-t" className="text-base font-semibold">Previsto e real</h3>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {([["Margem orçada", pct(T.m)], ["Margem real", pct(R.m)], ["Custo previsto", eur(T.custo) + " €"], ["Custo real", eur(R.custoReal) + " €"]] as [string, string][]).map(([l, v]) => (
              <div key={l}><p className="text-sm text-muted-foreground">{l}</p><p className="text-xl font-semibold tabular-nums">{v}</p></div>
            ))}
          </div>
          <ul className="mt-5 space-y-3">
            {R.tasks.map((t) => (
              <li key={t.nome} className="grid gap-1">
                <span className="flex justify-between text-[15px]"><span>{t.nome}</span><span className={cn("tabular-nums", t.real > t.prev * 1.05 ? "text-warning" : "text-muted-foreground")}>{nfmt(t.real)} h de {nfmt(t.prev)} h</span></span>
                <span className="relative h-2 rounded-full bg-muted" aria-hidden="true">
                  <span className="absolute inset-y-0 left-0 rounded-full bg-primary/30" style={{ width: `${(t.prev / mx) * 100}%` }} />
                  <span className={cn("absolute inset-y-0 left-0 rounded-full", t.real > t.prev * 1.05 ? "bg-warning" : "bg-primary")} style={{ width: `${(t.real / mx) * 100}%`, opacity: 0.85 }} />
                </span>
              </li>
            ))}
          </ul>
          {d.obra.aprendido
            ? <p className="mt-5 text-[15px] text-success">Receita do revestimento atualizada no Catálogo.</p>
            : (
              <div className="mt-5 rounded-xl border border-border bg-card p-4">
                <p className="text-[15px]">O revestimento levou mais {Math.round((fatorReal("revest") - 1) * 100)}% do que a receita prevê.</p>
                <p className="text-[15px] text-muted-foreground">Subir de {nfmt(S.svc.revest.h)} para {nfmt(r2(S.svc.revest.h * fatorReal("revest")))} h/m² no Catálogo? Os próximos orçamentos já ficam certos.</p>
                <Button className="mt-3" onClick={go(() => A.aprender(d.id))}>Atualizar a receita</Button>
              </div>
            )}
        </section>
      )}
    </div>
  );
}
