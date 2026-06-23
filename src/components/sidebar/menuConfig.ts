import { LucideIcon } from "lucide-react";
import {
  Building,
  Zap,
  Handshake,
  LayoutDashboard,
  Users,
  Settings,
  Network,
  UserCog,
  HelpCircle,
  UsersRound,
  Crosshair,
  FileText,
  Megaphone,
  Shield,
  Target,
  FileCheck,
  BookOpen,
  Package,
  Layers,
  LayoutGrid,
  Ruler,
  Tag,
  PackageOpen,
  Wrench,
  ListTree,
  DollarSign,
  Truck,
  ShoppingCart,
  Warehouse,
  BarChart3,
  Mail,
  Trash2,
  FileDown,
} from "lucide-react";

export interface MenuItem {
  to: string;
  icon: LucideIcon;
  labelKey: string;
  permission?: string;
  permissions?: string[];
}

export interface MenuSubSection {
  key: string;
  labelKey: string;
  items: MenuItem[];
}

export interface MenuSection {
  id: string;
  icon: LucideIcon;
  labelKey: string;
  paths: string[];
  permissions: string[];
  items: MenuItem[];
  subSections?: MenuSubSection[];
}

export interface TopLevelItem {
  id: string;
  to: string;
  icon: LucideIcon;
  labelKey: string;
  permissions: string[];
}

export const topLevelItems: TopLevelItem[] = [
  {
    id: "dashboard",
    to: "/dashboard",
    icon: LayoutDashboard,
    labelKey: "sidebar.dashboard",
    permissions: ["dashboard.view"],
  },
];

export const menuSections: MenuSection[] = [
  {
    id: "organizations",
    icon: Building,
    labelKey: "sidebar.organizations",
    paths: ["/organizations", "/org-templates", "/org-chart", "/org-help", "/flow-builder", "/brands", "/bundles", "/products", "/product-categories", "/product-subcategories", "/product-attributes", "/units-of-measure", "/services", "/service-catalog", "/service-categories", "/service-subcategories", "/service-fees"],
    permissions: ["organizations.view", "products.view", "services.view"],
    items: [
      { to: "/organizations", icon: Building, labelKey: "sidebar.organizations", permission: "organizations.view" },
      { to: "/org-chart", icon: Network, labelKey: "sidebar.orgChart", permission: "organizations.view" },
      { to: "/flow-builder", icon: Zap, labelKey: "sidebar.flowBuilder", permission: "flow_builder.view" },
      { to: "/org-help", icon: HelpCircle, labelKey: "sidebar.help", permission: "organizations.view" },
    ],
    subSections: [
      {
        key: "products",
        labelKey: "sidebar.products",
        items: [
          { to: "/products", icon: Package, labelKey: "sidebar.productsList", permission: "products.view" },
          { to: "/bundles", icon: PackageOpen, labelKey: "sidebar.bundles", permission: "products.view" },
          { to: "/brands", icon: Tag, labelKey: "sidebar.brands", permission: "products.view" },
          { to: "/product-categories", icon: Layers, labelKey: "sidebar.productCategories", permission: "products.view" },
          { to: "/product-subcategories", icon: LayoutGrid, labelKey: "sidebar.productSubcategories", permission: "products.view" },
          { to: "/product-attributes", icon: Tag, labelKey: "sidebar.productAttributes", permission: "products.view" },
          { to: "/units-of-measure", icon: Ruler, labelKey: "sidebar.unitsOfMeasure", permission: "products.view" },
        ],
      },
      {
        key: "services",
        labelKey: "sidebar.services",
        items: [
          { to: "/services", icon: Wrench, labelKey: "sidebar.services", permission: "services.view" },
          { to: "/service-categories", icon: ListTree, labelKey: "sidebar.serviceCategories", permission: "services.view" },
          { to: "/service-subcategories", icon: LayoutGrid, labelKey: "sidebar.serviceSubcategories", permission: "services.view" },
          { to: "/service-fees", icon: DollarSign, labelKey: "sidebar.serviceFees", permission: "services.view" },
        ],
      },
    ],
  },
  {
    id: "crm",
    icon: UsersRound,
    labelKey: "sidebar.crm",
    paths: ["/leads", "/contacts", "/clients"],
    permissions: ["leads.view", "contacts.view", "clients.view"],
    items: [
      { to: "/leads", icon: Target, labelKey: "sidebar.leads", permission: "leads.view" },
      { to: "/contacts", icon: Users, labelKey: "sidebar.contacts", permission: "contacts.view" },
      { to: "/clients", icon: Building, labelKey: "sidebar.clients", permission: "clients.view" },
    ],
  },
  {
    id: "acquisition",
    icon: Target,
    labelKey: "sidebar.acquisition",
    paths: ["/deals", "/proposals", "/quotes", "/quote-models", "/quote-templates", "/modelos-orcamento", "/proposal-templates", "/client-contracts", "/contract-templates", "/acquisition-help", "/needs-assessment-config"],
    permissions: ["deals.view", "proposals.view", "quotes.view"],
    items: [
      { to: "/deals", icon: Handshake, labelKey: "sidebar.proposalRequests", permission: "deals.view" },
    ],
    subSections: [
      {
        key: "proposals",
        labelKey: "sidebar.proposals",
        items: [
          { to: "/proposals", icon: FileText, labelKey: "sidebar.proposals", permission: "proposals.view" },
          { to: "/quotes", icon: FileCheck, labelKey: "sidebar.quotes", permission: "quotes.view" },
        ],
      },
      {
        key: "contracts",
        labelKey: "sidebar.contracts",
        items: [
          { to: "/client-contracts", icon: BookOpen, labelKey: "sidebar.contracts", permission: "deals.view" },
        ],
      },
      {
        key: "acquisition-config",
        labelKey: "sidebar.settings",
        items: [
          { to: "/acquisition-help", icon: HelpCircle, labelKey: "sidebar.acquisitionHelp" },
        ],
      },
    ],
  },
  {
    id: "marketing",
    icon: Megaphone,
    labelKey: "sidebar.marketing",
    paths: ["/campaigns", "/forms", "/lead-sources"],
    permissions: ["campaigns.view", "forms.view", "channels.view"],
    items: [
      { to: "/campaigns", icon: Megaphone, labelKey: "sidebar.campaigns", permission: "campaigns.view" },
      { to: "/lead-sources", icon: Crosshair, labelKey: "sidebar.leadSources", permission: "channels.view" },
      { to: "/forms", icon: FileText, labelKey: "sidebar.forms", permission: "forms.view" },
    ],
  },
  {
    id: "inventory",
    icon: ShoppingCart,
    labelKey: "sidebar.inventory",
    paths: ["/suppliers", "/warehouses", "/purchase-orders", "/stocks"],
    permissions: ["suppliers.view"],
    items: [
      { to: "/suppliers", icon: Truck, labelKey: "sidebar.suppliers", permission: "suppliers.view" },
      { to: "/warehouses", icon: Warehouse, labelKey: "sidebar.warehouses" },
      { to: "/purchase-orders", icon: ShoppingCart, labelKey: "sidebar.purchaseOrders" },
      { to: "/stocks", icon: BarChart3, labelKey: "sidebar.stocks" },
    ],
  },
  {
    id: "users",
    icon: UserCog,
    labelKey: "sidebar.users",
    paths: ["/users", "/roles", "/export-audit"],
    permissions: ["users.view"],
    items: [
      { to: "/users", icon: Users, labelKey: "sidebar.users", permission: "users.view" },
      { to: "/roles", icon: Shield, labelKey: "sidebar.roles", permission: "roles.view" },
      { to: "/export-audit", icon: FileDown, labelKey: "sidebar.exportAudit", permission: "exports.audit.view" },
    ],
  },
  {
    id: "settings",
    icon: Settings,
    labelKey: "sidebar.settings",
    paths: ["/settings", "/smtp-management", "/email-templates", "/trash"],
    permissions: [],
    items: [
      { to: "/settings", icon: Settings, labelKey: "sidebar.settings", permission: "settings.update" },
      { to: "/smtp-management", icon: Mail, labelKey: "sidebar.smtpManagement", permission: "smtp.view" },
      { to: "/email-templates", icon: Mail, labelKey: "sidebar.emailTemplates", permission: "email_templates.view" },
      { to: "/trash", icon: Trash2, labelKey: "sidebar.trash", permission: "settings.update" },
    ],
  },
];

export const bottomItem: TopLevelItem = {
  id: "home",
  to: "/home",
  icon: LayoutDashboard,
  labelKey: "sidebar.panel",
  permissions: [],
};
