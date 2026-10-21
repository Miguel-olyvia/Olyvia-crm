// 21/10 (Ruben): depois do pagamento validado, o plano e os materiais são dois passos da Obra, e não um só ("parece que é só o plano").
// Este é o dos materiais: quantos estão garantidos para arrancar, o que falta e quem o faz, as linhas agrupadas pelo estado
// (por resolver, a caminho, garantidas) e as encomendas a fornecedor. O estado lê-se ao vivo do Inventário; quem lá trabalha é o Armazém.
import { AlertTriangle, ArrowRight, Check, Circle, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { eur, nfmt, pct, type Negocio } from "./motor";
import type { Ctx } from "./pecas";
import { useInventario } from "./inventario/loja";
import { estadoLinhaNegocio, faltaMateriais, linhaDoResumo, resumoEcNegocio, type LinhaResumoNeg, type ResumoEcNeg } from "./inventario/ponteNegocios";
import { entregaTarde, textoMateriais } from "./preparacaoObra";
import { ecDaAdenda, linhasDaObra, porEncomendarDe } from "./encomendasAjuste";
import { assinadas, primeiraPaga } from "./adendas";

type Grupo = "resolver" | "caminho" | "ok";
const GRUPOS: { k: Grupo; t: string; vazio?: string }[] = [
  { k: "resolver", t: "Por resolver" }, { k: "caminho", t: "A caminho do fornecedor" }, { k: "ok", t: "Garantidos" },
];
/** Uma linha está garantida (reservada, na carrinha ou já na obra), a caminho (encomendada e aprovada) ou por resolver (o resto). */
function grupoDe(l: LinhaResumoNeg | undefined, exemplo: boolean): Grupo {
  if (!l) return exemplo ? "ok" : "resolver";
  if (estadoLinhaNegocio(l).ok) return "ok";
  return l.aChegar > 0 && l.pos.some((p) => p.fase !== "por aprovar") ? "caminho" : "resolver";
}
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Quantas linhas estão garantidas para arrancar (para o resumo do passo na lista). */
export function contaMateriais(d: Negocio, r: ResumoEcNeg | null): { ok: number; n: number } | null {
  const ec = d.obra.ec;
  if (!ec) return null;
  if (!ec.ref) return { ok: ec.linhas.length, n: ec.linhas.length };
  if (!r || r.eliminada) return { ok: 0, n: ec.linhas.length };
  return { ok: r.linhas.filter((l) => estadoLinhaNegocio(l).ok).length, n: r.linhas.length };
}
export const materiaisProntos = (d: Negocio, r: ResumoEcNeg | null) => !!d.obra.ec && (!d.obra.ec.ref || !!r?.pronta);

export function MateriaisObra(ctx: Ctx & { d: Negocio }) {
  const { A, go, d } = ctx;
  const db = useInventario();
  const ec = d.obra.ec;
  const r = ec?.ref ? resumoEcNegocio(db, ec.ref) : null;

  // ainda sem encomenda de cliente: diz porquê, numa frase
  if (!ec) return (
    <div className="max-w-3xl rounded-2xl border border-dashed border-input p-5">
      <h3 className="text-xl font-semibold tracking-tight">Materiais por encomendar</h3>
      <p className="mt-1 text-[15px] text-muted-foreground">{textoMateriais(d, null)}</p>
    </div>
  );

  const exemplo = !ec.ref, c = contaMateriais(d, r)!, pronto = materiaisProntos(d, r);
  const todosNaObra = exemplo || (!!r && r.linhas.length > 0 && r.linhas.every((l) => l.st === "served"));
  // 21/10: com as linhas das encomendas de ajuste (materiais novos de tarefas novas, adendas ou mudados à mão)
  const linhas = linhasDaObra(d).map(({ x, ec: n, motivo }) => { const l = linhaDoResumo(r, x.n, n); return { x, l, n, motivo, g: grupoDe(l, exemplo) }; });
  const ajustes = (d.obra.ecsAjuste ?? []).filter((a) => !a.anulada);
  // 21/10 (decisão B): os das adendas por pagar não se encomendam aqui: esperam pelo pagamento da adenda (ficam à parte, por adenda)
  const pendentes = porEncomendarDe(d);
  const retidos = assinadas(d).filter((a) => !ecDaAdenda(d, a.n)).map((a) => ({ a, L: porEncomendarDe(d, a.n) })).filter((x) => x.L.length);
  const nCaminho = linhas.filter((y) => y.g === "caminho").length, nResolver = linhas.filter((y) => y.g === "resolver").length;
  const falta = exemplo ? [] : faltaMateriais(r);
  const tarde = entregaTarde(d, db);
  const titulo = r?.eliminada ? "Encomenda eliminada no Inventário"
    : todosNaObra ? "Materiais todos na obra"
    : pronto ? "Materiais garantidos para arrancar"
    : `Materiais em preparação · ${c.ok} de ${c.n} garantidos`;
  const pos = r?.pos.filter((p) => p.fase !== "cancelada") ?? [];

  return (
    <div className="max-w-3xl space-y-10">
      {/* o estado dos materiais, num cartão: quantos estão garantidos e o que falta (como o cartão do plano, no passo ao lado) */}
      <section aria-labelledby="mat-t" className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id="mat-t" className="text-xl font-semibold tracking-tight">{titulo}</h3>
            <p className="mt-0.5 text-[15px] text-muted-foreground">
              Encomenda de cliente {ec.n} · {exemplo ? `de ${ec.criada}` : `emitida ao validar o pagamento${ec.emitida ? ` · ${ec.emitida.q}` : ""}`} · {ec.linhas.length} {ec.linhas.length === 1 ? "material" : "materiais"}
            </p>
            {ajustes.map((a) => (
              <p key={a.n} className="text-[15px] text-muted-foreground">{a.adenda ? `Encomenda da adenda ${a.adenda} · ${a.n} · emitida ao validar o pagamento da adenda` : `Encomenda de ajuste ${a.n} · ${a.motivo}`} · {a.linhas.length} {a.linhas.length === 1 ? "material" : "materiais"}</p>
            ))}
          </div>
          {!exemplo && <Button variant="outline" className="min-h-11" onClick={go(() => A.abrirInv(d.id))}>Abrir no Inventário<ArrowRight className="ml-1.5 h-4 w-4" /></Button>}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true"><div className="h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${c.n ? Math.round((c.ok / c.n) * 100) : 0}%` }} /></div>
          <span className="text-lg font-semibold tabular-nums">{c.ok}/{c.n}</span>
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
          {([["Garantidos", c.ok, false], ["A caminho", nCaminho, false], ["Por resolver", nResolver, nResolver > 0]] as [string, number, boolean][]).map(([k, v, mau]) => (
            <div key={k} className="rounded-xl bg-muted/60 px-2 py-2.5"><dt className="text-sm text-muted-foreground">{k}</dt><dd className={cn("text-lg font-semibold tabular-nums", mau && "text-warning")}>{v}</dd></div>
          ))}
        </dl>
        {exemplo && <p className="mt-4 text-[15px] text-muted-foreground">Obra do exemplo, paga antes do Inventário novo: os materiais já estão na obra.</p>}
        {!exemplo && !r && <p className="mt-4 text-[15px] text-muted-foreground">A encomenda ainda não está no Inventário (os dados de exemplo foram repostos). Volta a ser emitida sozinha.</p>}
      </section>

      {/* 21/10: materiais mudados à mão nas tarefas e ainda por encomendar */}
      {pendentes.length > 0 && (
        <section aria-labelledby="mat-pend-t" className="rounded-2xl border border-warning/40 bg-warning/[0.06] p-5">
          <h3 id="mat-pend-t" className="text-base font-semibold">Materiais novos por encomendar</h3>
          <ul className="mt-2 space-y-1 text-[15px]">
            {pendentes.map(({ t, m, q }) => <li key={t.nome + m.n}>{m.n} · {nfmt(q)} {m.un} <span className="text-muted-foreground">· {t.nome}</span></li>)}
          </ul>
          <Button className="mt-3 min-h-11" onClick={go(() => A.encomendarMateriais(d.id))}>Encomendar os materiais novos</Button>
          <p className="mt-2 text-sm text-muted-foreground">Vão numa encomenda de cliente de ajuste, no Inventário; as tarefas esperam por eles no plano.</p>
        </section>
      )}

      {/* 21/10 (decisão B): os materiais das adendas assinadas, à espera do pagamento de cada uma (depois, encomenda própria) */}
      {retidos.map(({ a, L }) => (
        <section key={a.n} aria-label={`Materiais da adenda ${a.n}`} className="rounded-2xl border border-dashed border-input p-5">
          <h3 className="text-base font-semibold">Materiais da adenda {a.n}</h3>
          <ul className="mt-2 space-y-1 text-[15px]">
            {L.map(({ t, m, q }) => <li key={t.nome + m.n}>{m.n} · {nfmt(q)} {m.un} <span className="text-muted-foreground">· {t.nome}</span></li>)}
          </ul>
          {!primeiraPaga(a)
            ? <p className="mt-2 text-sm text-muted-foreground">Encomendam-se quando o pagamento da 1.ª parcela da adenda for validado: vão numa encomenda de cliente própria, no Inventário.</p>
            : <>
              <p className="mt-2 text-sm text-muted-foreground">O pagamento da adenda está validado mas a encomenda não chegou ao Inventário.</p>
              <Button className="mt-3 min-h-11" onClick={go(() => A.emitirEcsAdenda(d.id))}>Emitir a encomenda da adenda</Button>
            </>}
        </section>
      ))}

      {/* o que falta para os materiais estarem garantidos, e quem o faz: as Compras aprovam, o Armazém recebe e reserva */}
      {(falta.length > 0 || tarde) && (
        <section aria-labelledby="mat-falta-t">
          <h3 id="mat-falta-t" className="text-base font-semibold">O que falta</h3>
          <ul className="mt-2 space-y-2">
            {falta.map((f) => (
              <li key={f} className="flex items-start gap-2.5 text-[15px]"><Circle className="mt-1.5 h-2.5 w-2.5 shrink-0 text-warning" fill="currentColor" aria-hidden="true" />{f.replace(/^./, (x) => x.toUpperCase())}.</li>
            ))}
            {tarde && (
              <li className="flex items-start gap-2.5 text-[15px]"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                <span>A entrega ({tarde.pos.join(", ")}) está prevista para {tarde.entrega.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" })}, depois do início da obra ({tarde.inicio.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" })}). <span className="text-muted-foreground">Adiar o início nas Operações ou pedir ao fornecedor que antecipe.</span></span>
              </li>
            )}
          </ul>
          <p className="mt-2 text-sm text-muted-foreground">Faz-se no Inventário: as Compras aprovam as encomendas a fornecedor e o Armazém recebe-as e reserva. Aqui fica o estado.</p>
        </section>
      )}

      {/* as linhas, agrupadas pelo estado: primeiro o que precisa de alguém */}
      {GRUPOS.map(({ k, t }) => {
        const L = linhas.filter((y) => y.g === k);
        if (!L.length) return null;
        return (
          <section key={k} aria-labelledby={`mat-${k}-t`}>
            <h3 id={`mat-${k}-t`} className="flex items-center gap-2 text-base font-semibold">
              {k === "ok" ? <Check className="h-4 w-4 text-success" aria-hidden="true" /> : k === "caminho" ? <Truck className="h-4 w-4 text-primary" aria-hidden="true" /> : <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />}
              {t} <span className="font-normal text-muted-foreground">· {L.length}</span>
            </h3>
            <ul className="mt-3 divide-y divide-border rounded-2xl border border-border bg-card px-4 shadow-[var(--shadow-sm)] sm:px-5">
              {L.map(({ x, l, n }) => {
                const st = l ? estadoLinhaNegocio(l) : exemplo ? { t: "na obra", ok: true } : { t: "não está no Inventário", ok: false };
                return (
                  <li key={n + x.n} className="py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="min-w-0 flex-1 text-[15px]">{x.n} <span className="text-sm text-muted-foreground">· {x.de === "produto" ? "produto da visita" : "material"}{n !== ec.n ? ` · ${n}` : ""}</span></span>
                      <span className="text-[15px] tabular-nums">{nfmt(x.q)} {x.un}</span>
                    </div>
                    <p className={cn("text-sm", st.ok ? "text-success" : k === "caminho" ? "text-foreground/80" : "text-warning")}>
                      {st.t}{l?.pos.length ? <span className="text-muted-foreground"> · {l.pos.map((p) => `${p.id}, ${p.forn.replace(" (exemplo)", "")}`).join(" · ")}</span> : null}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {/* as encomendas a fornecedor: de onde vem o que não havia em stock */}
      {!exemplo && r && (
        <section aria-labelledby="mat-po-t">
          <h3 id="mat-po-t" className="text-base font-semibold">Encomendas a fornecedor</h3>
          {pos.length ? (
            <ul className="mt-3 divide-y divide-border rounded-2xl border border-border bg-card px-4 shadow-[var(--shadow-sm)] sm:px-5">
              {pos.map((p) => (
                <li key={p.id} className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2 text-[15px]">
                  <span>{p.id} <span className="text-muted-foreground">· {p.forn.replace(" (exemplo)", "")}</span></span>
                  <span className={cn("text-sm", p.fase === "por aprovar" ? "text-warning" : p.fase === "recebida" ? "text-success" : "text-muted-foreground")}>
                    {p.estado.split(" · ").at(-1)}{(p.fase === "no portal" || p.fase === "por email" || p.fase === "parcial") && p.prevista ? ` · chega a ${ddmm(p.prevista)}${p.prometida ? "" : " (prevista)"}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="mt-1 text-[15px] text-muted-foreground">Nenhuma: havia tudo em stock.</p>}
        </section>
      )}

      {/* o custo dos materiais contra o que o cliente paga por eles */}
      <section aria-labelledby="mat-custo-t">
        <h3 id="mat-custo-t" className="text-base font-semibold">Custo dos materiais</h3>
        <dl className="mt-3 grid grid-cols-3 gap-3">
          {([["Custo", `${eur(ec.custo ?? 0)} €`], ["Na proposta", `${eur(ec.valor)} €`], ["Margem", ec.valor > 0 ? pct((ec.valor - (ec.custo ?? 0)) / ec.valor) : "—"]] as [string, string][]).map(([k, v]) => (
            <div key={k} className="rounded-xl border border-border bg-card px-3 py-2.5"><dt className="text-sm text-muted-foreground">{k}</dt><dd className="text-lg font-semibold tabular-nums">{v}</dd></div>
          ))}
        </dl>
      </section>
    </div>
  );
}
