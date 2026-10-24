// Os pedidos de reposição das carrinhas (fleet_restock_requests), passo 2: quem tem inventory.edit faz a transferência
// (rpc_fleet_fulfil_restock → rpc_register_stock_transfer, um pedido de cada vez: um sem stock não trava os outros) ou
// cancela o pedido (rpc_fleet_cancel_restock). Duas formas:
//  - AcoesPedido: dentro da Frota (ficha › Stock na carrinha), com o agir do contexto.
//  - PedidosCarrinhasPainel: no Inventário (Stocks), sem o contexto da Frota; lê os pedidos pendentes da organização.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Loader2, Truck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "@/hooks/use-toast";
import type { FleetFulfilResult, FleetRestockRequest } from "@/integrations/supabase/fleetTypes";
import { PERM, useFrotaCtx } from "./contexto";
import { BotaoFrota } from "./pecas";
import { diaDe, fData, fNum, frotaKeys, invalidarFrota, mensagemErroFrota, rpcFrota, tabela } from "./dados";

/** O texto do resultado de "Transferir": quantos passaram (e o documento) e quantos falharam (e porquê). */
export function resumoTransferencia(r: FleetFulfilResult | undefined): string {
  const l = r ?? [];
  const ok = l.filter((x) => x.ok), falhas = l.filter((x) => !x.ok);
  const docs = [...new Set(ok.map((x) => x.document_number).filter(Boolean))].join(", ");
  return [
    ok.length ? `${ok.length} pedido(s) transferido(s) para a carrinha${docs ? ` (${docs})` : ""}.` : "",
    falhas.length ? `${falhas.length} não foi transferido: ${falhas.map((x) => x.error).filter(Boolean).join("; ")}` : "",
  ].filter(Boolean).join(" ") || "Nada para transferir.";
}

/** Transferir (inventory.edit) e Cancelar um ou vários pedidos, dentro da Frota. */
export function AcoesPedido({ pedidos, todos }: { pedidos: FleetRestockRequest[]; todos?: boolean }) {
  const { agir, confirmar } = useFrotaCtx();
  const ids = pedidos.map((p) => p.id);
  return (
    <span className="flex flex-wrap justify-end gap-2">
      <BotaoFrota requer="inventario" variant={todos ? "default" : "outline"} aoClicar={() => void agir("satisfazerReposicao",
        () => rpcFrota("rpc_fleet_fulfil_restock", { p_request_ids: ids }), { ok: resumoTransferencia })}>
        {todos ? `Transferir todos (${ids.length})` : "Transferir"}
      </BotaoFrota>
      {!todos ? (
        <BotaoFrota requer="gerirOuSelf" aoClicar={() => confirmar({
          titulo: "Cancelar o pedido de reposição", ok: "Cancelar pedido", perigo: true, texto: "O pedido sai da lista de quem trata do Inventário. Nada é transferido.",
          aoConfirmar: () => void agir("cancelarReposicao", () => rpcFrota("rpc_fleet_cancel_restock", { p_request_id: ids[0] }), { ok: "Pedido de reposição cancelado." }),
        })}>Cancelar</BotaoFrota>
      ) : null}
    </span>
  );
}

interface LinhaPainel extends FleetRestockRequest {
  fleet_vehicles: { plate: string } | null;
  products: { name: string | null; sku: string | null } | null;
  warehouses: { name: string } | null;
}

/**
 * O painel "Pedidos das carrinhas" do Inventário (Stocks): os pedidos de reposição pendentes da organização, com
 * Transferir e Cancelar. Só aparece a quem tem inventory.edit e quando há pedidos.
 */
export function PedidosCarrinhasPainel({ organizationId, aoMudar }: { organizationId: string; aoMudar?: () => void }) {
  const qc = useQueryClient();
  const { hasPermission, loading } = usePermissions();
  const pode = !loading && hasPermission(PERM.inventario);
  const [aCorrer, setACorrer] = useState<string | null>(null);
  const q = useQuery({
    queryKey: frotaKeys.tabela(organizationId, "pedidos").concat("inventario") as unknown as readonly unknown[],
    queryFn: async (): Promise<LinhaPainel[]> => {
      const { data, error } = await tabela("fleet_restock_requests")
        .select("*, fleet_vehicles(plate), products(name, sku), warehouses!fleet_restock_requests_from_warehouse_id_fkey(name)")
        .eq("organization_id", organizationId).eq("status", "requested").order("requested_at");
      if (error) throw error;
      return (data ?? []) as LinhaPainel[];
    },
    enabled: pode && !!organizationId,
    staleTime: 30_000,
  });
  const linhas = q.data ?? [];
  if (!pode || !linhas.length) return null;

  const correr = async (chave: string, f: () => Promise<string>): Promise<void> => {
    setACorrer(chave);
    try {
      const msg = await f();
      toast({ title: "Pedidos das carrinhas", description: msg });
      await invalidarFrota(qc, organizationId, chave === "cancelar" ? "cancelarReposicao" : "satisfazerReposicao");
      aoMudar?.();
    } catch (e) {
      toast({ title: "Não foi possível", description: mensagemErroFrota(e), variant: "destructive" });
    } finally { setACorrer(null); }
  };
  const transferir = (ids: string[], chave: string) => correr(chave, async () => resumoTransferencia(await rpcFrota("rpc_fleet_fulfil_restock", { p_request_ids: ids })));
  const cancelar = (id: string) => correr("cancelar", async () => { await rpcFrota("rpc_fleet_cancel_restock", { p_request_id: id }); return "Pedido de reposição cancelado."; });

  return (
    <section aria-labelledby="pedidos-carrinhas" className="space-y-2 rounded-lg border bg-card p-4 shadow-sm" data-testid="pedidos-carrinhas">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="pedidos-carrinhas" className="flex items-center gap-2 text-base font-semibold"><Truck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />Pedidos das carrinhas ({linhas.length})</h2>
        <Button type="button" size="sm" className="gap-1.5" disabled={!!aCorrer} onClick={() => void transferir(linhas.map((l) => l.id), "todos")}>
          {aCorrer === "todos" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="h-4 w-4" aria-hidden="true" />}Transferir todos
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">Reposição pedida na Frota: armazém de origem → carrinha. Transferir regista a transferência real (movimento de stock).</p>
      <Table>
        <TableHeader><TableRow>
          <TableHead>Carrinha</TableHead><TableHead>Artigo</TableHead><TableHead className="text-right">Quantidade</TableHead><TableHead>De</TableHead><TableHead>Pedido</TableHead><TableHead><span className="sr-only">Ações</span></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {linhas.map((l) => (
            <TableRow key={l.id}>
              <TableCell className="font-mono">{l.fleet_vehicles?.plate ?? "—"}</TableCell>
              <TableCell>{[l.products?.sku, l.products?.name].filter(Boolean).join(" · ")}{l.last_error ? <div className="text-xs text-destructive">Última tentativa: {l.last_error}</div> : null}</TableCell>
              <TableCell className="text-right tabular-nums">{fNum(l.quantity)}</TableCell>
              <TableCell>{l.warehouses?.name ?? "—"}</TableCell>
              <TableCell className="whitespace-nowrap">{fData(diaDe(l.requested_at))}</TableCell>
              <TableCell className="text-right">
                <span className="flex justify-end gap-2">
                  <Button type="button" size="sm" variant="outline" disabled={!!aCorrer} onClick={() => void transferir([l.id], l.id)} aria-label={`Transferir ${l.products?.name ?? "artigo"} para a ${l.fleet_vehicles?.plate ?? "carrinha"}`}>
                    {aCorrer === l.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}Transferir
                  </Button>
                  <Button type="button" size="sm" variant="ghost" disabled={!!aCorrer} onClick={() => void cancelar(l.id)} aria-label={`Cancelar o pedido de ${l.products?.name ?? "artigo"}`}>
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
