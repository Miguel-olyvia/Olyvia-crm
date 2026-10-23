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

export type StockDeductionTrigger = "contract_signed" | "proposal_accepted";

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
        stock_deduction_trigger:
          data?.stock_deduction_trigger === "proposal_accepted" ? "proposal_accepted" : "contract_signed",
        default_warehouse_id: data?.default_warehouse_id || null,
      };
    },
  });
}

const NONE = "none";

const TRIGGER_LABEL: Record<StockDeductionTrigger, string> = {
  contract_signed: "Contrato assinado",
  proposal_accepted: "Proposta aceite",
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
            <legend className="mb-1.5 text-sm font-medium leading-none">Momento da baixa de stock por venda</legend>
            <RadioGroup
              value={current?.stock_deduction_trigger ?? "contract_signed"}
              disabled={disabled}
              onValueChange={(value) => {
                if (!current || value === current.stock_deduction_trigger) return;
                setPendingTrigger(value === "proposal_accepted" ? "proposal_accepted" : "contract_signed");
              }}
              className="gap-2"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem id={`${selectId}-contract`} value="contract_signed" />
                <Label htmlFor={`${selectId}-contract`} className="font-normal">
                  Contrato assinado
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id={`${selectId}-proposal`} value="proposal_accepted" />
                <Label htmlFor={`${selectId}-proposal`} className="font-normal">
                  Proposta aceite
                </Label>
              </div>
            </RadioGroup>
            <small className="text-xs text-muted-foreground">
              Nunca os dois. Só se aplica aos produtos com «Gere stock automaticamente».
            </small>
          </fieldset>
        </div>
      )}

      <AlertDialog open={pendingTrigger !== null} onOpenChange={(open) => !open && setPendingTrigger(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mudar o momento da baixa de stock?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingTrigger
                ? `A baixa de stock por venda passa a acontecer em «${TRIGGER_LABEL[pendingTrigger]}». `
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
                save(
                  { ...current, stock_deduction_trigger: trigger },
                  trigger === "contract_signed" ? "Baixa no contrato assinado." : "Baixa na proposta aceite.",
                );
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
