// As prestações à medida (26/10/2026): as condições de pagamento escritas como vêm no contrato, cada uma com o texto (quando se paga),
// a percentagem e o momento da obra em que se recebe (para a tesouraria e as datas previstas). A soma tem de dar 100%.
// O caso real P-2026-0109: 30% na adjudicação, 20% um mês antes do início, 15% no início, 10% na retificação das medidas da cozinha e 25% no fim.
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Negocio } from "./motor";
import { numero, type Ctx } from "./pecas";
import { FASES_OBRA } from "./fasesObra";
import { PAGAMENTO_MEDIDA, erroPrestacoes, type Prestacao } from "./planoObra";

const INPUT = "h-11 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25";
/** Os momentos possíveis: antes de começar (adjudicação ou antes do início), o fim de cada fase e o fim da obra. */
const MOMENTOS: { v: string; t: string }[] = [
  { v: "0", t: "Antes de começar" },
  ...FASES_OBRA.map((f) => ({ v: String(f.n), t: `No fim da fase ${f.n} (${f.curto.toLowerCase()})` })),
  { v: "fim", t: "No fim da obra" },
];
const deMomento = (v: string): Prestacao["fase"] => (v === "fim" ? "fim" : (Number(v) as Prestacao["fase"]));
type Linha = { l: string; p: string; fase: string };

export function PrestacoesMedida({ ctx, d, prest }: { ctx: Pick<Ctx, "A" | "run">; d: Negocio; prest: Prestacao[] }) {
  const { A, run } = ctx;
  const [L, setL] = useState<Linha[]>(() => prest.map((x) => ({ l: x.l, p: String(Math.round(x.p * 10000) / 100).replace(".", ","), fase: String(x.fase) })));
  const [erro, setErro] = useState(""), [ok, setOk] = useState("");
  const mudar = (i: number, m: Partial<Linha>) => { setOk(""); setL((v) => v.map((x, j) => (j === i ? { ...x, ...m } : x))); };
  const soma = L.reduce((a, x) => a + (numero(x.p) || 0), 0);
  const guardar = () => {
    const fases: Prestacao[] = L.map((x) => ({ l: x.l.trim(), p: (numero(x.p) || 0) / 100, fase: deMomento(x.fase) }));
    const e = erroPrestacoes(fases);
    if (e) { setErro(e); return; }
    let feito = false;
    run(() => { feito = A.pagamentoPlano(d.id, PAGAMENTO_MEDIDA, fases as NonNullable<NonNullable<Negocio["orc"]>["pagFases"]>); });
    setErro(feito ? "" : "Não ficaram guardadas."); setOk(feito ? "Prestações guardadas." : "");
  };
  return (
    <section aria-label="Prestações à medida" className="mt-4 rounded-xl border border-border p-3">
      <p className="text-[15px] font-medium">Prestações à medida</p>
      <ol className="mt-2 space-y-3">
        {L.map((x, i) => (
          // 26/10: em duas filas (o "Quando" em cima, a toda a largura), porque a caixa é estreita ao lado do plano: numa só fila, os
          // campos saíam da caixa
          <li key={i} className="grid gap-2 border-b border-border pb-3 last:border-b-0 last:pb-0">
            <label className="grid gap-1">
              <span className="text-sm font-medium">Quando</span>
              <input value={x.l} onChange={(e) => mudar(i, { l: e.target.value })} placeholder="Na adjudicação" className={INPUT} />
            </label>
            <div className="flex items-end gap-2">
            <label className="grid w-24 shrink-0 gap-1">
              <span className="text-sm font-medium">%</span>
              <input inputMode="decimal" value={x.p} onChange={(e) => mudar(i, { p: e.target.value })} className={cn(INPUT, "text-right tabular-nums")} />
            </label>
            <label className="grid min-w-0 flex-1 gap-1">
              <span className="text-sm font-medium">Momento da obra</span>
              <select value={x.fase} onChange={(e) => mudar(i, { fase: e.target.value })} className={INPUT}>
                {MOMENTOS.map((m) => <option key={m.v} value={m.v}>{m.t}</option>)}
              </select>
            </label>
            <button type="button" onClick={() => { setOk(""); setL((v) => v.filter((_, j) => j !== i)); }} aria-label={`Tirar a prestação ${i + 1}`} disabled={L.length < 2}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-40">
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
            </div>
          </li>
        ))}
      </ol>
      <p className={cn("mt-2 text-sm tabular-nums", Math.abs(soma - 100) > 0.001 ? "text-warning" : "text-muted-foreground")} aria-live="polite">Soma: {String(Math.round(soma * 100) / 100).replace(".", ",")}%</p>
      {erro && <p role="alert" className="mt-1 text-[15px] text-destructive">{erro}</p>}
      {ok && <p role="status" className="mt-1 text-[15px] text-success">{ok}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="outline" className="min-h-11 text-[15px]" onClick={() => { setOk(""); setL((v) => [...v, { l: "", p: "", fase: "fim" }]); }}><Plus className="h-4 w-4" aria-hidden="true" />Juntar uma prestação</Button>
        <Button className="min-h-11 text-[15px]" onClick={guardar}>Guardar as prestações</Button>
      </div>
    </section>
  );
}
