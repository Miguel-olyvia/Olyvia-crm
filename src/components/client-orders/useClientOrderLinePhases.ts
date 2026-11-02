// O Catálogo das linhas de uma Encomenda de Cliente, para as secções e as fases da obra (clientOrderLinePhases.ts). Só leitura e
// best-effort: products (tipo_catalogo, servico_id), services (nome, fases, chave, categoria), service_categories (o ofício) e
// service_materials ativos (a receita dos serviços da encomenda). Se alguma leitura falhar, devolve null e a tabela fica como antes
// (sem fase e tudo em Produtos/Serviços). As colunas do Catálogo (tipo_catalogo, servico_id, fases, chave) não estão nos tipos gerados:
// cast local, como nas outras leituras fora dos tipos desta página.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ClientOrderPhaseCatalog, ClientOrderPhaseLine } from "./clientOrderLinePhases";

interface ProductRow { id: string; tipo_catalogo: string | null; servico_id: string | null }
interface ServiceRow { id: string; name: string; fases: number[] | null; chave: string | null; service_category_id: string | null }
interface CategoryRow { id: string; name: string }
interface RecipeRow { service_id: string; product_id: string }

const uniq = (xs: readonly (string | null | undefined)[]) => Array.from(new Set(xs.filter((x): x is string => !!x))).sort();

async function readCatalog(productIds: string[], serviceIds: string[]): Promise<ClientOrderPhaseCatalog> {
  const sb = supabase as any;
  const [prodRes, recRes] = await Promise.all([
    productIds.length
      ? sb.from("products").select("id, tipo_catalogo, servico_id").in("id", productIds)
      : Promise.resolve({ data: [], error: null }),
    serviceIds.length
      ? sb.from("service_materials").select("service_id, product_id").in("service_id", serviceIds).is("deleted_at", null)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (prodRes.error) throw prodRes.error;
  if (recRes.error) throw recRes.error;
  const products = (prodRes.data || []) as ProductRow[];
  // Os serviços da encomenda e os que instalam os produtos dela. A regra só usa os da encomenda (o que instala um produto só conta se
  // estiver na encomenda: clientOrderLinePhases.ts); os outros vêm na mesma leitura e ficam no Catálogo devolvido.
  const allServiceIds = uniq([...serviceIds, ...products.map((p) => p.servico_id)]);
  const svcRes = allServiceIds.length
    ? await sb.from("services").select("id, name, fases, chave, service_category_id").in("id", allServiceIds)
    : { data: [], error: null };
  if (svcRes.error) throw svcRes.error;
  const services = (svcRes.data || []) as ServiceRow[];
  const categoryIds = uniq(services.map((s) => s.service_category_id));
  const catRes = categoryIds.length
    ? await sb.from("service_categories").select("id, name").in("id", categoryIds)
    : { data: [], error: null };
  if (catRes.error) throw catRes.error;
  const categoryName = new Map(((catRes.data || []) as CategoryRow[]).map((c) => [c.id, c.name]));

  const out: ClientOrderPhaseCatalog = { products: {}, services: {}, recipes: {} };
  for (const p of products) out.products[p.id] = { tipo_catalogo: p.tipo_catalogo ?? null, servico_id: p.servico_id ?? null };
  for (const s of services) {
    out.services[s.id] = {
      name: s.name,
      fases: s.fases ?? null,
      chave: s.chave ?? null,
      categoria: s.service_category_id ? categoryName.get(s.service_category_id) ?? null : null,
    };
  }
  for (const r of (recRes.data || []) as RecipeRow[]) (out.recipes[r.service_id] ||= []).push(r.product_id);
  return out;
}

export function useClientOrderLinePhases(
  organizationId: string | null | undefined,
  lines: readonly ClientOrderPhaseLine[] | null | undefined,
): ClientOrderPhaseCatalog | null {
  const productIds = uniq((lines ?? []).map((l) => (l.item_type === "service" ? null : l.product_id)));
  const serviceIds = uniq((lines ?? []).map((l) => (l.item_type === "service" ? l.service_id : null)));
  const query = useQuery({
    queryKey: ["client-order-line-phases", organizationId, productIds, serviceIds],
    enabled: !!organizationId && productIds.length + serviceIds.length > 0,
    staleTime: 60_000,
    retry: false,
    queryFn: (): Promise<ClientOrderPhaseCatalog> =>
      readCatalog(productIds, serviceIds).catch((e) => {
        console.warn("[ClientOrders] não foi possível ler o Catálogo para as fases das linhas", e);
        throw e;
      }),
  });

  return query.data ?? null;
}
