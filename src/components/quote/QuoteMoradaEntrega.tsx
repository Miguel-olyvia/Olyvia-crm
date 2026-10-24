import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Building2, Loader2, Pencil, Plus, RefreshCw, Truck } from "lucide-react";
import { DeliveryAddressForm } from "@/components/clients/DeliveryAddressForm";
import { FichaLocalResumo } from "@/components/addresses/FichaLocalResumo";
import { SugestaoFichaLocalPainel } from "@/components/addresses/SugestaoFichaLocalPainel";
import {
  formatDeliveryAddress,
  listEntityDeliveryAddresses,
  type EntityDeliveryAddress,
} from "@/lib/addresses/entityDeliveryAddresses";

export interface QuoteMoradaEntregaProps {
  /** Entidade da lead/cliente do orçamento; null = ainda não foi escolhida. */
  entityId: string | null;
  /** anew_addresses.id escolhido (quotes.site_address_id); null = nenhum. */
  value: string | null;
  /**
   * Chamado quando o utilizador (ou a escolha por defeito) muda a morada.
   * `address` vem null quando se limpa a escolha.
   */
  onChange: (addressId: string | null, address: EntityDeliveryAddress | null) => void;
  /**
   * Texto já gravado no orçamento (quotes.obra_endereco). Mostra-se como
   * opção quando a morada gravada já não está na lista (foi editada ou
   * removida na ficha) ou quando o orçamento é anterior a esta escolha (só
   * texto). Enquanto houver texto gravado não se escolhe a 1.ª por defeito.
   */
  savedText?: string | null;
  disabled?: boolean;
  /**
   * deal_needs.id das áreas já no orçamento (linhas importadas do negócio):
   * as medidas da visita afinam a sugestão de proteções e logística.
   */
  needIds?: string[];
}

const textoMorada = (address: EntityDeliveryAddress) =>
  formatDeliveryAddress(address) || address.formatted || "—";

/**
 * Morada de entrega / do serviço do orçamento: lista as moradas de entrega da
 * entidade (a PRIMEIRA fica escolhida por defeito), permite acrescentar uma
 * nova (fica escolhida) e editar a escolhida. Os formulários são o
 * DeliveryAddressForm da ficha do cliente — mesmas regras, mesma RPC.
 */
export const QuoteMoradaEntrega = ({ entityId, value, onChange, savedText, disabled, needIds }: QuoteMoradaEntregaProps) => {
  const [addresses, setAddresses] = useState<EntityDeliveryAddress[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mode, setMode] = useState<"idle" | "add" | "edit">("idle");
  // Último pedido, para ignorar respostas fora de ordem ao trocar de entidade.
  const requestRef = useRef<string | null>(null);
  // Props mais recentes, lidas depois de carregar (sem recarregar a cada escolha).
  const latest = useRef({ value, savedText, onChange });
  latest.current = { value, savedText, onChange };

  const load = useCallback(async (selectAddressId?: string) => {
    if (!entityId) return;
    requestRef.current = entityId;
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await listEntityDeliveryAddresses(entityId);
      if (requestRef.current !== entityId) return;
      setAddresses(rows);
      const { value: current, savedText: saved, onChange: notify } = latest.current;
      if (selectAddressId) {
        const chosen = rows.find((r) => r.address_id === selectAddressId) ?? null;
        notify(selectAddressId, chosen);
      } else if (!current && !saved?.trim() && rows.length > 0) {
        // Por defeito: a primeira morada de entrega (a mais antiga).
        notify(rows[0].address_id, rows[0]);
      }
    } catch (error: unknown) {
      if (requestRef.current !== entityId) return;
      console.error("[QuoteMoradaEntrega] load failed:", error, { entityId });
      setLoadError(error instanceof Error ? error.message : (error as { message?: string })?.message || "Erro desconhecido");
    } finally {
      if (requestRef.current === entityId) setLoading(false);
    }
  }, [entityId]);

  useEffect(() => {
    setAddresses([]);
    setMode("idle");
    setLoadError(null);
    if (!entityId) {
      requestRef.current = null;
      return;
    }
    void load();
  }, [entityId, load]);

  if (!entityId) {
    return (
      <div className="space-y-1">
        <Label className="flex items-center gap-2"><Truck className="h-4 w-4" />Morada de entrega / do serviço</Label>
        <p className="text-sm text-muted-foreground">Escolha primeiro a lead ou o cliente.</p>
      </div>
    );
  }

  const selected = value ? addresses.find((a) => a.address_id === value) ?? null : null;
  // Morada gravada no orçamento que já não está na lista (ou orçamento antigo, só com texto).
  const savedOnly = !selected && !!savedText?.trim() && !loading;
  const busy = !!disabled || loading;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="flex items-center gap-2">
          <Truck className="h-4 w-4" />Morada de entrega / do serviço
          {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" aria-label="A carregar moradas" />}
        </Label>
        <div className="flex items-center gap-1">
          {selected && mode !== "edit" && (
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs"
              onClick={() => setMode("edit")} disabled={busy}>
              <Pencil className="h-3 w-3 mr-1" />Editar
            </Button>
          )}
          {mode !== "add" && (
            <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs"
              onClick={() => setMode("add")} disabled={busy}>
              <Plus className="h-3 w-3 mr-1" />Nova morada de entrega
            </Button>
          )}
        </div>
      </div>

      {loadError && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2">
          <p className="text-sm text-destructive">Não foi possível carregar as moradas de entrega: {loadError}</p>
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => void load()}>
            <RefreshCw className="h-3 w-3 mr-1" />Tentar de novo
          </Button>
        </div>
      )}

      {!loading && !loadError && addresses.length === 0 && !savedOnly && mode !== "add" && (
        <p className="text-sm text-muted-foreground">
          Este cliente ainda não tem moradas de entrega. Acrescente uma com “Nova morada de entrega”.
        </p>
      )}

      {(addresses.length > 0 || savedOnly) && (
        <div role="radiogroup" aria-label="Morada de entrega" className="space-y-1.5">
          {savedOnly && (
            <div
              role="radio"
              aria-checked
              className="w-full rounded-md border border-primary bg-primary/5 px-3 py-2 text-left"
            >
              <p className="text-sm">{savedText}</p>
              <p className="text-xs text-muted-foreground">
                Morada gravada neste orçamento (já não está nas moradas de entrega do cliente). Escolha outra para a substituir.
              </p>
            </div>
          )}
          {addresses.map((address) => {
            const checked = address.address_id === value;
            return (
              <button
                key={address.entity_address_id}
                type="button"
                role="radio"
                aria-checked={checked}
                disabled={!!disabled}
                onClick={() => { if (!checked) { setMode("idle"); onChange(address.address_id, address); } }}
                className={cn(
                  "w-full rounded-md border px-3 py-2 text-left text-sm transition-colors",
                  checked ? "border-primary bg-primary/5" : "hover:bg-muted",
                )}
              >
                {textoMorada(address)}
              </button>
            );
          })}
        </div>
      )}

      {selected && mode === "idle" && (
        <div className="flex items-start gap-1.5 text-xs text-muted-foreground" data-testid="quote-morada-ficha-tecnica">
          <Building2 className="h-3.5 w-3.5 shrink-0 mt-px" />
          <FichaLocalResumo
            ficha={selected.ficha_tecnica}
            piso={selected.floor}
            vazio="Ficha do local por preencher (use “Editar”)."
          />
        </div>
      )}

      {selected && mode === "idle" && (
        <SugestaoFichaLocalPainel ficha={selected.ficha_tecnica} piso={selected.floor} needIds={needIds} />
      )}

      {mode === "add" && (
        <div className="rounded-md border p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Nova morada de entrega</p>
          <DeliveryAddressForm
            entityId={entityId}
            idPrefix="quote_morada_entrega_nova"
            onAdded={async (result) => {
              setMode("idle");
              await load(result.address_id);
            }}
            onCancel={() => setMode("idle")}
          />
        </div>
      )}

      {mode === "edit" && selected && (
        <div className="rounded-md border p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Editar morada de entrega</p>
          <DeliveryAddressForm
            entityId={entityId}
            idPrefix="quote_morada_entrega_editar"
            key={selected.entity_address_id}
            existente={selected}
            onSaved={async (result) => {
              setMode("idle");
              // A edição pode apontar a ligação para outra linha de
              // anew_addresses (address_changed): a escolha segue-a.
              await load(result.address_id);
            }}
            onCancel={() => setMode("idle")}
          />
        </div>
      )}
    </div>
  );
};
