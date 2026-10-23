// Seletor de produto de uma linha da encomenda manual (campo "Produto, SKU ou
// EAN" do protótipo). Catálogo `products` da organização ativa
// (product_organizations), só artigos ativos e vendáveis — os mesmos filtros
// do AddItemsDialog dos orçamentos, porque as linhas acabam em quote_lines.
// Âmbito de organizações igual ao do AddItemsDialog aberto nesta página
// (resolveOrgScope: organização ativa + filhas diretas em anew_hierarchy). O
// helper é interno ao AddItemsDialog, por isso está replicado em
// `resolveOrgScope` abaixo — manter os dois iguais.
// Preço de venda e IVA: a linha "retail" mais recente de product_prices
// (mesma escolha do AddItemsDialog).
//
// Dentro de um Dialog o Popover tem de ser `modal`, senão o focus trap do
// diálogo rouba o foco e a lista abre e fecha-se sozinha.
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { escapePostgrestOrTerm } from "@/lib/clientSearch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export interface ClientOrderCatalogProduct {
  id: string;
  name: string;
  sku: string | null;
  category_name: string | null;
  retail_price: number | null;
  vat_rate: number | null;
}

interface ProductRow {
  id: string;
  name: string;
  sku: string | null;
  barcode?: string | null;
  product_categories?: { name: string | null } | null;
}

const SEARCH_LIMIT = 30;

// Cópia de AddItemsDialog.resolveOrgScope: organização ativa + filhas diretas.
async function resolveOrgScope(rootOrgId: string): Promise<string[]> {
  const ids = [rootOrgId];
  try {
    const { data: children } = await supabase
      .from("anew_hierarchy")
      .select("child_org_id")
      .eq("parent_org_id", rootOrgId);
    for (const c of children || []) {
      if (c.child_org_id && !ids.includes(c.child_org_id)) ids.push(c.child_org_id);
    }
  } catch { /* ignore — fica só a organização ativa */ }
  return ids;
}

interface Props {
  organizationId: string | null | undefined;
  /** Texto do produto escolhido ("SKU — nome"); vazio = por escolher. */
  valueLabel: string;
  selectedId: string | null;
  onSelect: (product: ClientOrderCatalogProduct) => void;
  disabled?: boolean;
  ariaLabel: string;
}

export function ClientOrderProductPicker({ organizationId, valueLabel, selectedId, onSelect, disabled, ariaLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [resolving, setResolving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(id);
  }, [search]);

  const { data: orgScope } = useQuery({
    queryKey: ["client-order-product-picker-org-scope", organizationId],
    enabled: open && !!organizationId,
    staleTime: 5 * 60_000,
    queryFn: () => resolveOrgScope(organizationId as string),
  });

  const { data: rows = [], isFetching, isError } = useQuery({
    queryKey: ["client-order-product-picker", orgScope, debounced.trim()],
    enabled: open && !!orgScope && orgScope.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<ProductRow[]> => {
      let q = (supabase as any)
        .from("products")
        .select("id, sku, name, barcode, product_categories!category_id(name), product_organizations!inner(organization_id)")
        .in("product_organizations.organization_id", orgScope as string[])
        .eq("is_active", true)
        .eq("is_sellable", true)
        .eq("status", "active")
        .is("deleted_at", null);
      const safe = escapePostgrestOrTerm(debounced.trim());
      if (safe) q = q.or(`name.ilike.%${safe}%,sku.ilike.%${safe}%,barcode.ilike.%${safe}%`);
      const { data, error } = await q.order("name").order("id").limit(SEARCH_LIMIT);
      if (error) throw error;
      return (data || []) as ProductRow[];
    },
  });

  const choose = async (row: ProductRow) => {
    setResolving(true);
    let price: number | null = null;
    let vat: number | null = null;
    try {
      const { data, error } = await (supabase as any)
        .from("product_prices")
        .select("price, vat_rate, created_at")
        .eq("product_id", row.id)
        .eq("price_type", "retail")
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      const p = (data || [])[0] as { price: number | null; vat_rate: number | null } | undefined;
      price = p?.price ?? null;
      vat = p?.vat_rate ?? null;
    } catch (error: any) {
      // A linha fica a 0 € (preço editável à mão), mas o utilizador é avisado.
      toast({
        title: "Não foi possível ler o preço do produto",
        description: `${error?.message ? `${error.message} — ` : ""}a linha fica a 0 €; confirme o preço e o IVA à mão.`,
        variant: "destructive",
      });
    } finally {
      setResolving(false);
    }
    onSelect({
      id: row.id,
      name: row.name,
      sku: row.sku ?? null,
      category_name: row.product_categories?.name ?? null,
      retail_price: price,
      vat_rate: vat,
    });
    setOpen(false);
    setSearch("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={disabled || resolving}
          className={cn(
            "flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            !valueLabel && "text-muted-foreground",
          )}
        >
          <span className="truncate">{valueLabel || "Produto, SKU ou EAN"}</span>
          {resolving ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin opacity-60" aria-hidden="true" />
          ) : (
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[320px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Pesquisar por nome, SKU ou EAN…" value={search} onValueChange={setSearch} />
          <CommandList>
            {isFetching && rows.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> A procurar…
              </div>
            ) : isError ? (
              <div role="alert" className="py-6 text-center text-sm text-destructive">
                Erro ao pesquisar produtos. Tente novamente.
              </div>
            ) : (
              <CommandEmpty>Nenhum produto encontrado.</CommandEmpty>
            )}
            <CommandGroup>
              {rows.map((row) => (
                <CommandItem key={row.id} value={row.id} onSelect={() => void choose(row)}>
                  <Check className={cn("mr-2 h-4 w-4", selectedId === row.id ? "opacity-100" : "opacity-0")} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">
                    {row.sku ? <span className="font-mono text-xs text-muted-foreground">{row.sku} — </span> : null}
                    {row.name}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
