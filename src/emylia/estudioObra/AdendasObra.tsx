// 12/11 (Rúben: «ao gerir a obra, e ver que vai criar uma adenda, o user não deve ser redirecionado, apenas gera um alerta em cima bem
// estruturado com uma adenda por disparar… o que depois cria o seu próprio fluxo de pagamento»). No topo do Estúdio da obra: as adendas
// por disparar (o motivo, a tarefa, as linhas, o total com IVA, os dias, o estado e os botões) e as que já andam, com o percurso até ao
// pagamento (o cliente aceita, assina, a fatura, paga). Tudo sem sair do Estúdio. O percurso está em quemPaga.ts (percursoAdenda).
import { useEffect, useState } from "react";
import { useParamUrl } from "../usarParamUrl";
import { motion } from "framer-motion";
import { Check, FileText, Pencil, Send, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { eur, nfmt, type Negocio } from "../motor";
import type { Ctx } from "../pecas";
import { adendaBloqueada, diasAdenda, totaisAdenda, totaisLinhas, type Adenda, type LinhaAdenda } from "../adendas";
import { podeNeg } from "../permissoes";
import { useReduzir } from "../movimento";
import { PASSOS_ADENDA, adendasAAndar, deOndeVem, percursoAdenda, type PercursoAdenda } from "./quemPaga";

const ENTRADA = "h-11 w-full rounded-xl border border-input bg-background px-3 text-[15px] tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring";

const linhaTxt = (x: LinhaAdenda) => (x.livre ? `${nfmt(x.h * x.q)} h` : `${nfmt(x.q)} ${x.un}`);

/** Os cinco passos, em pontos (o feito a cheio). */
function Percurso({ p }: { p: PercursoAdenda }) {
  return (
    <ol aria-label={`Percurso: ${p.t}`} className="flex items-center gap-1">
      {PASSOS_ADENDA.map((s, k) => (
        <li key={s} title={s} className="flex items-center gap-1">
          <span className={cn("h-2 w-2 rounded-full", k < p.i || p.i === 5 ? "bg-success" : k === p.i ? "bg-amber-500 ring-2 ring-amber-500/30" : "bg-muted-foreground/25")} />
          {k < PASSOS_ADENDA.length - 1 && <span className={cn("h-px w-3", k < p.i ? "bg-success" : "bg-muted-foreground/25")} />}
        </li>
      ))}
    </ol>
  );
}

export function AdendasDaObra({ ctx, d, todas }: { ctx: Ctx; d: Negocio; todas?: boolean }) {
  const { S, A, run } = ctx;
  const reduzir = useReduzir();
  const planeia = podeNeg(S.role, "obra.planear");
  // 12/11: a adenda aberta («Ver ou mudar») no endereço (?adenda=AD …), como os outros painéis do Estúdio (só a do alerta, não a do separador Cliente)
  const [abertaUrl, setAbertaUrl] = useParamUrl<string>("adenda", "", undefined, todas ? false : undefined);
  const aberta = abertaUrl || null;
  const setAberta = (n: string | null) => setAbertaUrl(n ?? "", { substituir: !n });
  const L = todas
    ? (d.adendas ?? []).map((a) => ({ a, p: percursoAdenda(d, a, a.estado === "rascunho" && adendaBloqueada(d, S, a)) }))
    : adendasAAndar(d, S);
  if (!L.length) {
    return todas ? <p className="text-sm text-muted-foreground">Sem adendas. Um pedido do cliente ou um imprevisto com custo prepara uma, por disparar.</p> : null;
  }
  const porDisparar = L.filter((x) => x.p.i === 0), andar = L.filter((x) => x.p.i !== 0);
  const editar = L.find((x) => x.a.n === aberta)?.a ?? null;
  const disparar = (a: Adenda) => run(() => { A.verificarEnviarAdenda(d.id, a.n); });
  return (
    <section aria-label="Adendas da obra" className={cn("space-y-3", !todas && "rounded-2xl border-2 p-4", !todas && (porDisparar.length ? "border-amber-400/70 bg-amber-50/60 dark:bg-amber-950/20" : "border-border bg-card"))}>
      {!todas && (
        <div className="flex flex-wrap items-center gap-2">
          <FileText className={cn("h-5 w-5", porDisparar.length ? "text-amber-700 dark:text-amber-300" : "text-primary")} aria-hidden="true" />
          <h2 className="text-[15px] font-semibold">
            {porDisparar.length ? `${porDisparar.length} ${porDisparar.length === 1 ? "adenda por disparar" : "adendas por disparar"}` : "Adendas a caminho"}
          </h2>
          {porDisparar.length > 0 && andar.length > 0 && <span className="rounded-full bg-muted px-2 text-sm tabular-nums">{andar.length} a caminho</span>}
          <span className="text-sm text-muted-foreground">{porDisparar.length ? "Nada foi ao cliente: reveja e dispare quando quiser." : "O cliente e o Financeiro tratam do resto."}</span>
        </div>
      )}

      {porDisparar.map(({ a, p }) => {
        const T = totaisAdenda(a), dias = diasAdenda(a.linhas);
        return (
          <motion.article key={a.n} aria-label={`Adenda ${a.n}`} initial={reduzir ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            className="space-y-3 rounded-xl border border-border bg-card p-3 sm:p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold">{deOndeVem(ctx.S, a)}</p>
                <p className="text-sm text-muted-foreground">Adenda {a.n} · {a.motivo}</p>
              </div>
              <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium", p.acao === "aprovacao" || p.quem === "Direção" ? "bg-warning/15 text-amber-800 dark:text-amber-300" : "bg-muted")}>{p.t}</span>
            </div>
            <ul className="divide-y divide-border rounded-lg bg-muted/40 text-sm">
              {a.linhas.map((x) => (
                <li key={x.sid} className="flex flex-wrap items-baseline justify-between gap-x-3 px-3 py-1.5">
                  <span className="min-w-0">{x.n} <span className="text-muted-foreground">· {x.livre ? "mão de obra" : "serviço com materiais"} · {linhaTxt(x)}</span></span>
                  <span className="tabular-nums">{eur(x.q * x.pu)} €</span>
                </li>
              ))}
              {a.linhas.flatMap((x) => x.mats ?? []).map((m, k) => (
                <li key={"m" + k} className="flex justify-between gap-3 px-3 py-1.5"><span>{m.n} <span className="text-muted-foreground">· material · {nfmt(m.q)} {m.un}</span></span><span className="tabular-nums">{eur((m.preco ?? 0) * m.q)} €</span></li>
              ))}
            </ul>
            <p className="text-sm"><b className="tabular-nums">{eur(T.total)} €</b> com IVA <span className="text-muted-foreground">({eur(T.base)} € sem IVA)</span> · +{dias} {dias === 1 ? "dia" : "dias"} de trabalho</p>
            {planeia && (
              <div className="flex flex-wrap gap-2">
                {p.acao === "aprovacao"
                  ? <Button type="button" className="min-h-10 rounded-full" onClick={() => run(() => A.pedirAprovAdenda(d.id, a.n))}>Pedir aprovação à Direção</Button>
                  : <Button type="button" className="min-h-10 rounded-full" disabled={p.quem === "Direção"} onClick={() => disparar(a)}><Send className="mr-1.5 h-4 w-4" aria-hidden="true" />Enviar ao cliente</Button>}
                <Button type="button" variant="outline" className="min-h-10 rounded-full" onClick={() => setAberta(a.n)}><Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />Ver ou mudar</Button>
                <Button type="button" variant="ghost" className="min-h-10 rounded-full text-muted-foreground" onClick={() => run(() => A.anularAdenda(d.id, a.n))}><Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />Descartar</Button>
              </div>
            )}
          </motion.article>
        );
      })}

      {andar.length > 0 && (
        <ul className="space-y-1.5">
          {andar.map(({ a, p }) => (
            <li key={a.n} aria-label={`Adenda ${a.n}: ${p.t}`} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-xl bg-card px-3 py-2 ring-1 ring-border">
              <span className="min-w-0 flex-1 text-sm">
                <span className="font-medium">{deOndeVem(ctx.S, a)}</span>
                <span className="block text-muted-foreground">Adenda {a.n} · {eur(totaisAdenda(a).total)} € com IVA</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <Percurso p={p} />
                <span className={cn("text-xs font-medium", p.i === 5 ? "text-success" : p.i < 0 ? "text-muted-foreground" : "text-amber-800 dark:text-amber-300")}>
                  {p.i === 5 && <Check className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />}{p.t}{p.quem && p.i < 5 && p.i >= 0 ? ` · ${p.quem}` : ""}
                </span>
              </span>
              {planeia && p.acao === "contrato" && <Button type="button" size="sm" variant="outline" className="min-h-9 rounded-full" onClick={() => run(() => A.enviarContratoAdenda(d.id, a.n))}><Send className="mr-1.5 h-4 w-4" aria-hidden="true" />Enviar o contrato</Button>}
            </li>
          ))}
        </ul>
      )}

      {editar && <EditarAdenda ctx={ctx} d={d} a={editar} fechar={() => setAberta(null)} />}
    </section>
  );
}

/** «Ver ou mudar»: por cima do Estúdio, as linhas da adenda (as horas e o preço da mão de obra, a quantidade dos serviços) com o total ao vivo. */
function EditarAdenda({ ctx, d, a, fechar }: { ctx: Ctx; d: Negocio; a: Adenda; fechar: () => void }) {
  const { A, run } = ctx;
  const [L, setL] = useState<LinhaAdenda[]>(() => a.linhas.map((x) => ({ ...x })));
  // Esc fecha só esta janela (o Estúdio vê o defaultPrevented e fica aberto)
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); fechar(); } };
    window.addEventListener("keydown", tecla, true);
    return () => window.removeEventListener("keydown", tecla, true);
  }, [fechar]);
  const T = totaisLinhas(L, a.desconto), dias = diasAdenda(L);
  const mudar = (sid: string, m: Partial<LinhaAdenda>) => setL((X) => X.map((x) => (x.sid === sid ? { ...x, ...m } : x)));
  const guardar = () => { run(() => { A.mudarAdendaDaObra(d.id, a.n, L.map((x) => ({ sid: x.sid, q: x.q, h: x.h, pu: x.pu }))); }); };
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6" onClick={fechar}>
      <div role="dialog" aria-modal="true" aria-label={`Adenda ${a.n}`} onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-t-2xl bg-card p-5 shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">Adenda {a.n} · por disparar</p>
            <h2 className="text-lg font-semibold">{deOndeVem(ctx.S, a)}</h2>
          </div>
          <Button type="button" variant="ghost" className="min-h-10" aria-label="Fechar" onClick={fechar}><X className="h-4 w-4" /></Button>
        </div>
        <ul className="space-y-3">
          {L.map((x) => (
            <li key={x.sid} className="space-y-2 rounded-xl border border-border p-3">
              <p className="text-[15px] font-medium">{x.n}</p>
              {x.livre ? (
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1"><span className="text-sm">Horas</span>
                    <input type="number" min={0.5} step={0.5} value={x.h} aria-label={`Horas de ${x.n}`} onChange={(e) => { const h = Math.max(0.5, Number(e.target.value) || 0.5); mudar(x.sid, { h, pu: Math.round((x.pu * h / Math.max(0.5, x.h)) * 100) / 100 }); }} className={ENTRADA} /></label>
                  <label className="space-y-1"><span className="text-sm">Preço sem IVA <span className="text-muted-foreground">(segue as horas)</span></span>
                    <input type="number" min={0} step={1} value={x.pu} aria-label={`Preço de ${x.n}`} onChange={(e) => mudar(x.sid, { pu: Math.max(0, Number(e.target.value) || 0) })} className={ENTRADA} /></label>
                </div>
              ) : (
                <label className="block space-y-1"><span className="text-sm">Quantidade ({x.un}) · {eur(x.pu)} € por {x.un}</span>
                  <input type="number" min={1} step={1} value={x.q} aria-label={`Quantidade de ${x.n}`} onChange={(e) => mudar(x.sid, { q: Math.max(1, Number(e.target.value) || 1) })} className={ENTRADA} /></label>
              )}
            </li>
          ))}
        </ul>
        <p className="text-[15px]">Total: <b className="tabular-nums">{eur(T.total)} €</b> com IVA <span className="text-muted-foreground">({eur(T.base)} € sem IVA)</span> · +{dias} {dias === 1 ? "dia" : "dias"} de trabalho</p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" size="lg" onClick={() => { run(() => A.anularAdenda(d.id, a.n)); fechar(); }}><Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />Descartar</Button>
          <Button type="button" variant="outline" size="lg" onClick={() => { guardar(); fechar(); }}>Guardar</Button>
          <Button type="button" size="lg" onClick={() => { guardar(); run(() => { A.verificarEnviarAdenda(d.id, a.n); }); fechar(); }}><Send className="mr-1.5 h-4 w-4" aria-hidden="true" />Guardar e enviar</Button>
        </div>
      </div>
    </div>
  );
}
