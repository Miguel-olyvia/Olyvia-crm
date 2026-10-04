import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  CalendarClock,
  ChevronDown,
  DollarSign,
  FileText,
  FolderTree,
  Inbox,
  Key,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  Package,
  Package2,
  Radio,
  Receipt,
  Settings,
  Settings2,
  Shield,
  ShoppingCart,
  Sparkles,
  Tags,
  Target,
  UserCog,
  Users,
  Warehouse,
  Wrench,
  Globe,
  type LucideIcon,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

interface QuickLink {
  id: string;
  to: string;
  icon: LucideIcon;
  labelKey: string;
  permission?: string;
}

interface QuickGroup {
  id: string;
  titleKey: string;
  descriptionKey: string;
  icon: LucideIcon;
  color: string;
  items: QuickLink[];
}

/**
 * Os atalhos do antigo lançador do `/home`, agora secundários e traduzidos.
 *
 * Mesmos destinos e mesmas permissões do lançador anterior, com três
 * correções: saíram `/call-center` e `/lists` (não existem rotas), e
 * `/calendar` (que só redirecionava) deu lugar a `/scheduling`, que já estava
 * no grupo da agenda. Entraram as Atividades, que passam a ser de todos.
 */
export const QUICK_GROUPS: QuickGroup[] = [
  {
    id: "main",
    titleKey: "today.quick.group.main",
    descriptionKey: "today.quick.desc.main",
    icon: LayoutDashboard,
    color: "bg-primary/10 text-primary",
    items: [
      { id: "dashboard", to: "/dashboard", icon: LayoutDashboard, labelKey: "sidebar.dashboard", permission: "dashboard.view" },
      { id: "atividades", to: "/atividades", icon: ListChecks, labelKey: "sidebar.activities", permission: "scheduling.items.view" },
      { id: "scheduling", to: "/scheduling", icon: CalendarClock, labelKey: "sidebar.scheduling", permission: "scheduling.view" },
    ],
  },
  {
    id: "sales",
    titleKey: "sidebar.sales",
    descriptionKey: "today.quick.desc.sales",
    icon: Receipt,
    color: "bg-green-500/10 text-green-700 dark:text-green-400",
    items: [
      { id: "quotes", to: "/quotes", icon: Receipt, labelKey: "sidebar.quotes", permission: "quotes.view" },
      { id: "deals", to: "/deals", icon: Target, labelKey: "sidebar.proposalRequests", permission: "deals.view" },
      { id: "proposals", to: "/proposals", icon: FileText, labelKey: "sidebar.proposals", permission: "proposals.view" },
      { id: "contracts", to: "/client-contracts", icon: FileText, labelKey: "sidebar.contracts", permission: "client_contracts.view" },
      { id: "contract-templates", to: "/contract-templates", icon: Sparkles, labelKey: "sidebar.contractTemplates", permission: "contract_templates.view" },
      { id: "quote-models", to: "/quote-models", icon: Sparkles, labelKey: "today.quick.quoteModels", permission: "quote_templates.view" },
      { id: "quote-pdf-templates", to: "/quote-templates", icon: Sparkles, labelKey: "today.quick.quotePdfTemplates", permission: "quotes.manage" },
      { id: "catalog-items", to: "/catalog-items", icon: Package, labelKey: "sidebar.catalogItems", permission: "catalog_items.view" },
      { id: "service-catalog", to: "/service-catalog-items", icon: Package, labelKey: "sidebar.serviceCatalogItems", permission: "service_catalog.view" },
    ],
  },
  {
    id: "customers",
    titleKey: "sidebar.customers",
    descriptionKey: "today.quick.desc.customers",
    icon: Users,
    color: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
    items: [
      { id: "clients", to: "/clients", icon: Users, labelKey: "sidebar.clients", permission: "clients.view" },
      { id: "leads", to: "/leads", icon: Inbox, labelKey: "sidebar.leads", permission: "leads.view" },
    ],
  },
  {
    id: "marketing",
    titleKey: "sidebar.marketing",
    descriptionKey: "today.quick.desc.marketing",
    icon: Megaphone,
    color: "bg-pink-500/10 text-pink-700 dark:text-pink-400",
    items: [
      { id: "campaigns", to: "/campaigns", icon: Megaphone, labelKey: "sidebar.campaigns", permission: "campaigns.view" },
      { id: "channels", to: "/channels", icon: Radio, labelKey: "sidebar.channels", permission: "channels.view" },
    ],
  },
  {
    id: "services",
    titleKey: "sidebar.services",
    descriptionKey: "today.quick.desc.services",
    icon: Wrench,
    color: "bg-orange-500/10 text-orange-700 dark:text-orange-400",
    items: [
      { id: "services", to: "/services", icon: Wrench, labelKey: "sidebar.services", permission: "services.view" },
      { id: "service-categories", to: "/service-categories", icon: FolderTree, labelKey: "sidebar.serviceCategories", permission: "service_categories.view" },
      { id: "service-subcategories", to: "/service-subcategories", icon: FolderTree, labelKey: "sidebar.serviceSubcategories", permission: "service_subcategories.view" },
      { id: "service-fees", to: "/service-fees", icon: DollarSign, labelKey: "sidebar.serviceFees", permission: "service_fees.view" },
    ],
  },
  {
    id: "products",
    titleKey: "sidebar.products",
    descriptionKey: "today.quick.desc.products",
    icon: Package,
    color: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400",
    items: [
      { id: "products", to: "/products", icon: ShoppingCart, labelKey: "sidebar.productsList", permission: "products.view" },
      { id: "product-categories", to: "/product-categories", icon: FolderTree, labelKey: "sidebar.productCategories", permission: "product_categories.view" },
      { id: "product-subcategories", to: "/product-subcategories", icon: FolderTree, labelKey: "sidebar.productSubcategories", permission: "product_subcategories.view" },
      { id: "product-attributes", to: "/product-attributes", icon: Settings2, labelKey: "sidebar.productAttributes", permission: "product_attributes.view" },
      { id: "brands", to: "/brands", icon: Tags, labelKey: "sidebar.brands", permission: "brands.view" },
    ],
  },
  {
    id: "purchasing",
    titleKey: "today.quick.group.purchasing",
    descriptionKey: "today.quick.desc.purchasing",
    icon: ShoppingCart,
    color: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    items: [
      { id: "suppliers", to: "/suppliers", icon: Building2, labelKey: "sidebar.suppliers", permission: "suppliers.view" },
      { id: "warehouses", to: "/warehouses", icon: Warehouse, labelKey: "sidebar.warehouses", permission: "warehouses.view" },
      { id: "purchase-orders", to: "/purchase-orders", icon: ShoppingCart, labelKey: "sidebar.purchaseOrders", permission: "purchase_orders.view" },
      { id: "stocks", to: "/stocks", icon: Package, labelKey: "sidebar.stocks", permission: "inventory.view" },
    ],
  },
  {
    id: "users",
    titleKey: "sidebar.users",
    descriptionKey: "today.quick.desc.users",
    icon: UserCog,
    color: "bg-red-500/10 text-red-700 dark:text-red-400",
    items: [
      { id: "users", to: "/users", icon: UserCog, labelKey: "sidebar.users", permission: "users.view" },
      { id: "roles", to: "/roles", icon: Shield, labelKey: "sidebar.roles", permission: "roles.view" },
      { id: "api-keys", to: "/api-keys", icon: Key, labelKey: "sidebar.apiKeys", permission: "api_keys.view" },
    ],
  },
  {
    id: "settings",
    titleKey: "sidebar.settings",
    descriptionKey: "today.quick.desc.settings",
    icon: Settings,
    color: "bg-muted text-muted-foreground",
    items: [
      { id: "settings", to: "/settings", icon: Settings, labelKey: "sidebar.settings", permission: "settings.view" },
      { id: "alert-settings", to: "/alert-settings", icon: Settings, labelKey: "today.quick.alertSettings", permission: "settings.view" },
      { id: "countries", to: "/countries", icon: Globe, labelKey: "sidebar.countries", permission: "countries.view" },
      { id: "trash", to: "/trash", icon: Package2, labelKey: "sidebar.trash" },
    ],
  },
];

const STORAGE_KEY = "home.quickLinksOpen";

function readOpen(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeOpen(open: boolean) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(open));
  } catch {
    // Sem armazenamento local (janela privada, etc.): fica só nesta visita.
  }
}

interface QuickLinksProps {
  /** Mesma regra do antigo lançador: enquanto as permissões carregam, ou sem empresa, mostra tudo. */
  canSee: (permission?: string) => boolean;
}

export function QuickLinks({ canSee }: QuickLinksProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<boolean>(readOpen);

  const groups = QUICK_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => canSee(item.permission)),
  })).filter((group) => group.items.length > 0);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    writeOpen(next);
  };

  return (
    <Collapsible open={open} onOpenChange={handleOpenChange}>
      <section className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[var(--shadow-sm)]">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={open ? t("today.quick.hide") : t("today.quick.show")}
          >
            <div className="min-w-0">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-foreground">
                {t("today.quick.title")}
              </h2>
              <p className="truncate text-xs text-muted-foreground">{t("today.quick.hint")}</p>
            </div>
            <ChevronDown
              className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")}
              aria-hidden="true"
            />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t border-border/60 p-4">
            {groups.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("today.quick.empty")}</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {groups.map((group) => {
                  const GroupIcon = group.icon;
                  return (
                    <div key={group.id} className="rounded-xl border border-border/60 p-3">
                      <div className="mb-2 flex items-center gap-2.5">
                        <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", group.color)}>
                          <GroupIcon className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-semibold text-foreground">{t(group.titleKey)}</h3>
                          <p className="truncate text-xs text-muted-foreground">{t(group.descriptionKey)}</p>
                        </div>
                      </div>
                      <ul className="space-y-0.5">
                        {group.items.map((item) => {
                          const ItemIcon = item.icon;
                          return (
                            <li key={item.id}>
                              <Link
                                to={item.to}
                                className="flex min-h-[40px] items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <ItemIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                                <span className="truncate">{t(item.labelKey)}</span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}
