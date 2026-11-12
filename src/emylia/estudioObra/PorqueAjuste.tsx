// 12/11 (Rúben: «quem paga?»). Com a obra em curso, juntar uma tarefa, prolongá-la ou dar-lhe um atraso pergunta «Porquê?», com o impacto
// de cada resposta à vista antes de escolher: + € para o cliente (a adenda), − € de margem (se pagar a empresa) e + dias no fim da obra.
// As contas estão em quemPaga.ts; as mudanças vão pelo motor (A.ajusteDoCliente, A.ajusteNosso) ou pelo registo do imprevisto.
import { useMemo, useState } from "react";
import { AlertTriangle, Building2, Check, Clock, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { eur, nfmt, type Negocio } from "../motor";
import type { Ctx } from "../pecas";
import { diasAdenda, emCurso, precoSugeridoLivre, totaisLinhas, type LinhaAdenda } from "../adendas";
import { ocupacaoDosTecnicos, rotuloDia } from "../preparacaoObra";
import { custoDaHora, impactoAjuste, PORQUE, type AjusteObra, type QuemPaga } from "./quemPaga";

const ENTRADA = "h-11 w-full rounded-xl border border-input bg-background px-3 text-[15px] tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring";
const ICONE: Record<QuemPaga, typeof User> = { cliente: User, imprevisto: AlertTriangle, empresa: Building2 };

/** O que o imprevisto leva já preenchido (a tarefa, os dias e as horas). */
export interface ImprevistoInicial { ti?: number; dias: number; horas: number; perfil: string }

export function PorqueAjuste({ ctx, d, aj, fechar, feito, imprevisto, embutido }: {
  ctx: Ctx; d: Negocio; aj: AjusteObra;
  /** fecha sem mudar nada */
  fechar: () => void;
  /** depois de aplicar ou de mandar a adenda */
  feito?: () => void;
  imprevisto: (x: ImprevistoInicial) => void;
  /** dentro da pré-visualização «E se…?» (sem cabeçalho de painel) */
  embutido?: boolean;
}) {
  const { S, A, run } = ctx;
  const p = d.obra.plano!;
  const [escolha, setEscolha] = useState<QuemPaga | null>(null);
  const [horasE, setHorasE] = useState<number | null>(null);
  const [preco, setPreco] = useState<number | null>(null);
  const [nota, setNota] = useState("");
  const [avisar, setAvisar] = useState(false);
  const I = useMemo(() => impactoAjuste(S, p, aj, ocupacaoDosTecnicos(S, d.id)), [S, p, aj, d.id]);
  if (!I) return null;
  const t = aj.k === "nova" ? null : p.tasks[aj.ti];
  const horas = aj.k === "nova" ? I.horas : Math.max(0, horasE ?? I.horas);
  // o que o cliente paga: a tarefa nova vai como o serviço do Catálogo; as horas a mais, numa linha livre ao preço do ofício
  const linha: LinhaAdenda | null = aj.k === "nova" ? I.linha : horas > 0
    ? { sid: "livre-previa", n: I.linha?.n ?? `Mais tempo em ${I.nome.toLowerCase()}`, un: "vg", q: 1, pu: preco ?? precoSugeridoLivre(S, horas, I.perfil), h: horas, perfil: I.perfil, livre: true, mats: [] }
    : null;
  const T = linha ? totaisLinhas([linha]) : null;
  const custo = aj.k === "nova" ? I.custo : Math.round(horas * custoDaHora(S, t!) * 100) / 100;
  const fimAntes = rotuloDia(p, I.fimAntes - 1), fimDepois = rotuloDia(p, I.fimDepois - 1);
  const pend = (d.adendas ?? []).filter((a) => a.ajuste && emCurso(a)).length;

  const impacto: Record<QuemPaga, string> = {
    cliente: T ? `+ ${eur(T.total)} € para o cliente` : "Sem custo para o cliente",
    imprevisto: "Custo e dias decidem-se no registo",
    empresa: custo > 0 ? `− ${eur(custo)} € de margem` : "Sem custo",
  };
  const aplicar = () => {
    if (!escolha) return;
    if (escolha === "imprevisto") {
      imprevisto({ ti: aj.k === "nova" ? undefined : aj.ti, dias: Math.max(1, I.dias || (aj.k === "atraso" ? aj.dias : 1)), horas: horas || 4, perfil: I.perfil });
      return;
    }
    let ok = false;
    run(() => {
      ok = escolha === "cliente"
        ? A.ajusteDoCliente(d.id, aj, { horas, ...(preco != null ? { preco } : {}), nota, cliente: avisar }) != null
        : A.ajusteNosso(d.id, aj, { horas, nota, cliente: avisar });
    });
    if (ok) (feito ?? fechar)();
  };
  const botao = escolha === "cliente" ? (linha ? "Preparar a adenda" : "Aplicar a pedido do cliente")
    : escolha === "empresa" ? "Aplicar: paga a empresa" : escolha === "imprevisto" ? "Registar o imprevisto" : "Escolha porquê";

  return (
    <section aria-label="Porquê?" className={cn("space-y-4", !embutido && "p-5")}>
      {!embutido && (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">Com a obra em curso</p>
            <h2 className="text-lg font-semibold">Porquê?</h2>
          </div>
          <Button type="button" variant="ghost" className="min-h-10" aria-label="Fechar" onClick={fechar}><X className="h-4 w-4" /></Button>
        </div>
      )}
      {embutido && <p className="text-[15px] font-semibold">Porquê? <span className="font-normal text-muted-foreground">Quem paga esta mudança</span></p>}

      {/* o que muda e o impacto no prazo, antes de escolher */}
      <div className="rounded-xl bg-muted/50 px-4 py-3">
        <p className="text-[15px] font-medium">{I.texto}</p>
        <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className={cn("inline-flex items-center gap-1", I.dias > 0 && "font-medium text-amber-800 dark:text-amber-300")}><Clock className="h-3.5 w-3.5" aria-hidden="true" />{I.dias > 0 ? `+${I.dias} ${I.dias === 1 ? "dia útil" : "dias úteis"}: acaba a ${fimDepois}` : `O fim mantém-se: ${fimAntes}`}</span>
          {horas > 0 && <span className="tabular-nums">+{nfmt(horas)} h de trabalho</span>}
        </p>
      </div>

      <div role="radiogroup" aria-label="Quem paga" className="grid gap-2">
        {PORQUE.map((o) => {
          const Ic = ICONE[o.k], on = escolha === o.k;
          return (
            <button key={o.k} type="button" role="radio" aria-checked={on} onClick={() => setEscolha(o.k)}
              className={cn("flex min-h-16 w-full items-start gap-3 rounded-2xl border p-3 text-left transition-colors", on ? "border-primary bg-primary/[0.06] ring-2 ring-primary" : "border-input bg-card hover:border-foreground/40")}>
              <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full", on ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}><Ic className="h-4 w-4" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">{o.t}</span>
                <span className={cn("block text-sm font-medium tabular-nums", o.k === "empresa" && custo > 0 ? "text-amber-800 dark:text-amber-300" : o.k === "cliente" && T ? "text-success" : "text-muted-foreground")}>{impacto[o.k]}</span>
                <span className="block text-sm text-muted-foreground">{o.sub}</span>
              </span>
            </button>
          );
        })}
      </div>

      {escolha === "cliente" && (
        <div className="space-y-3 rounded-2xl border border-border p-4">
          {aj.k !== "nova" && (
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1"><span className="text-sm font-medium">Horas a mais</span>
                <input type="number" min={0} step={0.5} value={horas} onChange={(e) => { setHorasE(Math.max(0, Number(e.target.value) || 0)); setPreco(null); }} className={ENTRADA} aria-label="Horas a mais" /></label>
              <label className="space-y-1"><span className="text-sm font-medium">Preço sem IVA</span>
                <input type="number" min={0} step={1} value={linha ? Math.round(linha.pu * 100) / 100 : 0} disabled={!linha} onChange={(e) => setPreco(Math.max(0, Number(e.target.value) || 0))} className={ENTRADA} aria-label="Preço sem IVA" /></label>
            </div>
          )}
          {T && linha ? (
            <p className="text-sm">
              Adenda: <b className="tabular-nums">{eur(T.base)} €</b> sem IVA, <b className="tabular-nums">{eur(T.total)} €</b> com IVA · na proposta, +{diasAdenda([linha])} {diasAdenda([linha]) === 1 ? "dia" : "dias"} de trabalho
              {aj.k === "nova" && <span className="text-muted-foreground"> · com os materiais do serviço</span>}
            </p>
          ) : <p className="text-sm text-muted-foreground">Sem horas a mais, não há nada a cobrar: o plano muda já, registado como pedido do cliente.</p>}
          {linha && <p className="flex items-start gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"><Clock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />A adenda fica por disparar no alerta em cima: nada vai ao cliente sem enviar. O plano só muda quando ele aceitar e assinar.{pend ? ` Já há ${pend} ${pend === 1 ? "pedido" : "pedidos"} a andar.` : ""}</p>}
          <label className="block space-y-1"><span className="text-sm font-medium">O que o cliente pediu <span className="font-normal text-muted-foreground">(opcional)</span></span>
            <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ex.: quer o nicho do duche mais largo" className={ENTRADA} /></label>
          {!linha && I.dias > 0 && <label className="flex min-h-10 cursor-pointer items-center gap-2 text-[15px]"><input type="checkbox" checked={avisar} onChange={(e) => setAvisar(e.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" />Avisar o cliente da data nova no portal</label>}
        </div>
      )}
      {escolha === "empresa" && (
        <div className="space-y-3 rounded-2xl border border-border p-4">
          {aj.k !== "nova" && (
            <label className="block space-y-1"><span className="text-sm font-medium">Horas a mais</span>
              <input type="number" min={0} step={0.5} value={horas} onChange={(e) => setHorasE(Math.max(0, Number(e.target.value) || 0))} className={ENTRADA} aria-label="Horas a mais" /></label>
          )}
          <p className="text-sm">
            {custo > 0 ? <>Sai da margem: <b className="tabular-nums">{eur(custo)} €</b>{aj.k === "nova" ? " (as horas e os materiais da tarefa)" : ` (${nfmt(horas)} h ao custo do técnico)`}. Fica registado no diário e nas mudanças do plano, para se ver quanto custam os nossos atrasos.</> : "Sem horas a mais: não sai nada da margem. Fica registado no diário."}
          </p>
          <label className="block space-y-1"><span className="text-sm font-medium">O que aconteceu <span className="font-normal text-muted-foreground">(opcional)</span></span>
            <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ex.: o azulejo foi mal assente e refaz-se" className={ENTRADA} /></label>
          {I.dias > 0 && <label className="flex min-h-10 cursor-pointer items-center gap-2 text-[15px]"><input type="checkbox" checked={avisar} onChange={(e) => setAvisar(e.target.checked)} className="h-4 w-4 accent-[hsl(var(--primary))]" />Avisar o cliente da data nova no portal</label>}
        </div>
      )}
      {escolha === "imprevisto" && (
        <p className="rounded-2xl border border-border p-4 text-sm">Abre o registo do imprevisto já com {aj.k === "nova" ? "as horas" : "a tarefa, os dias e as horas"}. Junte as fotografias e diga se tem custo para o cliente.</p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" size="lg" onClick={fechar}>Cancelar</Button>
        <Button type="button" size="lg" disabled={!escolha} onClick={aplicar}>
          <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />{botao}
        </Button>
      </div>
    </section>
  );
}
