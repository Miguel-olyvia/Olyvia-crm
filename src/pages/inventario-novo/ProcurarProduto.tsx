// "Ver produto" no separador Existências: a pesquisa que abre o painel do produto (PainelProduto). Fica por cima do ecrã clássico,
// na moldura, para não mexer no Stocks.tsx. Procura como a lista de Existências (Stocks.tsx, buildStocksQuery): linhas de
// `stocks` da organização com o embed products!inner filtrado por nome, SKU ou EAN (o mesmo escapePostgrestOrTerm), por isso só
// aparecem produtos que a lista também mostra.
import { useEffect, useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PackageSearch } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { escapePostgrestOrTerm } from "@/lib/clientSearch";
import { Input } from "@/components/ui/input";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface ResultadoProduto {
  id: string;
  nome: string;
  sku: string | null;
  ean: string | null;
}

const MAX = 8;
/** Linhas de `stocks` pedidas (uma por produto × armazém) para chegar a MAX produtos distintos. */
const LINHAS = 200;

export function ProcurarProduto({ aoEscolher }: { aoEscolher: (id: string) => void }) {
  const { activeCompany } = useCompany();
  const orgId = activeCompany?.id ?? null;
  const [texto, setTexto] = useState("");
  const [termo, setTermo] = useState("");
  const listaId = useId();

  useEffect(() => {
    const t = setTimeout(() => setTermo(escapePostgrestOrTerm(texto.trim())), 300);
    return () => clearTimeout(t);
  }, [texto]);

  const { data: resultados = [], isFetching } = useQuery({
    queryKey: ["inventario-novo-procurar-produto", orgId, termo],
    enabled: !!orgId && termo.length >= 2,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<ResultadoProduto[]> => {
      const { data, error } = await db
        .from("stocks")
        .select("product_id, products!inner(name, sku, barcode), warehouses!inner(deleted_at)")
        .eq("organization_id", orgId)
        .is("deleted_at", null)
        // Só armazéns ativos, como a lista e o painel (um produto só com stock num armazém apagado não aparece).
        .is("warehouses.deleted_at", null)
        .or(`name.ilike.%${termo}%,sku.ilike.%${termo}%,barcode.ilike.%${termo}%`, { referencedTable: "products" })
        // Por produto (as linhas do mesmo produto ficam seguidas); um produto tem uma linha por armazém, por isso
        // pedem-se LINHAS bastantes para chegar a MAX produtos distintos depois de deduplicar.
        .order("product_id", { ascending: true })
        .limit(LINHAS);
      if (error) throw error;
      // Deduplicar por produto e ordenar por nome.
      const vistos = new Map<string, ResultadoProduto>();
      for (const r of (data ?? []) as Array<{ product_id: string; products?: { name?: string; sku?: string | null; barcode?: string | null } | null }>) {
        if (!r.product_id || vistos.has(r.product_id)) continue;
        vistos.set(r.product_id, { id: r.product_id, nome: r.products?.name ?? "—", sku: r.products?.sku ?? null, ean: r.products?.barcode ?? null });
      }
      return [...vistos.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt")).slice(0, MAX);
    },
  });

  const mostrar = termo.length >= 2;

  return (
    <section aria-label="Ver produto" className="rounded-3xl border border-border bg-card p-3 shadow-sm sm:p-4">
      <label htmlFor={`${listaId}-q`} className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
        <PackageSearch className="h-4 w-4 text-primary" aria-hidden="true" />Ver produto
      </label>
      <Input id={`${listaId}-q`} type="search" value={texto} onChange={(e) => setTexto(e.target.value)} className="min-h-11"
        placeholder="Nome, SKU ou EAN — abre o produto com livre, reservas e limites" autoComplete="off" aria-controls={listaId} data-ver-produto="" />
      {mostrar && (
        <ul id={listaId} aria-label="Produtos encontrados" aria-busy={isFetching} className="mt-2 space-y-1">
          {resultados.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => { aoEscolher(r.id); setTexto(""); setTermo(""); }}
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <span className="min-w-0 truncate font-medium">{r.nome}</span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">{[r.sku, r.ean ? `EAN ${r.ean}` : null].filter(Boolean).join(" · ")}</span>
              </button>
            </li>
          ))}
          {!isFetching && resultados.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground">Nenhum produto com existências encontrado.</li>}
        </ul>
      )}
    </section>
  );
}
