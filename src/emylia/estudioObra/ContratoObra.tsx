// 23/11 (Rúben: «também gostaria de ter uma visão destas numa das tabs do estúdio de gestão de obra»). O separador «Contrato» do Estúdio
// da obra: as linhas do orçamento aceite, com o serviço e o produto de cada linha juntos (contratoDaObra.ts). Só para ler.
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { eur, type Negocio } from "../motor";
import type { Ctx } from "../pecas";
import { contratoDaObra } from "./contratoDaObra";
import { useSkus } from "@/pages/prototipo-estudio/produtosDoProjeto";

const qtd = (q: number) => String(Math.round(q * 100) / 100).replace(".", ",");

export function ContratoDaObra({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  // as referências dos produtos do contrato (sem o Catálogo carregado, pela pesquisa do catálogo)
  const prods = useMemo(() => (d.visita.prod ?? []).filter((x) => !x.cliente).map((x) => ({ id: x.id, n: x.n })), [d.visita.prod]);
  const v = useSkus(prods);
  const C = useMemo(() => contratoDaObra(d, ctx.S), [d, d.orc, ctx.S, v]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!C || !C.grupos.length) return <p className="rounded-xl bg-muted/50 px-4 py-3 text-[15px] text-muted-foreground">Este negócio ainda não tem orçamento aceite.</p>;
  const num = "px-3 py-2 text-right tabular-nums whitespace-nowrap";
  return (
    <section aria-label="As linhas do contrato" className="space-y-3">
      <div>
        <h2 className="text-[15px] font-semibold">O contrato, linha a linha</h2>
        <p className="text-sm text-muted-foreground">O orçamento aceite: em cada linha, o serviço e o produto que ele instala.{C.desconto ? ` Os preços já levam o desconto de ${String(C.desconto).replace(".", ",")}%.` : ""} Só para ver.</p>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th scope="col" className="px-3 py-2 font-medium">Linha</th>
              <th scope="col" className="px-3 py-2 font-medium">SKU</th>
              <th scope="col" className="px-3 py-2 font-medium">Descrição</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Qtd.</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">P. unit.</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">IVA</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Total s/ IVA</th>
            </tr>
          </thead>
          {C.grupos.map((g) => (
            <tbody key={g.n} className="border-b border-border last:border-b-0">
              {g.linhas.map((x, j) => (
                <tr key={j} className={cn(j > 0 && "border-t border-dashed border-border/70")}>
                  {j === 0 && <th scope="rowgroup" rowSpan={g.linhas.length} className="w-44 px-3 py-2 text-left align-top font-semibold">{g.n} · {g.titulo}</th>}
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted-foreground">{x.sku ?? "—"}</td>
                  <td className="px-3 py-2">{x.nome}{x.cliente && <span className="ml-1.5 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">fornecido pelo cliente</span>}</td>
                  <td className={num}>{qtd(x.q)} {x.un}</td>
                  <td className={num}>{eur(x.pu)} €</td>
                  <td className={num}>{x.iva}%</td>
                  <td className={cn(num, "font-medium")}>{eur(x.total)} €</td>
                </tr>
              ))}
            </tbody>
          ))}
          <tfoot className="border-t-2 border-border">
            <tr><td colSpan={6} className="px-3 py-2 text-right font-medium">Total sem IVA</td><td className={cn(num, "font-semibold")}>{eur(C.semIva)} €</td></tr>
            <tr className="text-muted-foreground"><td colSpan={6} className="px-3 py-1 text-right">Base a 6%: {eur(C.base6)} € · IVA 6%</td><td className={num}>{eur(C.iva6)} €</td></tr>
            <tr className="text-muted-foreground"><td colSpan={6} className="px-3 py-1 text-right">Base a 23%: {eur(C.base23)} € · IVA 23%</td><td className={num}>{eur(C.iva23)} €</td></tr>
            <tr><td colSpan={6} className="px-3 py-2 text-right font-semibold">Total com IVA</td><td className={cn(num, "text-base font-semibold")}>{eur(C.total)} €</td></tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
