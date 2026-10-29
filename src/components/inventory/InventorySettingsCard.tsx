// Cartão "Definições de inventário" do ecrã Armazém › Armazéns (Definicoes() do
// protótipo ArmazensInv). Lê organization_inventory_settings e grava por
// rpc_upsert_inventory_settings — exatamente o que Settings.tsx faz — e exige a
// mesma permissão (inventory.edit; sem ela o cartão não aparece, como lá).
// Diferença de UX face a Settings.tsx: o armazém por defeito grava logo ao mudar
// (como no protótipo; ignora valor vazio ou igual ao atual); o momento da baixa
// de stock pede confirmação antes de gravar, porque afeta toda a organização.
// A RPC recebe sempre os dois valores atuais.
//
// API:
//   <InventorySettingsCard organizationId />
//   useInventorySettings(organizationId) → { data: { stock_deduction_trigger, default_warehouse_id } | null }
//     (partilhado com os cartões dos armazéns para o distintivo "Por defeito").
import { useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/lib/toast";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";
import { supabase } from "@/integrations/supabase/client";
import { PermissionGate } from "@/components/PermissionGate";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// 29/10: 'contract_signed' = automático (a baixa e o pedido ao fornecedor acontecem quando a encomenda de cliente é emitida —
// nos Negócios depois da fatura e do pagamento validados); 'manual' = só pela Saída para clientes. 'proposal_accepted' é o modo
// antigo: já não se escolhe, mas se uma organização o tiver continua a aparecer (só leitura) para nada mudar sem ninguém ver.
export type StockDeductionTrigger = "contract_signed" | "manual" | "proposal_accepted";

/** Modos que se podem escolher (aqui e em Definições). */
export const SELECTABLE_STOCK_DEDUCTION_TRIGGERS = ["contract_signed", "manual"] as const;

/**
 * Valor da BD → modo do ecrã. Sem linha (null/undefined) = 'contract_signed', o padrão da BD. Os três valores do CHECK passam tal
 * como estão (antes 'manual' aparecia como "Contrato assinado"); um valor desconhecido cai no padrão.
 */
export function normalizeStockDeductionTrigger(raw: string | null | undefined): StockDeductionTrigger {
  return raw === "manual" || raw === "proposal_accepted" ? raw : "contract_signed";
}

/** Opções a mostrar: as escolhíveis e, só se for o valor atual, a antiga «Proposta aceite» (desativada). */
export function stockDeductionTriggerOptions(
  current: StockDeductionTrigger | null | undefined,
): { value: StockDeductionTrigger; disabled: boolean }[] {
  const options: { value: StockDeductionTrigger; disabled: boolean }[] = SELECTABLE_STOCK_DEDUCTION_TRIGGERS.map(
    (value) => ({ value, disabled: false }),
  );
  if (current === "proposal_accepted") options.push({ value: "proposal_accepted", disabled: true });
  return options;
}

export interface InventorySettingsValue {
  stock_deduction_trigger: StockDeductionTrigger;
  default_warehouse_id: string | null;
}

export const inventorySettingsQueryKey = (orgId: string | null | undefined) =>
  ["organization-inventory-settings", orgId ?? null] as const;

const inventorySettingsWarehousesQueryKey = (orgId: string | null | undefined) =>
  ["organization-inventory-settings", "warehouses", orgId ?? null] as const;

export function useInventorySettings(organizationId: string | null | undefined) {
  return useQuery({
    queryKey: inventorySettingsQueryKey(organizationId),
    enabled: !!organizationId,
    queryFn: async (): Promise<InventorySettingsValue> => {
      const { data, error } = await supabase
        .from("organization_inventory_settings")
        .select("stock_deduction_trigger, default_warehouse_id")
        .eq("organization_id", organizationId as string)
        .maybeSingle();
      if (error) throw error;
      // Sem linha ainda = valores por omissão (como em Settings.tsx).
      return {
        stock_deduction_trigger: normalizeStockDeductionTrigger(data?.stock_deduction_trigger),
        default_warehouse_id: data?.default_warehouse_id || null,
      };
    },
  });
}

const NONE = "none";

export const TRIGGER_LABEL: Record<StockDeductionTrigger, string> = {
  contract_signed: "Automático — quando a encomenda de cliente é emitida",
  manual: "Manual — só pela Saída para clientes",
  proposal_accepted: "Proposta aceite (antigo)",
};

const TRIGGER_SAVED: Record<StockDeductionTrigger, string> = {
  contract_signed: "Baixa automática na emissão da encomenda de cliente.",
  manual: "Baixa manual, só pela Saída para clientes.",
  proposal_accepted: "Baixa na proposta aceite.",
};

function SettingsBody({ organizationId }: { organizationId: string }) {
  const queryClient = useQueryClient();
  const selectId = useId();
  const helpId = useId();
  const [saving, setSaving] = useState(false);
  // Momento da baixa escolhido, à espera de confirmação.
  const [pendingTrigger, setPendingTrigger] = useState<StockDeductionTrigger | null>(null);
  const settingsQuery = useInventorySettings(organizationId);

  // Mesma lista que Settings.tsx: armazéns não eliminados da organização ativa.
  const warehousesQuery = useQuery({
    queryKey: inventorySettingsWarehousesQueryKey(organizationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, name")
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const current = settingsQuery.data;
  const loading = settingsQuery.isLoading || warehousesQuery.isLoading;
  const disabled = loading || saving || !current;

  const save = async (next: InventorySettingsValue, successMessage: string) => {
    if (!current) return;
    setSaving(true);
    const key = inventorySettingsQueryKey(organizationId);
    queryClient.setQueryData(key, next);
    try {
      const { error } = await supabase.rpc("rpc_upsert_inventory_settings", {
        p_organization_id: organizationId,
        p_stock_deduction_trigger: next.stock_deduction_trigger,
        p_default_warehouse_id: next.default_warehouse_id,
      } as any);
      if (error) throw error;
      toast.success(successMessage);
    } catch (error: any) {
      queryClient.setQueryData(key, current);
      const friendlyMessage = await getFriendlyErrorMessage(error);
      toast.error(`Erro ao guardar definições de inventário: ${friendlyMessage}`);
    } finally {
      setSaving(false);
      queryClient.invalidateQueries({ queryKey: key });
    }
  };

  const warehouses = warehousesQuery.data ?? [];

  return (
    <section aria-labelledby="inv-settings-title" className="mb-3.5 flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-sm">
      <h2 id="inv-settings-title" className="text-[15px] font-semibold">
        Definições de inventário
      </h2>
      {settingsQuery.isError || warehousesQuery.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Erro ao carregar definições de inventário.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={selectId}>Armazém por defeito</Label>
            <Select
              value={current?.default_warehouse_id ?? NONE}
              disabled={disabled}
              onValueChange={(value) => {
                if (!current || !value) return;
                const nextId = value === NONE ? null : value;
                if (nextId === current.default_warehouse_id) return;
                save(
                  { ...current, default_warehouse_id: nextId },
                  "Armazém por defeito atualizado.",
                );
              }}
            >
              <SelectTrigger id={selectId} aria-describedby={helpId}>
                <SelectValue placeholder={loading ? "A carregar…" : undefined} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Nenhum</SelectItem>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <small id={helpId} className="text-xs text-muted-foreground">
              Usado na baixa por venda. Com um só armazém ativo, é usado automaticamente; com vários e nenhum
              escolhido, a baixa fica por resolver e gera um aviso.
            </small>
          </div>
          <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0" disabled={disabled}>
            <legend className="mb-1.5 text-sm font-medium leading-none">Baixa de stock por venda</legend>
            <RadioGroup
              value={current?.stock_deduction_trigger ?? "contract_signed"}
              disabled={disabled}
              onValueChange={(value) => {
                if (!current || value === current.stock_deduction_trigger) return;
                // 29/10: só os modos escolhíveis (a antiga «Proposta aceite» está desativada)
                const next = normalizeStockDeductionTrigger(value);
                if (next === "proposal_accepted") return;
                setPendingTrigger(next);
              }}
              className="gap-2"
            >
              {stockDeductionTriggerOptions(current?.stock_deduction_trigger).map((option) => (
                <div key={option.value} className="flex items-center gap-2">
                  <RadioGroupItem
                    id={`${selectId}-${option.value}`}
                    value={option.value}
                    disabled={disabled || option.disabled}
                  />
                  <Label htmlFor={`${selectId}-${option.value}`} className="font-normal">
                    {TRIGGER_LABEL[option.value]}
                  </Label>
                </div>
              ))}
            </RadioGroup>
            <small className="text-xs text-muted-foreground">
              Automático: quando a encomenda de cliente é emitida (nos Negócios, depois da fatura e do pagamento validados), o que
              há em stock sai pela reserva por ordem de chegada e o que falta é pedido ao fornecedor. Manual: nada sai nem é
              pedido sozinho. Só se aplica aos produtos com «Gere stock automaticamente».
            </small>
          </fieldset>
        </div>
      )}

      <AlertDialog open={pendingTrigger !== null} onOpenChange={(open) => !open && setPendingTrigger(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mudar a baixa de stock por venda?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingTrigger
                ? `A baixa de stock por venda passa a «${TRIGGER_LABEL[pendingTrigger]}». `
                : null}
              Afeta toda a organização a partir de agora, em todos os produtos com «Gere stock automaticamente».
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const trigger = pendingTrigger;
                setPendingTrigger(null);
                if (!current || !trigger || trigger === current.stock_deduction_trigger) return;
                save({ ...current, stock_deduction_trigger: trigger }, TRIGGER_SAVED[trigger]);
              }}
            >
              Mudar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

export function InventorySettingsCard({ organizationId }: { organizationId: string }) {
  return (
    <PermissionGate permission="inventory.edit">
      <SettingsBody organizationId={organizationId} />
    </PermissionGate>
  );
}

export default InventorySettingsCard;
