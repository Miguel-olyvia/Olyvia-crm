import { useState, useEffect } from "react";
import Layout from "@/components/Layout";
import { useNavigate } from "react-router-dom";
import { useCompany } from "@/contexts/CompanyContext";
import { WelcomeOrgDialog } from "@/components/WelcomeOrgDialog";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { 
  Building,
  Building2, 
  LayoutDashboard, 
  Users, 
  Target, 
  FileText, 
  CheckSquare, 
  Settings,
  Sparkles,
  Calendar,
  CalendarClock,
  Receipt,
  Package,
  FolderTree,
  Headphones,
  UserCog,
  Key,
  Megaphone,
  Radio,
  List,
  Truck,
  UserCircle,
  Wrench,
  ClipboardList,
  Package2,
  DollarSign,
  ShoppingCart,
  Tags,
  Settings2,
  Warehouse,
  UsersRound,
  
  Network,
  Shield,
  Briefcase,
  Globe,
  GripVertical,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Pencil,
  LucideIcon,
  Inbox
} from "lucide-react";
import { Label } from "@/components/ui/label";

interface MenuItem {
  id: string;
  to: string;
  icon: LucideIcon;
  label: string;
  description?: string;
  permission?: string;
  visible: boolean;
}

interface MenuGroup {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  color: string;
  items: MenuItem[];
  permissions?: string[];
  expanded: boolean;
}

interface SavedMenuConfig {
  order: string[];
  groups: {
    [id: string]: {
      title?: string;
      description?: string;
      expanded?: boolean;
      color?: string;
      items?: { id: string; visible: boolean; label?: string }[];
    };
  };
}

const createDefaultMenuGroups = (): MenuGroup[] => [
  {
    id: "dashboard",
    title: "Dashboard",
    description: "Overview and metrics",
    icon: LayoutDashboard,
    color: "from-blue-500/20 to-blue-600/20",
    permissions: ["dashboard.view"],
    expanded: false,
    items: [
      { id: "dashboard-main", to: "/dashboard", icon: LayoutDashboard, label: "Dashboard", description: "Main panel", permission: "dashboard.view", visible: true },
    ]
  },
  {
    id: "sales",
    title: "Sales",
    description: "Quotes, contracts and proposals",
    icon: Receipt,
    color: "from-green-500/20 to-green-600/20",
    permissions: ["quotes.view", "deals.view", "proposals.view", "client_contracts.view"],
    expanded: false,
    items: [
      { id: "quotes", to: "/quotes", icon: Receipt, label: "Quotes", permission: "quotes.view", visible: true },
      { id: "deals", to: "/deals", icon: Target, label: "Deals", permission: "deals.view", visible: true },
      { id: "proposals", to: "/proposals", icon: FileText, label: "Proposals", permission: "proposals.view", visible: true },
      { id: "contracts", to: "/client-contracts", icon: FileText, label: "Contracts", permission: "client_contracts.view", visible: true },
      { id: "contract-templates", to: "/contract-templates", icon: Sparkles, label: "Contract Templates", permission: "contract_templates.view", visible: true },
      { id: "quote-templates", to: "/quote-models", icon: Sparkles, label: "Quick Templates", permission: "quote_templates.view", visible: true },
      { id: "quote-pdf-templates", to: "/quote-templates", icon: Sparkles, label: "Templates Orçamento (PDF)", permission: "proposals.manage", visible: true },
      { id: "catalog-items", to: "/catalog-items", icon: Package, label: "Catalog Items", permission: "catalog_items.view", visible: true },
      { id: "service-catalog", to: "/service-catalog-items", icon: Package, label: "Service Catalog", permission: "service_catalog.view", visible: true },
    ]
  },
  {
    id: "customers",
    title: "Customers",
    description: "Customer and contact management",
    icon: Users,
    color: "from-purple-500/20 to-purple-600/20",
    permissions: ["clients.view", "contacts.view", "leads.view", "calendar.view_company", "call_center.view"],
    expanded: false,
    items: [
      { id: "clients", to: "/clients", icon: Users, label: "Clients", permission: "clients.view", visible: true },
      { id: "contacts", to: "/contacts", icon: Users, label: "Contacts", permission: "contacts.view", visible: true },
      { id: "leads", to: "/leads", icon: Inbox, label: "Leads", permission: "leads.view", visible: true },
      { id: "calendar", to: "/calendar", icon: Calendar, label: "Calendar", permission: "calendar.view_company", visible: true },
      { id: "call-center", to: "/call-center", icon: Headphones, label: "Call Center", permission: "call_center.view", visible: true },
    ]
  },
  {
    id: "marketing",
    title: "Marketing",
    description: "Campaigns and channels",
    icon: Megaphone,
    color: "from-pink-500/20 to-pink-600/20",
    permissions: ["campaigns.view", "channels.view", "lists.view"],
    expanded: false,
    items: [
      { id: "campaigns", to: "/campaigns", icon: Megaphone, label: "Campaigns", permission: "campaigns.view", visible: true },
      { id: "channels", to: "/channels", icon: Radio, label: "Channels", permission: "channels.view", visible: true },
      { id: "lists", to: "/lists", icon: List, label: "Lists", permission: "lists.view", visible: true },
    ]
  },
  {
    id: "services",
    title: "Services",
    description: "Service management",
    icon: Wrench,
    color: "from-orange-500/20 to-orange-600/20",
    permissions: ["services.view", "service_categories.view", "service_subcategories.view", "service_fees.view"],
    expanded: false,
    items: [
      { id: "services", to: "/services", icon: Wrench, label: "Services", permission: "services.view", visible: true },
      { id: "service-categories", to: "/service-categories", icon: FolderTree, label: "Categories", permission: "service_categories.view", visible: true },
      { id: "service-subcategories", to: "/service-subcategories", icon: FolderTree, label: "Subcategories", permission: "service_subcategories.view", visible: true },
      { id: "service-fees", to: "/service-fees", icon: DollarSign, label: "Fees", permission: "service_fees.view", visible: true },
    ]
  },
  {
    id: "products",
    title: "Products",
    description: "Product and brand management",
    icon: Package,
    color: "from-cyan-500/20 to-cyan-600/20",
    permissions: ["products.view", "product_categories.view", "product_subcategories.view", "product_attributes.view", "brands.view"],
    expanded: false,
    items: [
      { id: "products", to: "/products", icon: ShoppingCart, label: "Products", permission: "products.view", visible: true },
      { id: "product-categories", to: "/product-categories", icon: FolderTree, label: "Categories", permission: "product_categories.view", visible: true },
      { id: "product-subcategories", to: "/product-subcategories", icon: FolderTree, label: "Subcategories", permission: "product_subcategories.view", visible: true },
      { id: "product-attributes", to: "/product-attributes", icon: Settings2, label: "Attributes", permission: "product_attributes.view", visible: true },
      { id: "brands", to: "/brands", icon: Tags, label: "Brands", permission: "brands.view", visible: true },
    ]
  },
  {
    id: "purchasing",
    title: "Purchasing",
    description: "Suppliers and inventory",
    icon: ShoppingCart,
    color: "from-amber-500/20 to-amber-600/20",
    permissions: ["suppliers.view", "warehouses.view", "purchase_orders.view", "inventory.view"],
    expanded: false,
    items: [
      { id: "suppliers", to: "/suppliers", icon: Building2, label: "Suppliers", permission: "suppliers.view", visible: true },
      { id: "warehouses", to: "/warehouses", icon: Warehouse, label: "Warehouses", permission: "warehouses.view", visible: true },
      { id: "purchase-orders", to: "/purchase-orders", icon: ShoppingCart, label: "Purchase Orders", permission: "purchase_orders.view", visible: true },
      { id: "stocks", to: "/stocks", icon: Package, label: "Stock", permission: "inventory.view", visible: true },
    ]
  },
  {
    id: "operations",
    title: "Operations",
    description: "Scheduling and asset management",
    icon: CalendarClock,
    color: "from-teal-500/20 to-teal-600/20",
    permissions: ["scheduling.view"],
    expanded: false,
    items: [
      { id: "scheduling", to: "/scheduling", icon: CalendarClock, label: "Scheduling", permission: "scheduling.view", visible: true },
    ]
  },
  {
    id: "users",
    title: "Users",
    description: "Access and permissions management",
    icon: UserCog,
    color: "from-red-500/20 to-red-600/20",
    permissions: ["users.view", "roles.view", "api_keys.view"],
    expanded: false,
    items: [
      { id: "users", to: "/users", icon: UserCog, label: "Users", permission: "users.view", visible: true },
      { id: "roles", to: "/roles", icon: Shield, label: "Roles", permission: "roles.view", visible: true },
      { id: "api-keys", to: "/api-keys", icon: Key, label: "API Keys", permission: "api_keys.view", visible: true },
    ]
  },
  {
    id: "settings",
    title: "Settings",
    description: "System configuration",
    icon: Settings,
    color: "from-gray-500/20 to-gray-600/20",
    permissions: ["settings.view", "countries.view"],
    expanded: false,
    items: [
      { id: "settings", to: "/settings", icon: Settings, label: "Settings", permission: "settings.view", visible: true },
      { id: "alert-settings", to: "/alert-settings", icon: Settings, label: "Definições de Alertas", permission: "settings.view", visible: true },
      { id: "countries", to: "/countries", icon: Globe, label: "Countries", permission: "countries.view", visible: true },
      { id: "trash", to: "/trash", icon: Package2, label: "Trash", visible: true },
    ]
  },
];

const loadSavedConfig = (): MenuGroup[] => {
  const saved = localStorage.getItem("menuConfig");
  const defaults = createDefaultMenuGroups();
  
  if (!saved) return defaults;
  
  try {
    const config: SavedMenuConfig = JSON.parse(saved);
    
    // Reorder based on saved order
    let ordered = config.order
      .map(id => defaults.find(g => g.id === id))
      .filter((g): g is MenuGroup => g !== undefined);
    
    // Add any new groups that weren't in saved order
    const newGroups = defaults.filter(g => !config.order.includes(g.id));
    ordered = [...ordered, ...newGroups];
    
    // Apply saved customizations
    return ordered.map(group => {
      const savedGroup = config.groups[group.id];
      if (!savedGroup) return group;
      
      return {
        ...group,
        title: savedGroup.title ?? group.title,
        description: savedGroup.description ?? group.description,
        expanded: savedGroup.expanded ?? group.expanded,
        color: savedGroup.color ?? group.color,
        items: group.items.map(item => {
          const savedItem = savedGroup.items?.find(i => i.id === item.id);
          if (!savedItem) return item;
          return {
            ...item,
            visible: savedItem.visible ?? item.visible,
            label: savedItem.label ?? item.label,
          };
        }),
      };
    });
  } catch {
    return defaults;
  }
};

const saveConfig = (groups: MenuGroup[]) => {
  const config: SavedMenuConfig = {
    order: groups.map(g => g.id),
    groups: {},
  };
  
  const defaults = createDefaultMenuGroups();
  
  groups.forEach(group => {
    const defaultGroup = defaults.find(d => d.id === group.id);
    if (!defaultGroup) return;
    
    const hasChanges = 
      group.title !== defaultGroup.title ||
      group.description !== defaultGroup.description ||
      group.expanded !== defaultGroup.expanded ||
      group.color !== defaultGroup.color ||
      group.items.some((item, idx) => 
        item.visible !== defaultGroup.items[idx]?.visible ||
        item.label !== defaultGroup.items[idx]?.label
      );
    
    if (hasChanges) {
      config.groups[group.id] = {
        title: group.title !== defaultGroup.title ? group.title : undefined,
        description: group.description !== defaultGroup.description ? group.description : undefined,
        expanded: group.expanded,
        color: group.color !== defaultGroup.color ? group.color : undefined,
        items: group.items.map(item => ({
          id: item.id,
          visible: item.visible,
          label: item.label,
        })),
      };
    }
  });
  
  localStorage.setItem("menuConfig", JSON.stringify(config));
};

interface SortableCardProps {
  group: MenuGroup;
  visibleItems: MenuItem[];
  navigate: (path: string) => void;
  onToggleExpand: () => void;
  onEdit: () => void;
}

const SortableCard = ({ group, visibleItems, navigate, onToggleExpand, onEdit }: SortableCardProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: group.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const GroupIcon = group.icon;

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`overflow-hidden transition-shadow ${isDragging ? 'z-50 shadow-2xl' : ''}`}
    >
      <CardHeader 
        className={`bg-gradient-to-r ${group.color} relative cursor-pointer select-none`}
        onClick={onToggleExpand}
      >
        <div className="absolute top-2 right-2 flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="p-1.5 rounded hover:bg-background/50 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <div
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            className="p-1.5 cursor-grab active:cursor-grabbing rounded hover:bg-background/50 transition-colors"
          >
            <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-background/80 rounded-lg">
            <GroupIcon className="w-6 h-6 text-foreground" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-foreground">{group.title}</h3>
              {group.expanded ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
            <p className="text-sm text-muted-foreground">{group.description}</p>
          </div>
        </div>
      </CardHeader>
      
      {group.expanded && visibleItems.length > 0 && (
        <CardContent className="p-4 animate-fade-in">
          <div className="grid grid-cols-2 gap-2">
            {visibleItems.map((item) => {
              const ItemIcon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => navigate(item.to)}
                  className="flex items-center gap-2 p-3 rounded-lg hover:bg-accent text-left transition-colors group"
                >
                  <ItemIcon className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  <span className="text-sm font-medium text-foreground">{item.label}</span>
                </button>
              );
            })}
          </div>
        </CardContent>
      )}
    </Card>
  );
};

interface EditDialogProps {
  group: MenuGroup | null;
  onClose: () => void;
  onSave: (group: MenuGroup) => void;
}

const COLOR_OPTIONS = [
  { label: "Blue", value: "from-blue-500/20 to-blue-600/20" },
  { label: "Green", value: "from-green-500/20 to-green-600/20" },
  { label: "Purple", value: "from-purple-500/20 to-purple-600/20" },
  { label: "Pink", value: "from-pink-500/20 to-pink-600/20" },
  { label: "Orange", value: "from-orange-500/20 to-orange-600/20" },
  { label: "Cyan", value: "from-cyan-500/20 to-cyan-600/20" },
  { label: "Amber", value: "from-amber-500/20 to-amber-600/20" },
  { label: "Teal", value: "from-teal-500/20 to-teal-600/20" },
  { label: "Indigo", value: "from-indigo-500/20 to-indigo-600/20" },
  { label: "Red", value: "from-red-500/20 to-red-600/20" },
  { label: "Slate", value: "from-slate-500/20 to-slate-600/20" },
  { label: "Gray", value: "from-gray-500/20 to-gray-600/20" },
  { label: "Emerald", value: "from-emerald-500/20 to-emerald-600/20" },
  { label: "Violet", value: "from-violet-500/20 to-violet-600/20" },
  { label: "Rose", value: "from-rose-500/20 to-rose-600/20" },
  { label: "Yellow", value: "from-yellow-500/20 to-yellow-600/20" },
];

const EditDialog = ({ group, onClose, onSave }: EditDialogProps) => {
  const [title, setTitle] = useState(group?.title ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [color, setColor] = useState(group?.color ?? "");
  const [items, setItems] = useState(group?.items ?? []);

  useEffect(() => {
    if (group) {
      setTitle(group.title);
      setDescription(group.description);
      setColor(group.color);
      setItems(group.items);
    }
  }, [group]);

  const handleItemVisibility = (itemId: string, visible: boolean) => {
    setItems(items.map(item => 
      item.id === itemId ? { ...item, visible } : item
    ));
  };

  const handleItemLabel = (itemId: string, label: string) => {
    setItems(items.map(item => 
      item.id === itemId ? { ...item, label } : item
    ));
  };

  const handleSave = () => {
    if (!group) return;
    onSave({
      ...group,
      title,
      description,
      color,
      items,
    });
  };

  return (
    <Dialog open={!!group} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Module</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Header Color</Label>
            <div className="grid grid-cols-4 gap-2">
              {COLOR_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setColor(opt.value)}
                  className={`p-2 rounded-lg bg-gradient-to-r ${opt.value} border-2 transition-all text-xs font-medium ${
                    color === opt.value 
                      ? "border-primary ring-2 ring-primary/20" 
                      : "border-transparent hover:border-muted-foreground/30"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>Menu Items</Label>
            <div className="space-y-3 border rounded-lg p-3">
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-3">
                  <Checkbox
                    checked={item.visible}
                    onCheckedChange={(checked) => 
                      handleItemVisibility(item.id, checked === true)
                    }
                  />
                  <Input
                    value={item.label}
                    onChange={(e) => handleItemLabel(item.id, e.target.value)}
                    className="flex-1"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const Home = () => {
  const navigate = useNavigate();
  const { companies, isLoading } = useCompany();
  const { hasPermission, hasAnyPermission, loading: permissionsLoading } = usePermissions();
  const [menuGroups, setMenuGroups] = useState<MenuGroup[]>(loadSavedConfig);
  const [editingGroup, setEditingGroup] = useState<MenuGroup | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    const flag = sessionStorage.getItem("showWelcomeOrg");
    if (flag === "true" && companies.length === 0) {
      setShowWelcome(true);
      sessionStorage.removeItem("showWelcomeOrg");
    } else if (flag === "true" && companies.length > 0) {
      // User already has companies, dismiss the flag
      sessionStorage.removeItem("showWelcomeOrg");
    }
  }, [companies, isLoading]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setMenuGroups((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        const newOrder = arrayMove(items, oldIndex, newIndex);
        saveConfig(newOrder);
        return newOrder;
      });
    }
  };

  const toggleExpand = (groupId: string) => {
    setMenuGroups((groups) => {
      const updated = groups.map(g =>
        g.id === groupId ? { ...g, expanded: !g.expanded } : g
      );
      saveConfig(updated);
      return updated;
    });
  };

  const handleEditSave = (updatedGroup: MenuGroup) => {
    setMenuGroups((groups) => {
      const updated = groups.map(g =>
        g.id === updatedGroup.id ? updatedGroup : g
      );
      saveConfig(updated);
      return updated;
    });
    setEditingGroup(null);
  };

  const resetConfig = () => {
    localStorage.removeItem("menuConfig");
    setMenuGroups(createDefaultMenuGroups());
  };

  const visibleGroups = menuGroups.filter(group => {
    // If no companies or permissions still loading, show all groups
    if (permissionsLoading || companies.length === 0) return true;
    // Derive group visibility from whether at least one child item is accessible
    const hasVisibleItem = group.items.some(item => {
      if (!item.visible) return false;
      if (!item.permission) return true;
      return hasPermission(item.permission);
    });
    if (hasVisibleItem) return true;
    // Fallback: check group-level permissions
    if (!group.permissions || group.permissions.length === 0) return true;
    return hasAnyPermission(group.permissions);
  });

  const getVisibleItems = (items: MenuItem[]) => {
    return items.filter(item => {
      if (!item.visible) return false;
      if (permissionsLoading || companies.length === 0) return true;
      if (!item.permission) return true;
      return hasPermission(item.permission);
    });
  };

  return (
    <>
      <div className="p-6 space-y-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground">Welcome to Olyvia</h1>
          <p className="text-muted-foreground mt-2">
            Click to expand, drag to reorder, or edit to customize
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={resetConfig}
            className="mt-2"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset Layout
          </Button>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={visibleGroups.map(g => g.id)}
            strategy={rectSortingStrategy}
          >
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visibleGroups.map((group) => {
                const visibleItems = getVisibleItems(group.items);

                return (
                  <SortableCard
                    key={group.id}
                    group={group}
                    visibleItems={visibleItems}
                    navigate={navigate}
                    onToggleExpand={() => toggleExpand(group.id)}
                    onEdit={() => setEditingGroup(group)}
                  />
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      <EditDialog
        group={editingGroup}
        onClose={() => setEditingGroup(null)}
        onSave={handleEditSave}
      />

      <WelcomeOrgDialog open={showWelcome} onClose={() => setShowWelcome(false)} />
    </>
  );
};

export default Home;
