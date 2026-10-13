// Catálogo e custos da V2 (13/10/2026): uma só lista (os serviços em uso e o Catálogo
// real da Mudelar), com "Em uso / Não usado", medida, custo por medida, preço e margem
// de cada um; pesquisa e chips com os alertas. Tocar num serviço abre a ficha no lugar
// da lista (não é modal). Por baixo, os Custos: Parâmetros, Perfis, Equipamentos e Estrutura.
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, CircleCheck, CircleDashed, Search, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { eur, pct, type SvcId } from "../motor";
import type { Ctx } from "../pecas";
import { CHIP } from "../FiltrosPopover";
import { FILTROS, aplicarTodos, listaCatalogo, ordenar, passaFiltro, pesquisar, type Coluna, type Custos, type Filtro } from "./custosModelo";
import { lerCustos, mudarCustos, useCustos } from "./custosStore";
import { FichaServicoV2 } from "./FichaServicoV2";
import { CustosV2 } from "./CustosV2";
import { ICONE_ALERTA, IconeAlerta } from "./pecasCustos";

const ANCORAS = [["cat-servicos", "Serviços"], ["cat-parametros", "Parâmetros"], ["cat-perfis", "Perfis"], ["cat-equipamentos", "Equipamentos"], ["cat-estrutura", "Estrutura"]] as const;
const ICONE_FILTRO: Record<Filtro, keyof typeof ICONE_ALERTA | null> = { uso: null, "sem-receita": "sem-receita", margem: "abaixo-minimo", desatualizado: "desatualizado" };

export function CatalogoV2({ S, run }: Ctx) {
  const C = useCustos();
  const [aberto, setAberto] = useState<SvcId | null>(null);
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<Filtro | null>(null);
  const [ord, setOrd] = useState<{ col: Coluna; asc: boolean }>({ col: "usos", asc: false });
  const [aviso, setAviso] = useState<{ msg: string; antes?: Custos; n: number } | null>(null);
  const voltarPara = useRef<SvcId | null>(null);

  const anunciar = (msg: string, antes?: Custos) => setAviso((a) => ({ msg, antes, n: (a?.n ?? 0) + 1 }));
  const anular = () => {
    if (!aviso?.antes) return;
    const antes = aviso.antes;
    mudarCustos(() => antes);
    run(() => aplicarTodos(S, lerCustos()));
    setAviso((a) => ({ msg: "Anulado", n: (a?.n ?? 0) + 1 }));
  };

  // Ao voltar da ficha, o foco regressa ao serviço de onde se saiu.
  useEffect(() => {
    if (aberto || !voltarPara.current) return;
    document.getElementById(`svc-${voltarPara.current}`)?.focus();
    voltarPara.current = null;
  }, [aberto]);

  const todos = listaCatalogo(S, C);
  const pesquisados = pesquisar(todos, q);
  const contagem = (f: Filtro) => pesquisados.filter((i) => passaFiltro(i, f)).length;
  const lista = ordenar(pesquisados.filter((i) => passaFiltro(i, filtro)), ord.col, ord.asc);

  const regiao = (
    <div aria-live="polite" role="status" className="pointer-events-none sticky bottom-4 z-10 mt-6 flex justify-center">
      {aviso && (
        <p key={aviso.n} className="pointer-events-auto flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-2 text-[15px] shadow-[var(--shadow-sm)]">
          <span>{aviso.msg}</span>
          {aviso.antes && <Button variant="outline" className="min-h-11 text-[15px]" onClick={anular}>Anular</Button>}
        </p>
      )}
    </div>
  );

  if (aberto) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 pb-24 pt-6 sm:px-8 sm:pt-10">
        <FichaServicoV2 S={S} C={C} run={run} sid={aberto} voltar={() => { voltarPara.current = aberto; setAberto(null); }} anunciar={(m) => anunciar(m)} />
        {regiao}
      </div>
    );
  }

  const cab = (col: Coluna, t: string, direita = false) => {
    const ativo = ord.col === col;
    const I = !ativo ? ArrowUpDown : ord.asc ? ArrowUp : ArrowDown;
    return (
      <th scope="col" aria-sort={ativo ? (ord.asc ? "ascending" : "descending") : "none"} className={cn("px-2 py-1 text-[15px] font-medium text-muted-foreground", direita ? "text-right" : "text-left")}>
        <button type="button" onClick={() => setOrd(ativo ? { col, asc: !ord.asc } : { col, asc: col === "n" })}
          className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 hover:text-foreground", direita && "flex-row-reverse")}>
          {t}<I className="h-4 w-4" aria-hidden="true" />
        </button>
      </th>
    );
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-8 sm:px-8 sm:pt-12">
      <h1 className="text-3xl font-semibold tracking-tight">Catálogo e custos</h1>
      <p className="mt-2 text-lg text-muted-foreground">Cada serviço com a receita, o custo por medida, o preço e a margem. O orçamento tira daqui o custo.</p>
      <nav aria-label="Nesta página" className="mt-5 flex flex-wrap gap-x-1 gap-y-1">
        {ANCORAS.map(([id, t]) => (
          <a key={id} href={`#${id}`} onClick={(e) => { const el = document.getElementById(id); if (el) { e.preventDefault(); el.scrollIntoView({ behavior: "smooth", block: "start" }); } }}
            className="inline-flex min-h-11 items-center rounded-lg px-3 text-[15px] font-medium underline-offset-4 hover:bg-muted hover:underline">{t}</a>
        ))}
      </nav>

      <section id="cat-servicos" aria-labelledby="cat-servicos-t" className="mt-8 scroll-mt-6">
        <h2 id="cat-servicos-t" className="text-2xl font-semibold tracking-tight">Serviços</h2>
        <label className="relative mt-4 block max-w-xl">
          <span className="sr-only">Procurar serviço</span>
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar serviço ou ofício"
            className="h-11 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25" />
        </label>
        <div role="group" aria-label="Filtrar" className="mt-3 flex flex-wrap gap-2">
          {FILTROS.map((f) => {
            const ic = ICONE_FILTRO[f.id], I = ic ? ICONE_ALERTA[ic].I : CircleCheck;
            return (
              <button key={f.id} type="button" aria-pressed={filtro === f.id} onClick={() => setFiltro(filtro === f.id ? null : f.id)} className={cn(CHIP(filtro === f.id), "inline-flex items-center gap-2")}>
                <I className={cn("h-4 w-4", ic && filtro !== f.id ? ICONE_ALERTA[ic].cor : "")} aria-hidden="true" />
                {f.t} <span className="tabular-nums opacity-70">{contagem(f.id)}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-4 text-[15px] text-muted-foreground" aria-live="polite">
          {lista.length} de {todos.length} serviços{filtro ? ` · ${FILTROS.find((f) => f.id === filtro)!.t}` : ""}{q.trim() ? ` · "${q.trim()}"` : ""}
        </p>

        <div className="mt-2 overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[880px] border-collapse">
            <caption className="sr-only">Serviços do Catálogo, com medida, custo por medida, preço, margem e alertas</caption>
            <thead>
              <tr className="border-b border-border">
                {cab("n", "Serviço")}
                {cab("usos", "Uso")}
                <th scope="col" className="px-2 py-1 text-left text-[15px] font-medium text-muted-foreground">Medida</th>
                {cab("custo", "Custo por medida", true)}
                {cab("preco", "Preço", true)}
                {cab("m", "Margem", true)}
                <th scope="col" className="px-2 py-1 text-left text-[15px] font-medium text-muted-foreground">Alertas</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((i) => {
                const baixa = i.alertas.some((a) => a.id === "abaixo-minimo" || a.id === "abaixo-custo");
                return (
                  <tr key={i.sid} className="border-b border-border last:border-b-0 hover:bg-muted/40">
                    <th scope="row" className="px-2 py-1.5 text-left font-normal">
                      <button id={`svc-${i.sid}`} type="button" onClick={() => setAberto(i.sid)} className="block min-h-11 w-full rounded-lg px-1 py-1 text-left hover:underline">
                        <span className="block text-[15px] font-medium">{i.n}</span>
                        <span className="block text-[15px] text-muted-foreground">{i.oficio}</span>
                      </button>
                    </th>
                    <td className="px-2 py-1.5 text-[15px]">
                      <span className="inline-flex items-center gap-1.5">
                        {i.emUso ? <CircleCheck className="h-4 w-4 text-success" aria-hidden="true" /> : <CircleDashed className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
                        {i.emUso ? "Em uso" : "Não usado"}
                      </span>
                      {i.usos > 0 && <span className="block text-[15px] text-muted-foreground">em {i.usos} orçamentos</span>}
                    </td>
                    <td className="px-2 py-1.5 text-[15px]">{i.un}</td>
                    <td className="px-2 py-1.5 text-right text-[15px] tabular-nums">{eur(i.c.total)} €</td>
                    <td className="px-2 py-1.5 text-right text-[15px] tabular-nums">{eur(i.preco)} €</td>
                    <td className="px-2 py-1.5 text-right text-[15px] tabular-nums">
                      <span className="inline-flex items-center gap-1.5">
                        {baixa && <TriangleAlert className="h-4 w-4 text-destructive" aria-hidden="true" />}{pct(i.m)}
                        {baixa && <span className="sr-only"> (abaixo do mínimo de {i.min}%)</span>}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      {i.alertas.length ? (
                        <ul className="flex flex-wrap gap-1.5" aria-label={`Alertas de ${i.n}`}>
                          {i.alertas.map((a) => <li key={a.id} title={a.t}><IconeAlerta a={a} /><span className="sr-only">{a.t}</span></li>)}
                        </ul>
                      ) : <span className="sr-only">Sem alertas</span>}
                    </td>
                  </tr>
                );
              })}
              {!lista.length && <tr><td colSpan={7} className="px-3 py-4 text-[15px] text-muted-foreground">Nada com esse nome ou filtro.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[15px] text-muted-foreground">Exemplo: os nomes, horas e usos são os do Catálogo da Mudelar; custos e preços são de exemplo. O que se muda aqui dura até recarregar.</p>
      </section>

      <CustosV2 S={S} C={C} run={run} anunciar={anunciar} />
      {regiao}
    </div>
  );
}
