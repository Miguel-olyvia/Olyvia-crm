// Marcar armazéns em lote (29/10), nos separadores Produtos e Consumíveis do Catálogo e custos: "Selecionar" põe caixas nas linhas,
// "Selecionar todos os filtrados" respeita a pesquisa e o ofício, e "Marcar/Desmarcar armazém" chama cat_definir_armazem_produtos.
// Os armazéns só dizem onde o produto está ou pode estar (o stock gere-se sempre); o que a base recusa vem com o motivo. Só com inventory.edit.
import { useCallback, useEffect, useState } from "react";
import { CheckSquare, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Escolha } from "./v2/pecasCustos";
import { definirArmazemProdutos, eUuid, lerArmazensOrg, type ArmazemOrg, type FichaProdutoReal, type ResArmazens } from "./fichaProdutoDados";

const NOTA = "text-[15px] text-muted-foreground";

/** A seleção: null = fora do modo Selecionar. */
export function useSelecao() {
  const [sel, setSel] = useState<Set<string> | null>(null);
  const alternar = useCallback((id: string) => setSel((s) => { if (!s) return s; const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }), []);
  return { sel, entrar: () => setSel(new Set()), sair: () => setSel(null), alternar, por: (ids: string[]) => setSel(new Set(ids)) };
}
export type Selecao = ReturnType<typeof useSelecao>;

/** A caixa da linha (só no modo Selecionar). Não deixa o clique chegar à linha. */
export function CaixaLinha({ id, nome, s }: { id: string; nome: string; s: Selecao }) {
  if (!s.sel) return null;
  return (
    <input type="checkbox" className="h-5 w-5 shrink-0 accent-[hsl(var(--primary))]" checked={s.sel.has(id)} disabled={!eUuid(id)}
      onClick={(e) => e.stopPropagation()} onChange={() => s.alternar(id)} aria-label={`Selecionar ${nome}`} />
  );
}

/** O botão "Selecionar" e, no modo, a barra com os filtrados, o armazém e as ações. */
export function BarraSelecao({ s, filtrados, real, anunciar, tipo }: {
  s: Selecao; filtrados: { id?: string }[]; real?: FichaProdutoReal; anunciar: (msg: string) => void; tipo: "produtos" | "consumíveis";
}) {
  const [armazens, setArmazens] = useState<ArmazemOrg[] | null>(null);
  const [w, setW] = useState("");
  const [aGravar, setAGravar] = useState(false);
  const [res, setRes] = useState<{ ativo: boolean; r: ResArmazens; nome: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const ativo = !!s.sel;
  useEffect(() => {
    if (!ativo || !real || armazens) return undefined;
    let vivo = true;
    void lerArmazensOrg(real.org).then((r) => { if (!vivo) return; if (r.ok) setArmazens(r.v); else setErro(r.erro); });
    return () => { vivo = false; };
  }, [ativo, real, armazens]);
  if (!real?.podeStock) return null;
  if (!s.sel) {
    return (
      <Button variant="outline" className="min-h-11 text-[15px]" onClick={() => { setRes(null); setErro(null); s.entrar(); }}>
        <CheckSquare className="mr-1 h-4 w-4" aria-hidden="true" />Selecionar
      </Button>
    );
  }
  const ids = filtrados.map((x) => x.id).filter((x): x is string => !!x && eUuid(x));
  const n = s.sel.size;
  const escolhido = armazens?.find((a) => a.id === w);
  const fazer = async (marcar: boolean) => {
    if (!escolhido || !n || !s.sel) return;
    setAGravar(true); setErro(null); setRes(null);
    const r = await definirArmazemProdutos([...s.sel], escolhido.id, marcar);
    if (!r.ok) { setAGravar(false); setErro(r.erro); return; }
    setRes({ ativo: marcar, r: r.v, nome: escolhido.name });
    anunciar(`${escolhido.name}: ${r.v.alterados} ${marcar ? "marcados" : "desmarcados"}${r.v.recusados.length ? `, ${r.v.recusados.length} recusados` : ""}.`);
    try { await real.recarregar(); } catch { /* fica o que está */ }
    setAGravar(false);
  };
  return (
    <div role="region" aria-label="Marcar armazéns" className="mt-4 w-full rounded-xl border border-primary/30 bg-primary/5 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[15px] font-medium" aria-live="polite">{n === 1 ? "1 selecionado" : `${n} selecionados`}</span>
        <Button variant="outline" className="min-h-11 text-[15px]" onClick={() => s.por(ids)}>Selecionar todos os filtrados ({ids.length})</Button>
        {n > 0 && <Button variant="ghost" className="min-h-11 text-[15px]" onClick={() => s.por([])}>Limpar</Button>}
        <Button variant="ghost" className="ml-auto min-h-11 text-[15px]" onClick={s.sair} aria-label="Sair da seleção"><X className="mr-1 h-4 w-4" aria-hidden="true" />Sair</Button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Escolha rotulo="Armazém" w="w-full sm:w-64" v={w} onSet={setW}
          opcoes={[{ v: "", t: armazens ? "Escolher o armazém…" : "A ler os armazéns…" }, ...(armazens ?? []).map((a) => ({ v: a.id, t: `${a.name}${a.is_active ? "" : " (inativo)"}${a.serves_customers ? "" : " · não serve clientes"}` }))]} />
        <Button className="min-h-11 text-[15px]" disabled={!escolhido || !n || aGravar} onClick={() => void fazer(true)}>
          {aGravar && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}Marcar armazém
        </Button>
        <Button variant="outline" className="min-h-11 text-[15px]" disabled={!escolhido || !n || aGravar} onClick={() => void fazer(false)}>Desmarcar armazém</Button>
      </div>
      <p className={cn(NOTA, "mt-2")}>O armazém marcado passa a ter os {tipo} selecionados; desmarcar só se não tiverem stock nem movimentos em aberto lá.</p>
      {erro && <p className="mt-2 text-[15px] text-destructive" role="alert">{erro}</p>}
      {res && (
        <div className="mt-2 text-[15px]" role="status">
          <p>
            {res.nome}: {res.r.alterados} {res.ativo ? "marcados" : "desmarcados"}
            {res.r.recusados.length ? ` · ${res.r.recusados.length} recusados:` : "."}
          </p>
          {res.r.recusados.length > 0 && (
            <ul aria-label="Recusados" className="mt-1 list-disc pl-5">
              {res.r.recusados.map((x) => <li key={x.product_id}><span className="font-medium">{x.nome}</span> — {x.motivo}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
