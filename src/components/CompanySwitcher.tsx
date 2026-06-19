import { ChevronDown, ChevronRight, Plus, Check, Building2, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useCompany } from "@/contexts/CompanyContext";
import { useTranslation } from "@/hooks/useTranslation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useMemo, useState, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Company {
  id: string;
  name: string;
  logo_url?: string | null;
  type?: string | null;
  parent_id?: string | null;
  parent_name?: string | null;
}

const typeColors: Record<string, { bg: string; text: string; avatar: string }> = {
  holding: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', avatar: 'bg-purple-200 text-purple-700 dark:bg-purple-800 dark:text-purple-200' },
  empresa: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', avatar: 'bg-blue-200 text-blue-700 dark:bg-blue-800 dark:text-blue-200' },
  filial: { bg: 'bg-cyan-100 dark:bg-cyan-900/30', text: 'text-cyan-700 dark:text-cyan-300', avatar: 'bg-cyan-200 text-cyan-700 dark:bg-cyan-800 dark:text-cyan-200' },
  departamento: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', avatar: 'bg-green-200 text-green-700 dark:bg-green-800 dark:text-green-200' },
  equipa: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300', avatar: 'bg-yellow-200 text-yellow-700 dark:bg-yellow-800 dark:text-yellow-200' },
  divisao: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300', avatar: 'bg-orange-200 text-orange-700 dark:bg-orange-800 dark:text-orange-200' },
  projeto: { bg: 'bg-pink-100 dark:bg-pink-900/30', text: 'text-pink-700 dark:text-pink-300', avatar: 'bg-pink-200 text-pink-700 dark:bg-pink-800 dark:text-pink-200' },
};

const typeLabels: Record<string, Record<string, string>> = {
  pt: { holding: 'Holding', empresa: 'Empresa', filial: 'Filial', departamento: 'Departamento', equipa: 'Equipa', divisao: 'Divisão', projeto: 'Projeto' },
  en: { holding: 'Holding', empresa: 'Company', filial: 'Branch', departamento: 'Department', equipa: 'Team', divisao: 'Division', projeto: 'Project' },
  es: { holding: 'Holding', empresa: 'Empresa', filial: 'Filial', departamento: 'Departamento', equipa: 'Equipo', divisao: 'División', proyecto: 'Proyecto' },
  fr: { holding: 'Holding', empresa: 'Entreprise', filial: 'Filiale', departamento: 'Département', equipa: 'Équipe', divisao: 'Division', projeto: 'Projet' },
};

function getTypeStyle(type?: string | null) {
  return typeColors[type || ''] || typeColors.empresa;
}

function getTypeLabel(type: string | null | undefined, lang: string) {
  if (!type) return null;
  return typeLabels[lang]?.[type] || typeLabels.en[type] || type;
}

interface TreeNode {
  company: Company;
  children: TreeNode[];
  depth: number;
}

// Role display labels
const roleLabels: Record<string, Record<string, string>> = {
  en: { system_admin: 'System Admin', super_admin: 'Super Admin', org_admin: 'Org Admin', org_editor: 'Editor', org_viewer: 'Viewer', manager: 'Manager', member: 'Member', viewer: 'Viewer' },
  pt: { system_admin: 'Admin Sistema', super_admin: 'Super Admin', org_admin: 'Admin Org', org_editor: 'Editor', org_viewer: 'Visualizador', manager: 'Gestor', member: 'Membro', viewer: 'Visualizador' },
  es: { system_admin: 'Admin Sistema', super_admin: 'Super Admin', org_admin: 'Admin Org', org_editor: 'Editor', org_viewer: 'Visualizador', manager: 'Gestor', member: 'Miembro', viewer: 'Visualizador' },
  fr: { system_admin: 'Admin Système', super_admin: 'Super Admin', org_admin: 'Admin Org', org_editor: 'Éditeur', org_viewer: 'Visualiseur', manager: 'Gestionnaire', member: 'Membre', viewer: 'Visualiseur' },
  de: { system_admin: 'System Admin', super_admin: 'Super Admin', org_admin: 'Org Admin', org_editor: 'Editor', org_viewer: 'Betrachter', manager: 'Manager', member: 'Mitglied', viewer: 'Betrachter' },
};

/** Build a nested tree: companies with a parent_id are children of the company with that id */
function buildNestedTree(companies: Company[]): TreeNode[] {
  const companyMap = new Map(companies.map(c => [c.id, c]));
  const childrenMap = new Map<string, Company[]>();

  companies.forEach(c => {
    if (c.parent_id && companyMap.has(c.parent_id)) {
      const siblings = childrenMap.get(c.parent_id) || [];
      siblings.push(c);
      childrenMap.set(c.parent_id, siblings);
    }
  });

  const roots = companies.filter(c => !c.parent_id || !companyMap.has(c.parent_id));

  const buildChildren = (company: Company, depth: number): TreeNode => {
    const children = (childrenMap.get(company.id) || [])
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(child => buildChildren(child, depth + 1));
    return { company, children, depth };
  };

  return roots
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(root => buildChildren(root, 0));
}

/** Check if a tree node or its descendants match a search query */
function matchesSearch(node: TreeNode, query: string): boolean {
  const q = query.toLowerCase();
  if (node.company.name.toLowerCase().includes(q)) return true;
  return node.children.some(child => matchesSearch(child, q));
}

/** Filter tree by search query, keeping matching branches */
function filterTree(nodes: TreeNode[], query: string): TreeNode[] {
  if (!query.trim()) return nodes;
  return nodes
    .filter(node => matchesSearch(node, query))
    .map(node => ({
      ...node,
      children: filterTree(node.children, query),
    }));
}

function TreeItem({
  node,
  activeCompanyId,
  onSelect,
  expandedIds,
  toggleExpand,
  searchActive,
  lang,
}: {
  node: TreeNode;
  activeCompanyId: string;
  onSelect: (c: Company) => void;
  expandedIds: Set<string>;
  toggleExpand: (id: string) => void;
  searchActive: boolean;
  lang: string;
}) {
  const hasChildren = node.children.length > 0;
  const isExpanded = searchActive || expandedIds.has(node.company.id);
  const { company, depth } = node;
  const style = getTypeStyle(company.type);

  return (
    <>
      <DropdownMenuItem
        onClick={(e) => {
          e.preventDefault();
          onSelect(company);
        }}
        className="flex items-center gap-1.5 cursor-pointer py-1.5"
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        {/* Expand/collapse toggle */}
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggleExpand(company.id);
            }}
            className="flex-shrink-0 p-0.5 rounded hover:bg-accent"
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            )}
          </button>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}

        <Avatar className="h-5 w-5 flex-shrink-0">
          {company.logo_url && <AvatarImage src={company.logo_url} alt={company.name} />}
          <AvatarFallback className={`${style.avatar} text-[10px]`}>
            {company.name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span className={`flex-1 min-w-0 text-sm break-words ${depth === 0 ? 'font-medium' : ''}`}>
          {company.name}
        </span>
        {company.type && (
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 whitespace-nowrap ${style.bg} ${style.text}`}>
            {getTypeLabel(company.type, lang)}
          </span>
        )}
        {company.id === activeCompanyId && (
          <Check className="h-3.5 w-3.5 text-primary flex-shrink-0" />
        )}
      </DropdownMenuItem>

      {/* Children */}
      {hasChildren && isExpanded && node.children.map(child => (
        <TreeItem
          key={child.company.id}
          node={child}
          activeCompanyId={activeCompanyId}
          onSelect={onSelect}
          expandedIds={expandedIds}
          toggleExpand={toggleExpand}
          searchActive={searchActive}
          lang={lang}
        />
      ))}
    </>
  );
}

export function CompanySwitcher() {
  const navigate = useNavigate();
  const { t, language } = useTranslation();
  const { companies, activeCompany, setActiveCompany, isLoading, userType, userRoleName } = useCompany();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const getRoleLabel = (): string | null => {
    if (!userType) return null;
    // Prefer the real role name from the database; fallback to static labels for standard roles
    if (userRoleName) return userRoleName;
    return roleLabels[language]?.[userType] || roleLabels.en[userType] || userType;
  };

  const tree = useMemo(() => buildNestedTree(companies), [companies]);

  // Auto-expand the branch containing the active company
  const initialExpandedIds = useMemo(() => {
    if (!activeCompany) return new Set<string>();
    const ids = new Set<string>();
    const companyMap = new Map(companies.map(c => [c.id, c]));
    // Walk up via parent_id
    let current = activeCompany;
    while (current?.parent_id && companyMap.has(current.parent_id)) {
      ids.add(current.parent_id);
      current = companyMap.get(current.parent_id)!;
    }
    return ids;
  }, [activeCompany, companies]);

  // Merge initial + user-toggled
  const effectiveExpanded = useMemo(() => {
    const merged = new Set(initialExpandedIds);
    expandedIds.forEach(id => {
      if (merged.has(id)) merged.delete(id);
      else merged.add(id);
    });
    return merged;
  }, [initialExpandedIds, expandedIds]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const filteredTree = useMemo(
    () => filterTree(tree, searchQuery),
    [tree, searchQuery]
  );

  const searchActive = searchQuery.trim().length > 0;
  const showSearch = companies.length > 5;

  const handleSelect = (c: Company) => {
    setActiveCompany(c);
    setSearchQuery("");
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-4 w-24" />
      </div>
    );
  }

  if (companies.length === 0) {
    return (
      <Button
        variant="ghost"
        onClick={() => navigate("/organizations?action=new")}
        className="flex items-center gap-2 h-auto py-1.5 px-2 text-sidebar-foreground hover:bg-sidebar-accent"
      >
        <Plus className="h-4 w-4" />
        <span className="font-medium text-sm">{t('companySwitcher.createCompany')}</span>
      </Button>
    );
  }

  if (!activeCompany) return null;

  const activeOrgRole = getRoleLabel();

  // Single organization — no dropdown needed
  if (companies.length === 1) {
    return (
      <div className="flex items-center gap-2 text-sidebar-foreground">
        <Avatar className="h-7 w-7">
          {activeCompany.logo_url && <AvatarImage src={activeCompany.logo_url} alt={activeCompany.name} />}
          <AvatarFallback className="bg-primary/10 text-primary text-xs">
            {activeCompany.name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col items-start">
          <span className="font-medium text-sm leading-tight">{activeCompany.name}</span>
          {activeCompany.parent_name && (
            <span className="text-muted-foreground text-[10px] leading-tight">{activeCompany.parent_name}</span>
          )}
        </div>
        {activeOrgRole && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{activeOrgRole}</Badge>
        )}
      </div>
    );
  }

  return (
    <DropdownMenu onOpenChange={() => { setSearchQuery(""); setExpandedIds(new Set()); }}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="flex items-center gap-2 h-auto py-1.5 px-2 text-sidebar-foreground hover:bg-sidebar-accent"
        >
          <div className="relative">
            <Avatar className="h-7 w-7">
              {activeCompany.logo_url && <AvatarImage src={activeCompany.logo_url} alt={activeCompany.name} />}
              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                {activeCompany.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full h-4 w-4 flex items-center justify-center">
              {companies.length}
            </span>
          </div>
          <div className="flex flex-col items-start">
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-sm leading-tight">{activeCompany.name}</span>
              {activeOrgRole && (
                <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4">{activeOrgRole}</Badge>
              )}
            </div>
            {activeCompany.parent_name && (
              <span className="text-muted-foreground text-[10px] leading-tight">{activeCompany.parent_name}</span>
            )}
          </div>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[360px] max-w-[90vw] p-0">
        <div className="p-2">
          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal px-0 py-1">
            {t('companySwitcher.switchCompany')}
          </DropdownMenuLabel>

          {/* Search (only shown when >5 orgs) */}
          {showSearch && (
            <div className="relative mt-1 mb-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder={t('header.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 text-sm"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
          )}
        </div>

        <DropdownMenuSeparator className="my-0" />

        <div className="max-h-[320px] overflow-y-auto">
          <div className="py-1">
            {filteredTree.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                {t('common.noResults') || 'Sem resultados'}
              </div>
            ) : (
              filteredTree.map(node => (
                <TreeItem
                  key={node.company.id}
                  node={node}
                  activeCompanyId={activeCompany.id}
                  onSelect={handleSelect}
                  expandedIds={effectiveExpanded}
                  toggleExpand={toggleExpand}
                  searchActive={searchActive}
                  lang={language}
                />
              ))
            )}
          </div>
        </div>

        <DropdownMenuSeparator className="my-0" />
        <div className="p-1">
          <DropdownMenuItem
            onClick={() => navigate("/organizations?action=new")}
            className="flex items-center gap-2 cursor-pointer text-primary"
          >
            <Plus className="h-4 w-4" />
            <span>{t('companySwitcher.createNewCompany')}</span>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}