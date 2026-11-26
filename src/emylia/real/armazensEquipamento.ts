// 26/11: os armazéns onde um equipamento do Catálogo pode ficar (cat_equipamentos.warehouse_id). Os da organização, ativos e não apagados,
// sem as viaturas (is_vehicle). Lê-se uma vez por organização, só quando o ecrã dos equipamentos (ou o Criar equipamento) abre.
import { useEffect, useState } from "react";

export interface ArmazemEquip { id: string; nome: string; codigo: string | null }
interface LinhaArmazem { id: string; name: string | null; code: string | null; is_vehicle?: boolean | null }

/** As linhas de warehouses em opções: sem viaturas, pelo nome. */
export function armazensParaEquipamento(linhas: readonly LinhaArmazem[] | null | undefined): ArmazemEquip[] {
  return (linhas ?? [])
    .filter((w) => w && typeof w.id === "string" && w.is_vehicle !== true)
    .map((w) => ({ id: w.id, nome: (w.name ?? "").trim() || "Armazém sem nome", codigo: w.code ?? null }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
}

/** As opções do seletor: «Sem armazém» e os armazéns. O armazém atual que já não está na lista (desativado, apagado, viatura) fica, com o nome que a leitura trouxe. */
export function opcoesArmazemEquip(L: readonly ArmazemEquip[], atual?: { id?: string | null; nome?: string | null }): { v: string; t: string }[] {
  const out = [{ v: "", t: "Sem armazém" }, ...L.map((a) => ({ v: a.id, t: a.codigo ? `${a.nome} (${a.codigo})` : a.nome }))];
  if (atual?.id && !L.some((a) => a.id === atual.id)) out.push({ v: atual.id, t: atual.nome?.trim() || "Armazém atual" });
  return out;
}

// o cliente só se carrega quando é preciso (o CatalogoV1 também corre no protótipo e nos testes sem base)
const cliente = () => import("@/integrations/supabase/client").then((m) => m.supabase);

export async function lerArmazensEquipamento(org: string): Promise<ArmazemEquip[]> {
  // is_vehicle pode não estar nos tipos gerados
  const sb = (await cliente()) as any;
  const { data, error } = await sb.from("warehouses").select("id,name,code,is_vehicle").eq("organization_id", org).eq("is_active", true).is("deleted_at", null);
  if (error) throw new Error((error as { message?: string }).message || "Não foi possível ler os armazéns.");
  return armazensParaEquipamento(data as LinhaArmazem[] | null);
}

const cache = new Map<string, Promise<ArmazemEquip[]>>();

/** Os armazéns da organização para os equipamentos; undefined sem organização (protótipo) ou enquanto não se pediu/leu. `ativo` = só lê quando o ecrã precisa. */
export function useArmazensEquipamento(org: string | undefined, ativo: boolean): ArmazemEquip[] | undefined {
  const [L, setL] = useState<{ org: string; v: ArmazemEquip[] } | null>(null);
  useEffect(() => {
    if (!org || !ativo || L?.org === org) return undefined;
    let vivo = true;
    let p = cache.get(org);
    if (!p) { p = lerArmazensEquipamento(org); cache.set(org, p); }
    p.then((v) => { if (vivo) setL({ org, v }); }, () => { cache.delete(org); if (vivo) setL({ org, v: [] }); });
    return () => { vivo = false; };
  }, [org, ativo, L?.org]);
  return org && L?.org === org ? L.v : undefined;
}

/** Para os testes: esquece o que se leu. */
export function limparArmazensEquipamento() { cache.clear(); }
