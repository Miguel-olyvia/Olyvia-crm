import { useState, useMemo, useEffect } from "react";
import { Check, ChevronsUpDown, Search, Building2, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/hooks/useTranslation";

interface Organization { id: string; name: string; type: string; parent_id?: string | null; depth?: number; }

interface OrganizationComboboxProps {
  organizations: Organization[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const TYPE_COLORS: Record<string, string> = {
  holding: "bg-purple-100 text-purple-700 border-purple-200",
  empresa: "bg-blue-100 text-blue-700 border-blue-200",
  filial: "bg-cyan-100 text-cyan-700 border-cyan-200",
  departamento: "bg-green-100 text-green-700 border-green-200",
  equipa: "bg-yellow-100 text-yellow-700 border-yellow-200",
  divisao: "bg-orange-100 text-orange-700 border-orange-200",
  projeto: "bg-pink-100 text-pink-700 border-pink-200",
};

export function OrganizationCombobox({ organizations, value, onChange, placeholder }: OrganizationComboboxProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  const childrenMap = useMemo(() => {
    const map = new Map<string, string[]>();
    organizations.forEach(org => {
      if (org.parent_id) {
        const children = map.get(org.parent_id) || [];
        children.push(org.id);
        map.set(org.parent_id, children);
      }
    });
    return map;
  }, [organizations]);

  const hasChildren = (orgId: string) => (childrenMap.get(orgId)?.length || 0) > 0;

  useEffect(() => {
    if (!open) return;
    const allParents = new Set<string>();
    organizations.forEach((org) => {
      if ((childrenMap.get(org.id)?.length || 0) > 0) {
        allParents.add(org.id);
      }
    });
    setExpandedNodes(allParents);
  }, [open, organizations, childrenMap]);

  const toggleExpand = (e: React.MouseEvent, orgId: string) => {
    e.stopPropagation();
    setExpandedNodes(prev => {
      const next = new Set(prev);
      next.has(orgId) ? next.delete(orgId) : next.add(orgId);
      return next;
    });
  };

  const hierarchicalOrgs = useMemo(() => {
    const buildHierarchy = (parentId: string | null = null, depth = 0): (Organization & { visible: boolean })[] => {
      const result: (Organization & { visible: boolean })[] = [];
      const orgsAtLevel = organizations.filter(o => parentId === null ? !o.parent_id : o.parent_id === parentId);
      orgsAtLevel.sort((a, b) => a.name.localeCompare(b.name));
      for (const org of orgsAtLevel) {
        const isVisible = depth === 0 || expandedNodes.has(org.parent_id!);
        result.push({ ...org, depth, visible: isVisible });
        if (hasChildren(org.id)) result.push(...buildHierarchy(org.id, depth + 1));
      }
      return result;
    };
    return organizations.some(o => o.parent_id) ? buildHierarchy() : [...organizations].sort((a, b) => a.name.localeCompare(b.name)).map(o => ({ ...o, visible: true }));
  }, [organizations, expandedNodes, childrenMap]);

  const filteredOrgs = useMemo(() => {
    if (!search) return hierarchicalOrgs.filter(org => org.visible);
    const query = search.toLowerCase();
    return hierarchicalOrgs.filter(org => org.name.toLowerCase().includes(query) || org.type.toLowerCase().includes(query));
  }, [hierarchicalOrgs, search]);

  const selectedOrg = organizations.find(o => o.id === value);
  const getTypeColor = (type: string) => TYPE_COLORS[type.toLowerCase()] || "bg-gray-100 text-gray-700 border-gray-200";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between h-auto min-h-10 py-2">
          {selectedOrg ? (
            <div className="flex items-center gap-2 text-left">
              <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="truncate">{selectedOrg.name}</span>
              <Badge variant="outline" className={cn("text-xs shrink-0", getTypeColor(selectedOrg.type))}>{selectedOrg.type}</Badge>
            </div>
          ) : (
            <span className="text-muted-foreground">{placeholder || t("people.selectOrganization")}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0 z-[9999]" align="start">
        <Command shouldFilter={false}>
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <input placeholder={t("people.searchOrganization")} value={search} onChange={(e) => setSearch(e.target.value)} className="flex h-10 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground" />
          </div>
          <CommandList className="max-h-[300px]">
            <CommandEmpty>{t("common.noResults")}</CommandEmpty>
            <CommandGroup>
              {filteredOrgs.map((org) => (
                <CommandItem key={org.id} value={org.id} onSelect={() => { onChange(org.id); setOpen(false); setSearch(""); }} className="cursor-pointer">
                  <div className="flex items-center gap-1 w-full" style={{ paddingLeft: `${(org.depth || 0) * 16}px` }}>
                    {hasChildren(org.id) ? (
                      <button type="button" onClick={(e) => toggleExpand(e, org.id)} className="p-0.5 hover:bg-muted rounded shrink-0">
                        {expandedNodes.has(org.id) ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                      </button>
                    ) : <span className="w-5 shrink-0" />}
                    <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 truncate">{org.name}</span>
                    <Badge variant="outline" className={cn("text-xs shrink-0", getTypeColor(org.type))}>{org.type}</Badge>
                    <Check className={cn("ml-2 h-4 w-4 shrink-0", value === org.id ? "opacity-100" : "opacity-0")} />
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
