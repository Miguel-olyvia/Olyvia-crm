// Financeiro e Obra na proposta simples: estados em frases, listas em vez de
// cartões e tabelas, um botão por coisa.
import { ArrowRight, Check, CheckCircle2, Circle, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TECS, conflitos, eur, fatorReal, nfmt, pct, r2, tot, type Negocio } from "./motor";
import type { Ctx } from "./pecas";
import { FaturaDoc, Partilhar, totais } from "./DocsCliente";
import { ObraPorFases } from "./ObraPorFases";
import { lerVersao } from "./versaoPrototipo";
import { FinanceiroV2 } from "./v2/FinanceiroV2";
import { faturasDe, totalComIva, tranchesDe } from "./v2/estadoV2";
import { resumoFin } from "./v2/financeiro";
import { useInventario } from "./inventario/loja";
import { resumoEcNegocio } from "./inventario/ponteNegocios";
import { contaMateriais, materiaisProntos } from "./MateriaisObra";
import { rotuloDia } from "./preparacaoObra";
import { useState } from "react";
import { COR_FASE } from "./planoObra";
import { FASES_OBRA } from "./fasesObra";
import { fimDe } from "./ajustesPlano";
import { estadoDe, progresso } from "./obraOps";
import { enviosDe } from "./trabalhoObra";
import { ChipEstado, DiaDaObra, FitaDias } from "./AcompanhamentoObra";

/** A V2 e a V2 funcional registam faturas (com tranches); a Atual fica como era. */
const ehV2 = () => lerVersao() !== "atual";
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
  if (ehV2()) return <FinanceiroV2 {...ctx} />;
  const T = d.orc ? tot(d, S) : null, TI = totais(d, S), ft = d.fin.fatura, rc = d.fin.recibo;
  return (
    <div className="max-w-2xl space-y-8">
      <section aria-label="Valor" className="rounded-2xl border border-border bg-card p-5">
        <p className="text-[15px] text-muted-foreground">A faturar, com IVA</p>
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
        {/* 16/10: o pagamento validado emite a encomenda de cliente no Inventário e passa o negócio à Obra; depois só falta aprovar o plano */}
        <ul className="ml-9 mt-1 space-y-1.5 text-[15px] text-muted-foreground">
          {["O negócio passa à Obra", "A encomenda de cliente vai para o Inventário: reserva o stock e encomenda ao fornecedor o que falta", "As Operações aprovam o plano da obra", "O cliente recebe o recibo no portal"].map((t) => <li key={t} className={cn(rc && "text-foreground")}>{rc ? "✓" : "·"} {t}</li>)}
        </ul>
      </section>
      <Partilhar ctx={ctx} d={d} tipo="fatura" estado={rc ? `paga · ${rc.n}` : ft ? `emitida ${ft.q} · por pagar` : "rascunho: ainda não emitida"}>
        <FaturaDoc S={S} d={d} />
      </Partilhar>
    </div>
  );
}

export function ObraSimples(ctx: Ctx & { d: Negocio }) {
  const { S, A, go, d } = ctx;
  // V2: as tranches que faltam (a final, por exemplo) registam-se e validam-se aqui, já com a obra a andar
  const finV2 = ehV2() && !resumoFin(totalComIva(S, d), tranchesDe(d), faturasDe(S, d)).completo;
  // os materiais lidos ao vivo do Inventário (16/10: a encomenda de cliente vive lá); o detalhe está no passo Materiais (21/10)
  const db = useInventario();
  const r = d.obra.ec?.ref ? resumoEcNegocio(db, d.obra.ec.ref) : null;
  const pl = d.obra.plano!, R = d.obra.real, T = tot(d, S);
  const horas = pl.tasks.reduce((a, t) => a + t.h, 0), nc = conflitos(pl).length;
  const fim = Math.max(1, fimDe(pl.tasks)), prog = progresso(pl);
  const val = pl.tasks.filter((t) => pl.estado === "concluída" || estadoDe(t) === "validada").length;
  const fotos = pl.tasks.reduce((a, t) => a + enviosDe(t).reduce((b, e) => b + (e.fotos?.length ?? 0), 0), 0);
  const alts = d.obra.alteracoes ?? [];
  // 21/10: o dia que o comercial está a ver (para trás ou para a frente); começa em hoje
  const [sel, setSel] = useState(pl.estado === "em curso" ? pl.dia : 0);
  const titulo = { "por aprovar": "Plano à espera das Operações", aprovado: "Plano aprovado, falta arrancar", "em curso": `Obra em curso · dia ${pl.dia + 1} de ${fim}`, "concluída": "Obra concluída" }[pl.estado];
  const fases = [...new Set(pl.tasks.map((t) => t.fase ?? 0))].sort();
  return (
    <div className="max-w-3xl space-y-10">
      {/* o estado da obra, num cartão: o progresso, as fases e o estado de cada tarefa */}
      <section aria-labelledby="plano-t" className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id="plano-t" className="text-xl font-semibold tracking-tight">{titulo}</h3>
            <p className="mt-0.5 text-[15px] text-muted-foreground">
              {rotuloDia(pl, 0)} a {rotuloDia(pl, fim - 1)} · {pl.tasks.length} {pl.origem === "orcamento" ? "tarefas" : "fases"} · {nfmt(horas)} h de equipa{nc ? ` · ${nc} conflito por resolver` : ""}
            </p>
          </div>
          <Button variant="outline" className="min-h-11" onClick={go(() => A.abrirPlano(d.id))}>Abrir nas Operações<ArrowRight className="ml-1.5 h-4 w-4" /></Button>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true"><div className="h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${Math.round(prog * 100)}%` }} /></div>
          <span className="text-lg font-semibold tabular-nums">{Math.round(prog * 100)}%</span>
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
          {([["Tarefas validadas", `${val} de ${pl.tasks.length}`], ["Fotografias", String(fotos)], ["Ajustes ao plano", String(alts.length)]] as [string, string][]).map(([k, v]) => (
            <div key={k} className="rounded-xl bg-muted/60 px-2 py-2.5"><dt className="text-sm text-muted-foreground">{k}</dt><dd className="text-lg font-semibold tabular-nums">{v}</dd></div>
          ))}
        </dl>
        {/* 21/10: os materiais têm o seu passo; aqui só a ligação, para se ver que o plano depende deles */}
        {pl.estado !== "em curso" && pl.estado !== "concluída" && (() => {
          const c = contaMateriais(d, r), ok = materiaisProntos(d, r);
          return (
            <p className="mt-4 flex items-start gap-2 text-[15px]">
              <Package className={cn("mt-0.5 h-4 w-4 shrink-0", ok ? "text-success" : "text-warning")} aria-hidden="true" />
              <span>{c ? `Materiais: ${c.ok} de ${c.n} garantidos${ok ? "." : " · a obra só arranca com todos."}` : "Materiais: a encomenda de cliente ainda não foi emitida."} <span className="text-muted-foreground">O detalhe está no passo Materiais.</span></span>
            </p>
          );
        })()}
        <ol className="mt-5 space-y-3">
          {fases.map((f) => (
            <li key={f} className="flex gap-3">
              <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full" style={{ background: f ? COR_FASE[f] : "#7c5ce0" }} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                {f > 0 && <p className="text-sm font-medium text-muted-foreground">Fase {f} · {FASES_OBRA[f - 1].curto}</p>}
                <ul className="mt-1 space-y-1.5">
                  {pl.tasks.filter((t) => (t.fase ?? 0) === f).map((t) => (
                    <li key={t.nome} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <span className="min-w-0 text-[15px]">{t.nome} <span className="text-muted-foreground">· {TECS.find((x) => x.id === t.tec)?.n ?? "sem técnico"} · {rotuloDia(pl, t.dia)}{t.dur > 1 ? ` a ${rotuloDia(pl, t.dia + t.dur - 1)}` : ""}</span></span>
                      {(pl.estado === "em curso" || pl.estado === "concluída") && <ChipEstado e={pl.estado === "concluída" ? "validada" : estadoDe(t)} />}
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* o dia a dia: para trás e para a frente */}
      {(pl.estado === "em curso" || pl.estado === "concluída") && (
        <section aria-labelledby="dia-t">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h3 id="dia-t" className="text-base font-semibold">Dia a dia</h3>
            {pl.estado === "em curso" && sel !== pl.dia && <button type="button" onClick={() => setSel(pl.dia)} className="min-h-10 text-[15px] font-medium text-primary underline-offset-4 hover:underline">Voltar a hoje</button>}
          </div>
          <p className="mt-1 text-[15px] text-muted-foreground">O que cada técnico fez e enviou, com as fotografias. Use as setas para ver os dias anteriores e os próximos.</p>
          <div className="mt-3"><FitaDias p={pl} sel={sel} setSel={setSel} /></div>
          <div className="mt-4"><DiaDaObra p={pl} dia={sel} modo="comercial" /></div>
        </section>
      )}

      {alts.length > 0 && (
        <section aria-labelledby="alt-t">
          <h3 id="alt-t" className="text-base font-semibold">Ajustes ao plano</h3>
          <ul className="mt-3 divide-y divide-border rounded-2xl border border-border bg-card px-4 shadow-[var(--shadow-sm)] sm:px-5">
            {alts.map((a, k) => (
              <li key={k} className="py-3">
                <p className="text-[15px]">{a.t} <span className="text-muted-foreground">· {a.motivo}</span></p>
                <p className="text-sm text-muted-foreground">{a.q} · {a.quem} · {a.fimAntes === a.fimDepois ? "o fim mantém-se" : `fim: ${a.fimAntes} → ${a.fimDepois}`} · {a.cliente ? "cliente avisado no portal" : "cliente não avisado"}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {R && (
        <section aria-label="Previsto e real">
          {/* 14/10: por fase da obra (dias, custo e margem), na régua do plano do orçamento */}
          <ObraPorFases S={S} d={d} />
          {d.obra.aprendido
            ? <p className="mt-5 flex items-center gap-2 text-[15px]"><CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />Receita do revestimento atualizada no Catálogo.</p>
            : (
              <div className="mt-5 rounded-xl border border-border bg-card p-4">
                <p className="text-[15px]">O revestimento levou mais {Math.round((fatorReal("revest") - 1) * 100)}% do que a receita prevê.</p>
                <p className="text-[15px] text-muted-foreground">Subir de {nfmt(S.svc.revest.h)} para {nfmt(r2(S.svc.revest.h * fatorReal("revest")))} h/m² no Catálogo? Os próximos orçamentos já ficam certos.</p>
                <Button variant="outline" className="mt-3 min-h-11 text-[15px]" onClick={go(() => A.aprender(d.id))}>Atualizar a receita</Button>
              </div>
            )}
        </section>
      )}

      {finV2 && <FinanceiroV2 {...ctx} compacto />}
    </div>
  );
}
