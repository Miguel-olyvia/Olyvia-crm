// A ficha do fornecedor numa folha lateral larga (FornecedorFolha do protótipo
// /prototipo/negocios): migalha "Compras › Fornecedor", nome, distintivos
// (código, Ativo/Inativo, estado do portal), faixa "à espera da ficha" com
// "Reenviar convite", separadores Resumo · Dados · Artigos e preços · Preços
// por aprovar · Portal, e rodapé (Guardar só em Dados).
//
// Dados reais e a lógica de sempre: o formulário de Dados e a gravação vêm de
// Suppliers.tsx (prop dataForm); Portal = SupplierPortalTab; Artigos =
// item_suppliers + SupplierPortalCatalogSection; Preços = SupplierPriceChangesSection.
// Um fornecedor novo abre a mesma folha só com Dados.
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Clock, Loader2, RefreshCw, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "@/lib/toast";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";
import { InventoryStatusBadge } from "@/components/inventory/ui";
import SupplierPortalTab from "@/components/supplier-portal-crm/SupplierPortalTab";
import SupplierPriceChangesSection from "@/components/supplier-portal-crm/SupplierPriceChangesSection";
import { describeAccessError, invokePortalAccess } from "@/components/supplier-portal-crm/types";
import { SupplierPortalBadge } from "./SupplierRowStats";
import { useSupplierOrgStats } from "./useSupplierListStats";
import { SupplierSummaryTab } from "./SupplierSummaryTab";
import { SupplierItemsTab } from "./SupplierItemsTab";
import { supplierItemsKey, supplierPortalInviteKey, useSupplierItems, useSupplierPortalInvite } from "./useSupplierSheetData";

type Supplier = Database["public"]["Tables"]["suppliers"]["Row"];

export type SupplierSheetTab = "resumo" | "dados" | "artigos" | "precos" | "portal";

/**
 * ?tab= / ?prices= → separador. Aceita os valores novos e os antigos:
 * prices=pending → Preços por aprovar; catalogo → Artigos e preços;
 * portal → Portal; dados → Dados; sem tab → Resumo.
 */
export function supplierSheetTabFromParams(tab: string | null, prices: string | null): SupplierSheetTab {
  if (prices === "pending") return "precos";
  switch (tab) {
    case "dados":
    case "resumo":
    case "artigos":
    case "precos":
    case "portal":
      return tab;
    case "catalogo":
      return "artigos";
    default:
      return "resumo";
  }
}

const fmtDateTime = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d
    .toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    .replace(",", "");
};

interface SupplierSheetProps {
  open: boolean;
  onClose: () => void;
  /** null = fornecedor novo (só Dados). */
  supplier: Supplier | null;
  tab: SupplierSheetTab;
  onTabChange: (tab: SupplierSheetTab) => void;
  /** O formulário de Dados (com id = formId), renderizado por Suppliers.tsx. */
  dataForm: ReactNode;
  formId: string;
  cancelLabel: string;
  submitLabel: string;
  /** Link do sino (?prices=pending). */
  focusPriceChanges: boolean;
  /** suppliers.portal_manage — a mesma condição do separador Portal de antes. */
  canManagePortal: boolean;
  /** Organização a usar quando o fornecedor não tem uma (empresa ativa). */
  fallbackOrganizationId: string | null;
}

export function SupplierSheet({
  open,
  onClose,
  supplier,
  tab,
  onTabChange,
  dataForm,
  formId,
  cancelLabel,
  submitLabel,
  focusPriceChanges,
  canManagePortal,
  fallbackOrganizationId,
}: SupplierSheetProps) {
  const isNew = !supplier;
  const supplierId = supplier?.id ?? null;
  const orgId = supplier?.organization_id ?? null;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasPermission, loading: permLoading } = usePermissions();
  const canPricing =
    hasPermission("suppliers.view") && (hasPermission("suppliers.view_pricing") || hasPermission("products.view_cost"));
  const canViewPricing = hasPermission("suppliers.view_pricing");

  // Estado do portal, à espera da ficha e preços por aprovar (cache partilhada com a lista).
  const orgStatsQuery = useSupplierOrgStats(isNew ? null : orgId);
  const orgStats = orgStatsQuery.data ?? null;
  const portalState = supplierId && orgStats ? orgStats.portal.get(supplierId) ?? "none" : null;
  const awaiting = !!supplierId && !!orgStats?.awaiting.some((s) => s.id === supplierId);
  const pricesPending = supplierId && canPricing && orgStats?.pricesPending ? orgStats.pricesPending.get(supplierId) ?? 0 : 0;

  const items = useSupplierItems(supplierId, canViewPricing, open && !permLoading);
  const itemsCount = items.data?.length ?? 0;

  // Faixa "à espera": email e data do convite (rpc_supplier_portal_status, só para quem gere o portal).
  const invite = useSupplierPortalInvite(supplierId, open && awaiting && canManagePortal);
  const inviteUser = invite.data?.user ?? null;
  const canResend = canManagePortal && !!invite.data?.status.can_manage && !!inviteUser;
  const [resending, setResending] = useState(false);

  const refreshStats = () => {
    void queryClient.invalidateQueries({ queryKey: ["supplier-list-org-stats"] });
  };

  // Ao fechar, os contadores da lista (portal, preços, catálogo) voltam a ler-se.
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open) refreshStats();
    wasOpen.current = open;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleResend = async () => {
    const organizationId = orgId ?? fallbackOrganizationId;
    if (!supplierId || !inviteUser) return;
    if (!organizationId) {
      toast({ title: "Erro", description: "O fornecedor não tem empresa definida.", variant: "destructive" });
      return;
    }
    setResending(true);
    const { data, error } = await invokePortalAccess({
      action: "resend",
      organization_id: organizationId,
      supplier_id: supplierId,
      portal_user_id: inviteUser.portal_user_id,
    });
    setResending(false);
    if (error || !data) {
      toast({
        title: "Link não reenviado",
        description: error ? describeAccessError(error) : "Não foi possível reenviar o link.",
        variant: "destructive",
      });
      return;
    }
    const message = data.message || "Link reenviado";
    if (data.smtp_warning) {
      sonnerToast.warning("Email não enviado", {
        description: `${message}${data.smtp_error_safe ? ` Motivo: ${data.smtp_error_safe}.` : ""}`,
        duration: 12000,
      });
    } else {
      sonnerToast.success(message, {
        description: `O fornecedor ${supplier?.name ?? ""} recebe por email o link para entrar no portal.`,
        duration: 6000,
      });
    }
    void queryClient.invalidateQueries({ queryKey: supplierPortalInviteKey(supplierId) });
  };

  const tabs: { id: SupplierSheetTab; label: string; count?: number }[] = isNew
    ? [{ id: "dados", label: "Dados" }]
    : [
        { id: "resumo", label: "Resumo" },
        { id: "dados", label: "Dados" },
        { id: "artigos", label: "Artigos e preços", count: itemsCount },
        { id: "precos", label: "Preços por aprovar", count: pricesPending },
        { id: "portal", label: "Portal" },
      ];
  const current: SupplierSheetTab = isNew ? "dados" : tab;

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = tabs.length;
    const j =
      e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (j < 0) return;
    e.preventDefault();
    onTabChange(tabs[j].id);
    document.getElementById(`sup-tab-${tabs[j].id}`)?.focus();
  };

  const title = supplier ? supplier.name : "Novo fornecedor";

  let body: ReactNode = null;
  if (current === "dados") body = dataForm;
  else if (supplier && current === "resumo")
    body = (
      <SupplierSummaryTab
        supplierId={supplier.id}
        supplierName={supplier.name}
        slaDays={supplier.delivery_sla_days ?? null}
      />
    );
  else if (supplier && current === "artigos")
    body = (
      <SupplierItemsTab
        supplierId={supplier.id}
        organizationId={orgId}
        onOpenPortalTab={() => onTabChange("portal")}
        onLinksChanged={refreshStats}
      />
    );
  else if (supplier && current === "precos")
    body = canPricing ? (
      <SupplierPriceChangesSection
        supplierId={supplier.id}
        focus={focusPriceChanges}
        alwaysShow
        onDecided={() => void queryClient.invalidateQueries({ queryKey: supplierItemsKey(supplier.id) })}
        onAfterDecision={refreshStats}
      />
    ) : (
      <p className="text-sm text-muted-foreground">
        Sem permissão: ver os preços por aprovar requer suppliers.view_pricing ou products.view_cost. Peça acesso a um
        administrador.
      </p>
    );
  else if (supplier && current === "portal")
    body = canManagePortal ? (
      <SupplierPortalTab
        supplierId={supplier.id}
        supplierName={supplier.name}
        organizationId={orgId ?? fallbackOrganizationId}
        defaultEmail={supplier.email ?? null}
        defaultName={supplier.contact_person ?? null}
      />
    ) : (
      <p className="text-sm text-muted-foreground">Sem permissão para gerir o acesso deste fornecedor ao portal.</p>
    );

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[1000px] [&>button.absolute]:hidden"
      >
        {/* Cabeçalho fixo */}
        <div className="border-b bg-card px-4 pt-4 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetDescription className="mb-0.5 text-[12.5px] text-muted-foreground">Compras › Fornecedor</SheetDescription>
              <SheetTitle className="truncate text-xl font-bold leading-tight">{title}</SheetTitle>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {supplier ? (
                  <>
                    {supplier.code ? (
                      <InventoryStatusBadge tone="neutral" className="font-mono">
                        {supplier.code}
                      </InventoryStatusBadge>
                    ) : null}
                    <InventoryStatusBadge tone={supplier.is_active ? "ok" : "neutral"}>
                      {supplier.is_active ? "Ativo" : "Inativo"}
                    </InventoryStatusBadge>
                    {portalState ? <SupplierPortalBadge state={portalState} /> : null}
                    {supplier.deleted_at ? <InventoryStatusBadge tone="bad">Eliminado</InventoryStatusBadge> : null}
                  </>
                ) : (
                  <InventoryStatusBadge tone="warn">Rascunho · nada gravado</InventoryStatusBadge>
                )}
              </div>
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Fechar">
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          {awaiting && (
            <div
              role="status"
              className="mt-3 flex items-start gap-2.5 rounded-lg border border-info/30 bg-info/10 px-3.5 py-3 text-sm text-sky-900 dark:text-info"
            >
              <Clock className="mt-0.5 h-[18px] w-[18px] shrink-0" aria-hidden="true" />
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <span>
                  <b className="font-semibold">À espera que o fornecedor preencha a ficha.</b>{" "}
                  {inviteUser ? (
                    <>
                      Convite enviado a {inviteUser.email}
                      {inviteUser.granted_at ? ` em ${fmtDateTime(inviteUser.granted_at)}` : ""}.
                    </>
                  ) : supplier?.email ? (
                    <>Convite enviado a {supplier.email}.</>
                  ) : (
                    <>Convite enviado.</>
                  )}
                </span>
                {canResend && (
                  <Button type="button" variant="outline" size="sm" className="h-7 bg-background" onClick={() => void handleResend()} disabled={resending}>
                    {resending ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    Reenviar convite
                  </Button>
                )}
              </div>
            </div>
          )}

          <div role="tablist" aria-label="Partes da ficha" className="mt-3 flex gap-0.5 overflow-x-auto">
            {tabs.map((t, i) => {
              const on = current === t.id;
              return (
                <button
                  key={t.id}
                  id={`sup-tab-${t.id}`}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  aria-controls="sup-tabpanel"
                  tabIndex={on ? 0 : -1}
                  onClick={() => onTabChange(t.id)}
                  onKeyDown={(e) => onTabKey(e, i)}
                  className={cn(
                    "-mb-px inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    on ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.label}
                  {t.count ? (
                    <span className="inline-grid h-5 min-w-5 place-items-center rounded-full bg-muted px-1.5 text-[11px] font-semibold text-foreground">
                      {t.count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {/* Corpo que rola */}
        <div
          id="sup-tabpanel"
          role="tabpanel"
          aria-labelledby={`sup-tab-${current}`}
          className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5"
        >
          {body}
        </div>

        {/* Rodapé fixo */}
        <div className="flex flex-wrap justify-end gap-2 border-t bg-card px-4 py-3 sm:px-5">
          {current === "dados" ? (
            <>
              <Button type="button" variant="outline" onClick={onClose}>
                {cancelLabel}
              </Button>
              <Button type="submit" form={formId}>
                {submitLabel}
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" onClick={onClose}>
              Fechar
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
