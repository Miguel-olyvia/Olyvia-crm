// Os produtos do Catálogo escolhem-se no ORÇAMENTO, não no levantamento (13/10/2026).
// Por cada serviço do orçamento, os produtos do Catálogo classificados nesse serviço (equipamentosCliente.ts).
// Tocar num produto junta-o como linha; se o cliente fornece materiais, um 2.º toque marca-o
// "fornecido pelo cliente" (fica na lista, sem custo nem preço); um 3.º toque tira-o.
import { Check, PackagePlus, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { eur, r2, type Negocio } from "./motor";
import type { Ctx } from "./pecas";
import { lerCatalogo } from "./v2/catalogoStore";
import { equipamentosDosServicos } from "./equipamentosCliente";

export const PREFIXO_PROD = "Produto · ";
export const PREFIXO_CLIENTE = "Fornecido pelo cliente · ";
/** Margem sobre o custo dos produtos (exemplo; na app real vem do pacote ou das Definições). */
const MARGEM_PROD = 0.25;

type EstadoProd = "fora" | "incluido" | "cliente";

export function ProdutosOrcamento({ S, run, d, simples }: Pick<Ctx, "S" | "run"> & { d: Negocio; simples?: boolean }) {
  const o = d.orc!;
  const K = lerCatalogo();
  const sids = [...new Set(o.linhas.flatMap((l) => (l.t === "svc" ? [l.sid] : [])))];
  const grupos = equipamentosDosServicos(K, sids);
  if (!grupos.length) return null;
  const fechado = !!o.enviada;
  const clienteFornece = d.f.materiais_cliente === "Sim";

  const estado = (n: string): EstadoProd =>
    o.linhas.some((l) => l.t === "mat" && l.d === PREFIXO_PROD + n) ? "incluido"
      : o.linhas.some((l) => l.t === "mat" && l.d === PREFIXO_CLIENTE + n) ? "cliente" : "fora";

  const alternar = (n: string, custo: number) => run(() => {
    const e = estado(n);
    o.linhas = o.linhas.filter((l) => !(l.t === "mat" && (l.d === PREFIXO_PROD + n || l.d === PREFIXO_CLIENTE + n)));
    if (e === "fora") o.linhas.push({ t: "mat", d: PREFIXO_PROD + n, custo, preco: r2(custo / (1 - MARGEM_PROD)) });
    else if (e === "incluido" && clienteFornece) o.linhas.push({ t: "mat", d: PREFIXO_CLIENTE + n, custo: 0, preco: 0 });
    o.aprov = null; d.fresh = false;
  });

  return (
    <section aria-labelledby={`prod-${d.id}`} className={simples ? "" : "mt-4"}>
      <h3 id={`prod-${d.id}`} className={cn("flex items-center gap-2 font-semibold", simples ? "text-base" : "text-sm")}>
        <PackagePlus className="h-4 w-4 text-muted-foreground" aria-hidden="true" />Produtos do Catálogo
      </h3>
      <p className="mt-0.5 text-sm text-muted-foreground">
        Escolha os produtos de cada serviço.{clienteFornece ? " O cliente fornece materiais: toque outra vez para marcar \"fornecido pelo cliente\"." : ""}
      </p>
      <div className="mt-2 space-y-3">
        {grupos.map((g) => (
          <div key={g.sid}>
            <p className="text-xs font-medium text-muted-foreground">{S.svc[g.sid]?.n ?? g.sid}</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {g.produtos.map((p) => {
                const e = estado(p.n);
                return (
                  <button key={p.id} type="button" disabled={fechado} aria-pressed={e !== "fora"} onClick={() => alternar(p.n, p.custo)}
                    className={cn("inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors disabled:opacity-60",
                      e === "incluido" ? "border-primary bg-primary text-primary-foreground"
                        : e === "cliente" ? "border-success bg-success/10 text-success"
                          : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground")}>
                    {e === "incluido" && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                    {e === "cliente" && <UserRound className="h-3.5 w-3.5" aria-hidden="true" />}
                    {p.n}
                    <span className="tabular-nums opacity-80">{e === "cliente" ? "· o cliente fornece" : `· ${eur(r2(p.custo / (1 - MARGEM_PROD)))} €`}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** O título e o texto de uma linha de materiais, conforme a origem. */
export function rotuloMat(dl: string, prefixoLev: string): [string, string] {
  if (dl.startsWith(PREFIXO_PROD)) return ["Produto do Catálogo", dl.slice(PREFIXO_PROD.length)];
  if (dl.startsWith(PREFIXO_CLIENTE)) return ["Fornecido pelo cliente", dl.slice(PREFIXO_CLIENTE.length)];
  if (dl.startsWith(prefixoLev)) return ["Levantamento", dl.slice(prefixoLev.length)];
  return ["Materiais", dl + " · do modelo"];
}
