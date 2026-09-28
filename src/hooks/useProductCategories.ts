import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";

// Categorias e subcategorias de produto partilham a tabela product_categories:
// subcategoria = linha com parent_id. Usado pelos filtros Categoria/Subcategoria
// de Stocks, Contagens de Inventário e da folha de contagem. Mesmo âmbito que
// Stocks.tsx/StockCounts.tsx já usavam: categorias da empresa ativa + as
// globais (organization_id nulo). A RLS continua a decidir o que se vê.

export interface ProductCategoryOption {
  id: string;
  name: string;
  parent_id: string | null;
}

const STALE_TIME = 5 * 60 * 1000;
// PostgREST corta uma resposta sem range nas 1000 linhas — paginado por
// segurança, mesmo padrão de fetchAllRows nas páginas de inventário.
const PAGE = 1000;

const byName = (a: ProductCategoryOption, b: ProductCategoryOption) =>
  a.name.localeCompare(b.name, "pt", { sensitivity: "base" });

export function useProductCategories() {
  const { activeCompany } = useCompany();
  const orgId = activeCompany?.id ?? null;

  const { data: all = [], isLoading, error } = useQuery({
    queryKey: ["product-categories-filter", orgId],
    queryFn: async (): Promise<ProductCategoryOption[]> => {
      const rows: ProductCategoryOption[] = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("product_categories")
          .select("id, name, parent_id")
          .or(`organization_id.eq.${orgId},organization_id.is.null`)
          .is("deleted_at", null)
          // is_active é nullable: só fica de fora o que foi mesmo desativado
          // (false) — uma linha antiga com NULL continua a aparecer, como até aqui.
          .not("is_active", "is", false)
          .order("id", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        rows.push(...((data || []) as ProductCategoryOption[]));
        if (!data || data.length < PAGE) break;
        from += PAGE;
      }
      return rows.sort(byName);
    },
    enabled: !!orgId,
    staleTime: STALE_TIME,
  });

  // Categorias de topo (sem parent_id), por ordem alfabética.
  const topLevelCategories = useMemo(() => all.filter((c) => !c.parent_id), [all]);

  // Subcategorias de uma categoria — todas as subcategorias quando a categoria
  // é "all" (mesmo comportamento do filtro de Products.tsx). `all` já vem
  // ordenado, por isso o resultado também.
  const getSubcategories = useCallback(
    (categoryId: string | null | undefined): ProductCategoryOption[] => {
      if (!categoryId || categoryId === "all") return all.filter((c) => !!c.parent_id);
      return all.filter((c) => c.parent_id === categoryId);
    },
    [all],
  );

  // Ids a comparar com products.category_id E products.subcategory_id para o
  // par (categoria, subcategoria) escolhido. null = sem filtro. Subcategoria
  // escolhida → só ela; só categoria → ela + as suas subcategorias (há produtos
  // que guardam o id da folha em category_id sem subcategory_id — mesmo
  // critério de AddItemsDialog.tsx). Não trata "Sem categoria": quem o oferece
  // compara category_id com nulo.
  const resolveFilterIds = useCallback(
    (categoryId: string, subcategoryId: string): string[] | null => {
      if (subcategoryId && subcategoryId !== "all") return [subcategoryId];
      if (!categoryId || categoryId === "all") return null;
      return [categoryId, ...all.filter((c) => c.parent_id === categoryId).map((c) => c.id)];
    },
    [all],
  );

  return { categories: all, topLevelCategories, getSubcategories, resolveFilterIds, isLoading, error };
}

// Versão client-side do mesmo critério (folha de contagem, linhas já em memória).
export const productMatchesCategoryIds = (
  product: { category_id?: string | null; subcategory_id?: string | null } | null | undefined,
  ids: string[] | null,
): boolean => {
  if (!ids) return true;
  if (!product) return false;
  return (
    (!!product.category_id && ids.includes(product.category_id)) ||
    (!!product.subcategory_id && ids.includes(product.subcategory_id))
  );
};
