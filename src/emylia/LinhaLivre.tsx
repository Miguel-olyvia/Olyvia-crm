// A linha livre do orçamento (26/10/2026): o que o Catálogo não tem (um material à parte, uma subempreitada, uma taxa de serviço),
// escrito à mão com a quantidade, a unidade, o preço por unidade, o custo (opcional, para a margem) e a taxa de IVA.
// Nasceu do caso real da proposta P-2026-0109 (o material elétrico, os materiais do pladur e a taxa de consultoria a 6%).
import { useId, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Negocio, TaxaIva } from "./motor";
import { numero, type Ctx } from "./pecas";

const INPUT = "h-11 w-full rounded-lg border border-input bg-card px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25";

/** O botão "Juntar uma linha livre" e, aberto, o formulário. */
export function LinhaLivre({ ctx, d }: { ctx: Pick<Ctx, "A" | "run">; d: Negocio }) {
  const { A, run } = ctx;
  const [aberto, setAberto] = useState(false);
  const [desc, setDesc] = useState(""), [q, setQ] = useState("1"), [un, setUn] = useState("un"), [pu, setPu] = useState(""), [custo, setCusto] = useState("");
  const [iva, setIva] = useState<TaxaIva>(23);
  const [erro, setErro] = useState("");
  const id = useId();
  if (!d.orc || d.orc.enviada) return null;
  if (!aberto) return (
    <Button variant="outline" className="mt-3 min-h-11 text-[15px]" onClick={() => setAberto(true)}>
      <Plus className="h-4 w-4" aria-hidden="true" />Juntar uma linha livre
    </Button>
  );
  const juntar = () => {
    const nq = numero(q), npu = numero(pu), nc = custo.trim() ? numero(custo) : 0;
    if (!desc.trim()) { setErro("Escreva a descrição."); return; }
    if (isNaN(nq) || nq <= 0) { setErro("A quantidade tem de ser maior do que zero."); return; }
    if (isNaN(npu) || npu < 0) { setErro("Escreva o preço por unidade."); return; }
    if (isNaN(nc) || nc < 0) { setErro("O custo tem de ser um número positivo."); return; }
    let i = -1;
    run(() => { i = A.linhaLivre(d.id, { d: desc, q: nq, un, pu: npu, custo: nc, iva }); });
    if (i < 0) { setErro("Já há uma linha com essa descrição."); return; }
    setDesc(""); setQ("1"); setUn("un"); setPu(""); setCusto(""); setIva(23); setErro(""); setAberto(false);
  };
  return (
    <section aria-labelledby={`${id}-t`} className="mt-3 grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-4">
      <h3 id={`${id}-t`} className="text-[15px] font-semibold sm:col-span-4">Linha livre</h3>
      <label className="grid gap-1 sm:col-span-4">
        <span className="text-sm font-medium">Descrição</span>
        <input autoFocus value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Material elétrico" className={INPUT} />
      </label>
      <label className="grid gap-1">
        <span className="text-sm font-medium">Quantidade</span>
        <input inputMode="decimal" value={q} onChange={(e) => setQ(e.target.value)} className={cn(INPUT, "text-right tabular-nums")} />
      </label>
      <label className="grid gap-1">
        <span className="text-sm font-medium">Unidade</span>
        <input value={un} onChange={(e) => setUn(e.target.value)} className={INPUT} />
      </label>
      <label className="grid gap-1">
        <span className="text-sm font-medium">Preço por unidade (€)</span>
        <input inputMode="decimal" value={pu} onChange={(e) => setPu(e.target.value)} className={cn(INPUT, "text-right tabular-nums")} />
      </label>
      <label className="grid gap-1">
        <span className="text-sm font-medium">Custo total (€) <span className="font-normal text-muted-foreground">(opcional)</span></span>
        <input inputMode="decimal" value={custo} onChange={(e) => setCusto(e.target.value)} className={cn(INPUT, "text-right tabular-nums")} />
      </label>
      <fieldset className="sm:col-span-4">
        <legend className="text-sm font-medium">IVA</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {([[23, "23% · materiais"], [6, "6% · mão de obra ou serviço"]] as const).map(([v, t]) => (
            <button key={v} type="button" aria-pressed={iva === v} onClick={() => setIva(v)}
              className={cn("min-h-11 rounded-lg border px-3 text-[15px]", iva === v ? "border-primary bg-primary/10 font-medium" : "border-input bg-card hover:bg-muted")}>{t}</button>
          ))}
        </div>
      </fieldset>
      {erro && <p role="alert" className="text-[15px] text-destructive sm:col-span-4">{erro}</p>}
      <div className="flex flex-wrap gap-2 sm:col-span-4">
        <Button className="min-h-11 text-[15px]" onClick={juntar}>Juntar ao orçamento</Button>
        <Button variant="outline" className="min-h-11 text-[15px]" onClick={() => { setAberto(false); setErro(""); }}>Cancelar</Button>
      </div>
    </section>
  );
}
