// Proposta de 16/10/2026: Negócios no V1 por documento (ver docs-design/proposta-v1-pessoas.md).
// Quatro colunas, do orçamento ao pagamento. Lead, contacto e visita são da pessoa (em Pessoas); a obra é das Operações.
// O resto é o V1 de sempre: o cartão de três linhas, a pesquisa e os mesmos filtros, um só primário.
import { useState } from "react";
import { ArrowRight, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { aberto, eur, proximo, tot, type Negocio } from "./motor";
import type { DocFase } from "./negociosApp";
import { COLUNAS_V1, colunasV1, foraDoQuadro } from "./pessoasV1Docs";
import type { Ctx } from "./pecas";
import { irParaLista, pedirNovaLead } from "./PessoasV1";

const FILTROS: [string, string][] = [["meus", "Os meus"], ["todos", "Todos"], ["atraso", "Com atraso"], ["wc", "Casa de banho"], ["coz", "Cozinha"]];

export function NegociosV1Docs({ S, A, go, q, setQ }: Ctx) {
  const f = S.filtro, ql = q.toLowerCase();
  let ds = aberto(S).filter((d) => !ql || (d.nome + " " + d.tel + " " + d.servico + " " + d.local).toLowerCase().includes(ql));
  if (f === "meus") ds = ds.filter((d) => d.dono === "comercial");
  if (f === "wc" || f === "coz") ds = ds.filter((d) => d.linha === f);
  if (f === "atraso") ds = ds.filter((d) => d.atraso);
  const cols = colunasV1(S, ds), todas = colunasV1(S);
  const emProposta = todas.proposta.reduce((a, d) => a + tot(d, S).pf, 0);
  const fora = foraDoQuadro(S);
  const [movel, setMovel] = useState<DocFase>("orcamento");

  const cartao = (d: Negocio) => {
    const p = proximo(d, S), loc = d.f.localidade || d.local.split(",").pop()!.trim();
    return (
      <li key={d.id}>
        <button type="button" onClick={go(() => { irParaLista(); A.abrir(d.id); })}
          className="group block w-full rounded-xl border border-border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]">
          <span className="block text-base font-semibold text-foreground">{d.nome}</span>
          <span className="mt-0.5 block text-sm text-muted-foreground">{d.servico}{loc ? " · " + loc : ""}{d.orc ? ` · ${eur(tot(d, S).pf)} €` : ""}</span>
          <span className={cn("mt-2 block text-sm font-medium", p.wait || p.done ? "text-muted-foreground" : "text-primary")}>
            {p.t}{!p.wait && !p.done && <ArrowRight className="ml-1 inline h-3.5 w-3.5 align-[-2px] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />}
          </span>
        </button>
      </li>
    );
  };
  const coluna = (c: DocFase, nome: string) => (
    <section key={c} aria-labelledby={`dcol-${c}`} className="min-w-0">
      <h2 id={`dcol-${c}`} className="flex items-center gap-2 px-1 text-[15px] font-semibold">
        <span className="flex-1">{nome}</span><span className="text-sm font-normal tabular-nums text-muted-foreground">{cols[c].length}</span>
      </h2>
      <ul className="mt-3 space-y-3">
        {cols[c].map(cartao)}
        {!cols[c].length && <li className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Nenhum</li>}
      </ul>
    </section>
  );

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pb-24 pt-6 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Negócios</h1>
          <p className="mt-1 text-base text-muted-foreground">{COLUNAS_V1.reduce((a, c) => a + todas[c.id].length, 0)} em curso · {eur(emProposta)} € em proposta</p>
        </div>
        <Button size="lg" onClick={go(() => { pedirNovaLead(); A.nav("pessoas"); })}><Plus className="mr-2 h-4 w-4" aria-hidden="true" />Nova lead</Button>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <label className="relative w-full sm:w-80">
          <span className="sr-only">Procurar</span>
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input type="search" placeholder="Procurar nome, telefone ou serviço" value={q} onChange={(e) => setQ?.(e.target.value)}
            className="h-11 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25" />
        </label>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden" role="group" aria-label="Mostrar">
          {FILTROS.map(([k, l]) => (
            <button key={k} type="button" aria-pressed={f === k} onClick={go(() => A.filtro(k))}
              className={cn("min-h-11 shrink-0 rounded-full border px-4 text-[15px] transition-colors", f === k ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:border-foreground/40")}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* telemóvel: um documento de cada vez */}
      <div className="mt-6 lg:hidden">
        <div role="group" aria-label="Documento" className="grid grid-cols-4 overflow-hidden rounded-lg border border-input">
          {COLUNAS_V1.map((c, i) => (
            <button key={c.id} type="button" aria-pressed={movel === c.id} onClick={() => setMovel(c.id)}
              className={cn("min-h-11 px-1 text-[14px] leading-tight", i > 0 && "border-l border-input", movel === c.id ? "bg-foreground font-semibold text-background" : "bg-card")}>
              {c.nome} <span className="tabular-nums opacity-70">{cols[c.id].length}</span>
            </button>
          ))}
        </div>
        <div className="mt-4">{coluna(movel, COLUNAS_V1.find((c) => c.id === movel)!.nome)}</div>
      </div>
      <div className="mt-8 hidden gap-5 lg:grid lg:grid-cols-4">{COLUNAS_V1.map((c) => coluna(c.id, c.nome))}</div>

      <p className="mt-8 text-[15px] text-muted-foreground">
        Antes do orçamento, a pessoa está em{" "}
        <button type="button" onClick={go(() => { irParaLista(); A.nav("pessoas"); })} className="font-medium text-primary underline-offset-4 hover:underline">Pessoas</button>
        {fora.antes ? ` (${fora.antes} em contacto ou visita)` : ""}. Depois do pagamento, a obra está em{" "}
        <button type="button" onClick={go(() => A.nav("operacoes"))} className="font-medium text-primary underline-offset-4 hover:underline">Operações</button>
        {fora.obra ? ` (${fora.obra} em obra)` : ""}. Os cartões não se arrastam: mudam de coluna quando o documento muda.
      </p>
    </div>
  );
}
