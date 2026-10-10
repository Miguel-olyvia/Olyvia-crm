// V2 da página de Negócios: só negócios a decorrer, por fase de documento.
// Lead, contacto e visita são fases da pessoa e ficam em Clientes.
import { useState, type KeyboardEvent, type ReactNode } from "react";
import { ArrowRight, Euro, FileCheck2, FileSignature, FileText, Search, Users, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { aberto, eur, type LinhaId, type Negocio } from "./motor";
import { COLUNAS_V2, cartoesV2, docFase, negociosPorPessoa, pessoasAntes, type CartaoV2, type DocFase } from "./negociosDocs";
import { Chip, FASE_COR, type Ctx } from "./pecas";

const FILTROS: [string, string][] = [["meus", "Os meus"], ["todos", "Todos"], ["atraso", "Com atraso"], ["wc", "Casa de banho"], ["coz", "Cozinha"]];
const ICONE: Record<DocFase, { i: LucideIcon; cor: string }> = {
  orcamento: { i: FileText, cor: FASE_COR[0] },
  proposta: { i: FileCheck2, cor: FASE_COR[3] },
  contrato: { i: FileSignature, cor: FASE_COR[2] },
  financeiro: { i: Euro, cor: FASE_COR[4] },
};
const NOME_DOC: Record<DocFase, string> = { orcamento: "Orçamento", proposta: "Proposta", contrato: "Contrato", financeiro: "Financeiro" };
const eur0 = (x: number) => eur(x).replace(/,00$/, "");
const CHIP_PEQ = "h-7 w-7 rounded-lg [&_svg]:h-4 [&_svg]:w-4";

export function NegociosV2({ S, A, go, q, setQ, seletor }: Ctx & { seletor?: ReactNode }) {
  const [colMovel, setColMovel] = useState<DocFase>("orcamento");
  const f = S.filtro, ql = q.toLowerCase();
  const todos = cartoesV2(S);
  const porPessoa = negociosPorPessoa(todos);
  const deal = (c: CartaoV2): Negocio => S.deals.find((d) => d.id === c.negocioId)!;
  const visiveis = todos.filter((c) => {
    const d = deal(c);
    if (ql && !(c.nome + " " + d.tel + " " + c.servico + " " + c.local).toLowerCase().includes(ql)) return false;
    if (f === "meus") return d.dono === "comercial";
    if (f === "wc" || f === "coz") return c.linhasFiltro.includes(f as LinhaId);
    if (f === "atraso") return !!d.atraso;
    return true;
  });
  const emProposta = todos.filter((c) => c.doc === "proposta").reduce((a, c) => a + (c.valor || 0), 0);
  const antes = pessoasAntes(S);
  const decorrer = aberto(S).filter((d) => docFase(d)).length;

  const cartao = (c: CartaoV2) => {
    const I = ICONE[c.doc].i;
    const n = porPessoa[c.nome] || 1;
    return (
      <li key={c.id} className="rounded-xl border border-border bg-card">
        <button type="button" onClick={go(() => A.abrir(c.negocioId))}
          className="group block min-h-11 w-full rounded-xl p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
          <span className="mb-2 flex items-center gap-2 text-[15px] text-muted-foreground">
            <Chip icone={I} cor={ICONE[c.doc].cor} className={CHIP_PEQ} />
            <span>{c.conjunta ? "Proposta conjunta" : NOME_DOC[c.doc]}</span>
            {c.demo && <span className="ml-auto text-xs text-muted-foreground">exemplo</span>}
          </span>
          <span className="block text-base font-semibold text-foreground">{c.nome}</span>
          <span className="mt-0.5 block text-[15px] text-muted-foreground">{c.servico}{c.local ? " · " + c.local : ""}</span>
          {c.linhas && (
            <ul className="mt-2 divide-y divide-border border-y border-border text-[15px]">
              {c.linhas.map((l) => (
                <li key={l.rotulo} className="flex justify-between gap-2 py-1.5"><span>{l.rotulo}</span><span className="tabular-nums">{eur(l.valor)} €</span></li>
              ))}
            </ul>
          )}
          {c.valor !== null && <span className="mt-2 block text-base font-medium tabular-nums text-foreground">{c.conjunta ? "Total " : ""}{eur(c.valor)} €</span>}
          <span className="mt-2 block text-[15px] font-medium text-foreground">
            {c.proximo}
            <ArrowRight className="ml-1 inline h-3.5 w-3.5 align-[-2px] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        </button>
        {n > 1 && (
          <button type="button" onClick={() => setQ?.(c.nome)} aria-label={`Ver os ${n} negócios de ${c.nome}`}
            className="flex min-h-11 w-full items-center gap-2 border-t border-border px-4 text-left text-[15px] text-muted-foreground hover:text-foreground">
            <Users className="h-4 w-4" aria-hidden="true" />{n} negócios desta pessoa
          </button>
        )}
      </li>
    );
  };

  const limpar = () => { setQ?.(""); A.filtro("todos"); };
  const teclaSeparador = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = COLUNAS_V2.length;
    const j = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (j < 0) return;
    e.preventDefault();
    const id = COLUNAS_V2[j].id;
    setColMovel(id);
    document.getElementById(`v2-tab-${id}`)?.focus();
  };

  // sufixo -m (separador do telemóvel) ou -d (computador): a coluna é desenhada nos dois sítios e os ids não se podem repetir
  const coluna = (id: DocFase, suf: "m" | "d") => {
    const cs = visiveis.filter((c) => c.doc === id);
    const total = cs.reduce((a, c) => a + (c.valor || 0), 0);
    return (
      <section key={id} aria-labelledby={`v2-col-${id}-${suf}`} className="min-w-0">
        <h2 id={`v2-col-${id}-${suf}`} className="flex items-center gap-2 px-1 text-[16px] font-semibold">
          <Chip icone={ICONE[id].i} cor={ICONE[id].cor} className={CHIP_PEQ} />
          <span className="flex-1">{NOME_DOC[id]}</span>
          <span className="text-[15px] font-normal tabular-nums text-muted-foreground">{cs.length}</span>
        </h2>
        <p className="mt-1 px-1 text-[15px] tabular-nums text-muted-foreground">{eur0(total)} €</p>
        <ul className="mt-3 space-y-3">
          {cs.map(cartao)}
          {!cs.length && <li className="rounded-xl border border-dashed border-border p-4 text-[15px] text-muted-foreground">Nenhum</li>}
        </ul>
      </section>
    );
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pb-24 pt-6 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Negócios</h1>
          <p className="mt-1 text-base text-muted-foreground">{decorrer} negócios a decorrer · {eur0(emProposta)} € em proposta</p>
        </div>
        {seletor}
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

      {!visiveis.length && (
        <div role="status" className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border p-4">
          <p className="text-base text-foreground">Nenhum negócio encontrado.</p>
          <Button type="button" variant="outline" className="min-h-11" onClick={limpar}>Limpar pesquisa e filtro</Button>
        </div>
      )}

      {/* Telemóvel: escolhe-se a coluna */}
      <div className="mt-6 lg:hidden">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Fase do documento">
          {COLUNAS_V2.map(({ id, nome }, i) => (
            <button key={id} type="button" role="tab" id={`v2-tab-${id}`} aria-selected={colMovel === id} aria-controls="v2-painel" tabIndex={colMovel === id ? 0 : -1}
              onClick={() => setColMovel(id)} onKeyDown={(e) => teclaSeparador(e, i)}
              className={cn("min-h-11 shrink-0 rounded-lg px-3 text-[15px]", colMovel === id ? "bg-foreground text-background" : "bg-muted text-foreground")}>
              {nome} <span className="tabular-nums opacity-70">{visiveis.filter((c) => c.doc === id).length}</span>
            </button>
          ))}
        </div>
        <div id="v2-painel" role="tabpanel" aria-labelledby={`v2-tab-${colMovel}`} className="mt-4">{coluna(colMovel, "m")}</div>
      </div>

      {/* Computador: as quatro colunas lado a lado */}
      <div className="mt-8 hidden gap-5 lg:grid lg:grid-cols-4">{COLUNAS_V2.map(({ id }) => coluna(id, "d"))}</div>

      <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-border pt-5">
        <p className="text-[15px] text-muted-foreground">{antes} {antes === 1 ? "pessoa ainda em" : "pessoas ainda em"} lead, contacto ou visita.</p>
        <Button type="button" variant="outline" className="min-h-11" onClick={go(() => A.nav("clientes"))}>Ver em Clientes</Button>
        <p className="text-[15px] text-muted-foreground">Os negócios já em obra veem-se em Operações.</p>
        <Button type="button" variant="outline" className="min-h-11" onClick={go(() => A.nav("operacoes"))}>Ver em Operações</Button>
      </div>
    </div>
  );
}
