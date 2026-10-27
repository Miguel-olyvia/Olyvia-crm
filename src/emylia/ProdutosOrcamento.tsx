// Os produtos no ORÇAMENTO (13/10/2026, revisto): escolhem-se na visita (etapa "Necessidades do cliente",
// ProdutosVisita.tsx) e chegam ao orçamento como linhas "Produto · …" / "Fornecido pelo cliente · …".
// Aqui só se mostra o que veio da visita e de onde vieram os serviços trazidos; para mudar, reabre-se o
// levantamento (enquanto a proposta não foi enviada). Escolher aqui outra vez seria uma segunda verdade.
import { useState } from "react";
import { PackageCheck, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { eur, nfmt, type Negocio } from "./motor";
import type { Ctx } from "./pecas";
import { PREFIXO_CLIENTE, PREFIXO_PROD, precoProduto, servicosTrazidos } from "./produtosVisita";
import { Ilustracao, ilustracaoDe } from "./ilustracoes";

export { PREFIXO_CLIENTE, PREFIXO_PROD };

export function ProdutosOrcamento({ S, A, run, d, simples }: Pick<Ctx, "S" | "A" | "run"> & { d: Negocio; simples?: boolean }) {
  const o = d.orc!, prod = d.visita.prod ?? [], compra = Object.values(d.visita.clienteCompra ?? {});
  const traz = Object.entries(servicosTrazidos(prod));
  const t = simples ? "text-[15px]" : "text-sm";
  // 15/10, a página simples: uma lista limpa (a ilustração, o nome e a quantidade, o preço à direita); a instalação que o
  // produto traz vai por baixo do próprio produto, e não numa frase à parte
  if (simples) {
    return (
      <section aria-labelledby={`prod-${d.id}`}>
        <h3 id={`prod-${d.id}`} className="flex items-center gap-2 text-[17px] font-semibold tracking-tight">
          <PackageCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />Produtos da visita
          {prod.length > 0 && <span className="font-normal text-muted-foreground">· {prod.length}</span>}
        </h3>
        {prod.length || compra.length ? (
          <ul className="mt-2 divide-y divide-border rounded-2xl border border-border bg-card px-4 shadow-[var(--shadow-sm)]">
            {prod.map((p) => {
              const inst = p.svc && p.q > 0 ? S.svc[p.svc] : null;
              return (
                <li key={p.id} className="flex items-center gap-3 py-3">
                  <Ilustracao k={ilustracaoDe(p.n)} className="h-10 w-10 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium leading-snug">{p.n}</span>
                    <span className="block text-sm text-muted-foreground">
                      {nfmt(p.q)} {p.un}{p.cliente ? " · o cliente fornece" : ""}{inst ? ` · com ${inst.n.toLowerCase()}` : ""}
                    </span>
                  </span>
                  <span className={cn("shrink-0 whitespace-nowrap text-[15px] tabular-nums", p.cliente ? "text-muted-foreground" : "font-medium")}>{p.cliente ? "—" : `${eur(precoProduto(p))} €`}</span>
                </li>
              );
            })}
            {compra.map((c) => <li key={c} className="py-3 text-[15px]"><span className="text-muted-foreground">O cliente compra:</span> {c}</li>)}
          </ul>
        ) : (
          <p className="mt-1 text-[15px] text-muted-foreground">Nenhum produto escolhido na visita: os materiais são a estimativa do modelo.</p>
        )}
      </section>
    );
  }
  return (
    <section aria-labelledby={`prod-${d.id}`} className={simples ? "" : "mt-4"}>
      <h3 id={`prod-${d.id}`} className={cn("flex items-center gap-2 font-semibold", simples ? "text-base" : "text-sm")}>
        <PackageCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />Produtos da visita
      </h3>
      {prod.length || compra.length ? (
        <ul className={cn("mt-2 space-y-1", t)}>
          {prod.map((p) => (
            <li key={p.id} className="flex flex-wrap justify-between gap-x-4">
              <span>{p.n} · {nfmt(p.q)} {p.un}{p.cliente ? " · o cliente fornece" : ""}</span>
              <span className="tabular-nums text-muted-foreground">{p.cliente ? "0,00" : eur(precoProduto(p))} €</span>
            </li>
          ))}
          {compra.map((c) => <li key={c}>O cliente compra: {c}</li>)}
          {traz.map(([sid, tr]) => (
            <li key={sid} className="text-muted-foreground">{S.svc[sid]?.n ?? sid}: {nfmt(tr.q)} {S.svc[sid]?.un ?? "un"} · veio de {tr.de.join(", ")}</li>
          ))}
        </ul>
      ) : (
        <p className={cn("mt-1 text-muted-foreground", t)}>Nenhum produto escolhido na visita: os materiais são a estimativa do modelo.</p>
      )}
      {/* na página simples, o "Voltar à visita" está no topo do orçamento (VoltarAtras.tsx) */}
      {!o.enviada && !simples && <Reabrir A={A} run={run} d={d} />}
    </section>
  );
}

/** "Reabrir levantamento", com o aviso do que acontece ao orçamento. Só antes de a proposta ser enviada. */
export function Reabrir({ A, run, d }: Pick<Ctx, "A" | "run"> & { d: Negocio }) {
  const [pergunta, setPergunta] = useState(false);
  if (d.orc?.enviada || d.fase !== 3) return null;
  return pergunta ? (
    <div role="alertdialog" aria-label="Reabrir o levantamento" className="mt-3 space-y-3 rounded-xl border border-warning/40 bg-warning/[0.06] p-4">
      <p className="text-[15px]">
        Reabrir o levantamento? Volta a poder mexer nos campos, nas medidas, nos serviços e nos produtos. Ao fechar de novo, o orçamento refaz-se:
        os preços por serviço e o desconto que mudou mantêm-se; as quantidades mudadas à mão no orçamento perdem-se.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setPergunta(false)}>Cancelar</Button>
        <Button onClick={() => run(() => A.reabrirVisita(d.id))}>Reabrir levantamento</Button>
      </div>
    </div>
  ) : (
    <Button variant="outline" className="mt-3" onClick={() => setPergunta(true)}><RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />Reabrir levantamento</Button>
  );
}

/** O título e o texto de uma linha de materiais, conforme a origem. */
export function rotuloMat(dl: string, prefixoLev: string): [string, string] {
  if (dl.startsWith(PREFIXO_PROD)) return ["Produto do Catálogo", dl.slice(PREFIXO_PROD.length)];
  if (dl.startsWith(PREFIXO_CLIENTE)) return ["Fornecido pelo cliente", dl.slice(PREFIXO_CLIENTE.length)];
  if (dl.startsWith(prefixoLev)) return ["Levantamento", dl.slice(prefixoLev.length)];
  return ["Materiais", dl + " · do modelo"];
}
