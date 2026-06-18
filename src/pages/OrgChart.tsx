import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useTranslation } from "@/hooks/useTranslation";
import { usePermissions } from "@/hooks/usePermissions";
import { useCompany } from "@/contexts/CompanyContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Shield, Users, Palette, Move, ZoomIn, ZoomOut, Maximize2, LayoutTemplate, Building2, Building, Link2 } from "lucide-react";
import { OrgChartCard, getOrgTypeColors, getOrgTypeLabel, OrgType } from "@/components/orgchart/OrgChartCard";
import { OrgChartColorPicker, OrgChartColorSettings, DEFAULT_COLORS } from "@/components/orgchart/OrgChartColorPicker";
import { OrgChartAddDialog } from "@/components/orgchart/OrgChartAddDialog";
import { PeopleOrgChartDialog } from "@/components/orgchart/PeopleOrgChartDialog";
import { OrgChartDetailsDialog } from "@/components/orgchart/OrgChartDetailsDialog";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { motion, AnimatePresence } from "framer-motion";
import { OrgChartTemplatePicker } from "@/components/orgchart/OrgChartTemplatePicker";
import { OrgAssociationsDialog } from "@/components/orgchart/OrgAssociationsDialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { resolveBusinessUserId } from "@/lib/identity/resolveBusinessUserId";

interface OrgNode {
  id: string;
  name: string;
  type: string;
  status: string;
  metadata: any;
  children: OrgNode[];
  memberCount?: number;
}

interface HierarchyRow {
  parent_org_id: string;
  child_org_id: string;
}

type AddDialogState = { open: boolean; parentId: string } | null;
type RemoveDialogState = { open: boolean; childId: string; parentId: string } | null;

export default function OrgChart() {
  const { t, language } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { hasPermission, loading: permLoading } = usePermissions();
  const { companies, activeCompany } = useCompany();
  const canView = hasPermission("organizations.view");

  const [loading, setLoading] = useState(true);
  const [rootOrgs, setRootOrgs] = useState<OrgNode[]>([]);
  const [selectedRootId, setSelectedRootId] = useState<string | null>(null);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const [addDialog, setAddDialog] = useState<AddDialogState>(null);
  const [removeDialog, setRemoveDialog] = useState<RemoveDialogState>(null);
  const [dragEnabled, setDragEnabled] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [activeDragName, setActiveDragName] = useState("");
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(1);
  const [peopleDialog, setPeopleDialog] = useState<{ open: boolean; entityId: string; entityName: string } | null>(null);
  const [detailsDialog, setDetailsDialog] = useState<{ open: boolean; entityId: string } | null>(null);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'hierarchy' | 'by_departments'>('hierarchy');
  const [associations, setAssociations] = useState<{ org_id: string; associated_org_id: string }[]>([]);
  const [assocDialog, setAssocDialog] = useState<{ open: boolean; orgId: string; orgName: string; orgType: string } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  useEffect(() => {
    if (!permLoading && canView) loadData();
    else if (!permLoading && !canView) setLoading(false);
  }, [permLoading, canView]);

  const loadData = async () => {
    try {
      const [orgsRes, hierarchyRes, membersRes, authRes, assocsRes] = await Promise.all([
        (supabase as any).from("anew_organizations").select("id, name, type, status, metadata").eq("status", "active").order("name"),
        (supabase as any).from("anew_hierarchy").select("parent_org_id, child_org_id"),
        (supabase as any).from("anew_memberships").select("organization_id").eq("status", "active"),
        supabase.auth.getUser(),
        (supabase as any).from("anew_org_associations").select("org_id, associated_org_id"),
      ]);

      const allOrgs = orgsRes.data || [];
      const allHierarchy: HierarchyRow[] = hierarchyRes.data || [];
      
      const memberCounts = new Map<string, number>();
      for (const m of (membersRes.data || [])) {
        memberCounts.set(m.organization_id, (memberCounts.get(m.organization_id) || 0) + 1);
      }

      // Fetch current user's membership org IDs for filtering
      let userOrgIds = new Set<string>();
      const authUser = authRes.data?.user;
      if (authUser) {
        const { data: anewUser } = await (supabase as any).from("anew_users")
          .select("id").eq("auth_user_id", authUser.id).maybeSingle();
        if (anewUser) {
          const { data: userMemberships } = await (supabase as any).from("anew_memberships")
            .select("organization_id").eq("user_id", anewUser.id).eq("status", "active");
          userOrgIds = new Set((userMemberships || []).map((m: any) => m.organization_id));
        }
      }

      const orgMap = new Map(allOrgs.map((o: any) => [o.id, o]));
      const childIds = new Set(allHierarchy.map((h: HierarchyRow) => h.child_org_id));
      const rootOrgIds = allOrgs.filter((o: any) => !childIds.has(o.id)).map((o: any) => o.id);

      const buildTree = (orgId: string, visited = new Set<string>()): OrgNode | null => {
        if (visited.has(orgId)) return null;
        visited.add(orgId);
        const org = orgMap.get(orgId) as any;
        if (!org) return null;
        const childRelations = allHierarchy.filter(h => h.parent_org_id === orgId);
        const children: OrgNode[] = [];
        for (const rel of childRelations) {
          const child = buildTree(rel.child_org_id, visited);
          if (child) children.push(child);
        }
        return { 
          id: org.id, name: org.name, type: org.type, status: org.status, 
          metadata: org.metadata, children,
          memberCount: memberCounts.get(org.id) || 0,
        };
      };

      const trees: OrgNode[] = [];
      for (const rootId of rootOrgIds) {
        const tree = buildTree(rootId);
        if (tree) trees.push(tree);
      }

      // Filter trees to only those containing orgs the user belongs to
      const treeContainsUserOrg = (node: OrgNode): boolean => {
        if (userOrgIds.has(node.id)) return true;
        return node.children.some(c => treeContainsUserOrg(c));
      };
      const accessibleTrees = userOrgIds.size > 0 
        ? trees.filter(t => treeContainsUserOrg(t)) 
        : trees;

      setAssociations(assocsRes.data || []);
      setRootOrgs(accessibleTrees);
      if (accessibleTrees.length === 1) {
        setSelectedRootId(accessibleTrees[0].id);
      } else if (activeCompany) {
        const findRoot = (node: OrgNode): boolean => {
          if (node.id === activeCompany.id) return true;
          return node.children.some(c => findRoot(c));
        };
        const matching = accessibleTrees.find(t => findRoot(t));
        if (matching) setSelectedRootId(matching.id);
      }
    } catch (error) {
      console.error("Error loading org chart data:", error);
    } finally {
      setLoading(false);
    }
  };

  const selectedTree = rootOrgs.find(r => r.id === selectedRootId);

  // Build alternate "by departments" view using cross-associations
  const departmentViewTree = useMemo((): OrgNode | null => {
    if (!selectedTree || viewMode !== 'by_departments') return null;
    
    // Collect all nodes in the tree
    const allNodes = new Map<string, OrgNode>();
    const collectNodes = (node: OrgNode) => {
      allNodes.set(node.id, node);
      node.children.forEach(collectNodes);
    };
    collectNodes(selectedTree);

    const deptTypes = new Set(['departamento', 'equipa', 'divisao', 'projeto']);
    const companyTypes = new Set(['empresa', 'filial']);

    // Find all departments and companies in the tree
    const departments: OrgNode[] = [];
    const companiesInTree: OrgNode[] = [];
    allNodes.forEach(node => {
      if (deptTypes.has(node.type)) departments.push(node);
      if (companyTypes.has(node.type)) companiesInTree.push(node);
    });

    // Build department → associated companies mapping
    const deptChildren = new Map<string, OrgNode[]>();
    for (const dept of departments) {
      const associatedCompanyIds = new Set<string>();
      for (const a of associations) {
        if (a.org_id === dept.id) associatedCompanyIds.add(a.associated_org_id);
        if (a.associated_org_id === dept.id) associatedCompanyIds.add(a.org_id);
      }
      const children = companiesInTree.filter(c => associatedCompanyIds.has(c.id))
        .map(c => ({ ...c, children: [] })); // Don't show company sub-hierarchy in this view
      deptChildren.set(dept.id, children);
    }

    // Root node with departments as direct children
    return {
      ...selectedTree,
      children: departments.map(dept => ({
        ...dept,
        children: deptChildren.get(dept.id) || [],
      })),
    };
  }, [selectedTree, viewMode, associations]);

  // Build "by companies" view: show only company-type nodes under root, with their sub-hierarchy filtered
  const companyViewTree = useMemo((): OrgNode | null => {
    if (!selectedTree || viewMode !== 'hierarchy') return null;
    
    const companyTypes = new Set(['empresa', 'filial']);
    const deptTypes = new Set(['departamento', 'equipa', 'divisao', 'projeto']);

    // Recursively filter: keep only company-type children (and their company-type descendants)
    const filterCompanies = (node: OrgNode, isRoot: boolean): OrgNode => {
      // For children: keep only company-types, and recurse
      const filteredChildren: OrgNode[] = [];
      for (const child of node.children) {
        if (companyTypes.has(child.type)) {
          filteredChildren.push(filterCompanies(child, false));
        } else if (isRoot || child.type === 'holding') {
          // If it's a holding/root-level non-company, check if it has company descendants
          const filtered = filterCompanies(child, false);
          if (filtered.children.length > 0 || companyTypes.has(filtered.type)) {
            filteredChildren.push(filtered);
          }
        }
      }
      // Also pull up associated companies from departments via associations
      if (deptTypes.has(node.type)) {
        // This is a department in the hierarchy - skip it, its companies are handled via associations
        return { ...node, children: [] };
      }
      return { ...node, children: filteredChildren };
    };

    return filterCompanies(selectedTree, true);
  }, [selectedTree, viewMode]);

  const activeTree = useMemo(() => {
    if (viewMode === 'by_departments' && departmentViewTree) return departmentViewTree;
    if (viewMode === 'hierarchy' && companyViewTree) return companyViewTree;
    return selectedTree;
  }, [viewMode, departmentViewTree, companyViewTree, selectedTree]);

  const collectSubtreeIds = useCallback((node: OrgNode, targetId: string): Set<string> | null => {
    if (node.id === targetId) {
      const ids = new Set<string>();
      const walk = (n: OrgNode) => { ids.add(n.id); n.children.forEach(walk); };
      walk(node);
      return ids;
    }
    for (const child of node.children) {
      const result = collectSubtreeIds(child, targetId);
      if (result) return result;
    }
    return null;
  }, []);

  const editableIds = useMemo(() => {
    if (!activeCompany?.id) return new Set<string>();
    const tree = activeTree || selectedTree;
    if (!tree) return new Set<string>();
    // Try to find the active company subtree in the current view tree
    const fromActive = collectSubtreeIds(tree, activeCompany.id);
    if (fromActive) return fromActive;
    // If active company is not in the current view tree (e.g. department view),
    // fallback to the raw tree to check permissions, then allow all visible nodes
    if (selectedTree) {
      const fromRaw = collectSubtreeIds(selectedTree, activeCompany.id);
      if (fromRaw && fromRaw.size > 0) {
        // User has permissions in the raw tree — collect all IDs from the active view tree
        const allVisible = new Set<string>();
        const walk = (n: OrgNode) => { allVisible.add(n.id); n.children.forEach(walk); };
        walk(tree);
        return allVisible;
      }
    }
    return new Set<string>();
  }, [activeTree, selectedTree, activeCompany?.id, collectSubtreeIds]);

  const findParentId = useCallback((tree: OrgNode, targetId: string, parentId?: string): string | null => {
    if (tree.id === targetId) return parentId || null;
    for (const child of tree.children) {
      const result = findParentId(child, targetId, tree.id);
      if (result !== null) return result;
    }
    return null;
  }, []);

  const isDescendant = useCallback((tree: OrgNode, sourceId: string, targetId: string): boolean => {
    const findNode = (node: OrgNode, id: string): OrgNode | null => {
      if (node.id === id) return node;
      for (const c of node.children) { const r = findNode(c, id); if (r) return r; }
      return null;
    };
    const sourceNode = findNode(tree, sourceId);
    if (!sourceNode) return false;
    const check = (node: OrgNode): boolean => node.id === targetId || node.children.some(c => check(c));
    return check(sourceNode);
  }, []);

  const toggleCollapse = (nodeId: string) => {
    setCollapsedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId); else next.add(nodeId);
      return next;
    });
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
    setActiveDragName((event.active.data?.current as any)?.name || "");
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDragId(null);
    setActiveDragName("");

    const { active, over } = event;
    const visibleTree = activeTree || selectedTree;
    const hierarchyTree = selectedTree || visibleTree;

    if (!over || active.id === over.id || !visibleTree || !hierarchyTree) return;

    const draggedId = active.id as string;
    const targetId = over.id as string;

    const findNode = (node: OrgNode, id: string): OrgNode | null => {
      if (node.id === id) return node;
      for (const child of node.children) {
        const result = findNode(child, id);
        if (result) return result;
      }
      return null;
    };

    const visibleDraggedNode = findNode(visibleTree, draggedId);
    const visibleTargetNode = findNode(visibleTree, targetId);
    const draggedNode = findNode(hierarchyTree, draggedId) || visibleDraggedNode;
    const targetNode = findNode(hierarchyTree, targetId) || visibleTargetNode;

    if (!visibleDraggedNode || !visibleTargetNode || !draggedNode || !targetNode) return;

    if (isDescendant(hierarchyTree, draggedId, targetId)) {
      toast({ title: t('common.error'), description: t('orgChart.cannotMoveToDescendant'), variant: 'destructive' });
      return;
    }

    const currentParentId = findParentId(hierarchyTree, draggedId);
    if (currentParentId === targetId) return;

    if (!editableIds.has(draggedId) || !editableIds.has(targetId)) {
      toast({ title: t('common.error'), description: t('orgChart.noPermissionToMove'), variant: 'destructive' });
      return;
    }

    if (!currentParentId) {
      toast({ title: t('common.error'), description: t('orgChart.cannotMoveRoot'), variant: 'destructive' });
      return;
    }

    const typeLevel: Record<string, number> = { holding: 0, empresa: 1, filial: 2, departamento: 3, divisao: 4, equipa: 5, projeto: 6 };
    const dragLevel = typeLevel[draggedNode.type?.toLowerCase()] ?? 99;
    const targetLevel = typeLevel[targetNode.type?.toLowerCase()] ?? 99;

    if (dragLevel <= targetLevel) {
      toast({ title: t('common.error'), description: t('orgChart.invalidHierarchy'), variant: 'destructive' });
      return;
    }

    try {
      const { data: userData } = await supabase.auth.getUser();
      const businessUserId = await resolveBusinessUserId(userData.user?.id);
      const { error } = await (supabase as any).rpc("move_organization_node", {
        p_child_org_id: draggedId,
        p_new_parent_org_id: targetId,
        p_created_by: businessUserId,
      });

      if (error) throw error;

      toast({ title: t('common.success'), description: t('orgChart.nodeMoved') });
      await loadData();
    } catch (error: any) {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
      await loadData();
    }
  };

  const handleRemove = async () => {
    if (!removeDialog) return;
    try {
      const { data: userData } = await supabase.auth.getUser();
      const businessUserId = await resolveBusinessUserId(userData.user?.id);
      const { error } = await (supabase as any).rpc("unlink_organization_node", {
        p_child_org_id: removeDialog.childId,
        p_created_by: businessUserId,
      });
      if (error) throw error;
      toast({ title: t('common.success'), description: t('orgChart.entityRemoved') });
      loadData();
    } catch (error: any) {
      toast({ title: t('common.error'), description: error.message, variant: 'destructive' });
    } finally {
      setRemoveDialog(null);
    }
  };

  const handleZoom = (delta: number) => {
    setZoom(prev => Math.min(1.5, Math.max(0.3, prev + delta)));
  };

  // Collect all unique org types in the tree for legend
  const collectTypes = useCallback((node: OrgNode): Set<string> => {
    const types = new Set<string>([node.type]);
    for (const child of node.children) {
      for (const t of collectTypes(child)) types.add(t);
    }
    return types;
  }, []);

  const legendTypes = useMemo(() => {
    const tree = activeTree;
    if (!tree) return [];
    return Array.from(collectTypes(tree)) as OrgType[];
  }, [activeTree, collectTypes]);

  const renderNode = (node: OrgNode, depth: number = 0, parentId?: string): JSX.Element => {
    const orgType = (node.type || 'empresa') as OrgType;
    const canEdit = editableIds.has(node.id);
    const isBeingDragged = activeDragId === node.id;
    const isCollapsed = collapsedNodes.has(node.id);
    const visibleChildren = isCollapsed ? [] : node.children;
    const colors = getOrgTypeColors(orgType);

    return (
      <div key={node.id} className="flex flex-col items-center">
        <OrgChartCard
          id={node.id}
          orgType={orgType}
          name={node.name}
          isDraggable={dragEnabled && canEdit && depth > 0}
          isDropTarget={dragEnabled && !isBeingDragged}
          childrenCount={node.children.length}
          memberCount={node.memberCount}
          isCollapsed={isCollapsed}
          onToggleCollapse={node.children.length > 0 ? () => toggleCollapse(node.id) : undefined}
          onAdd={canEdit ? () => setAddDialog({ open: true, parentId: node.id }) : undefined}
          onManageAssociations={canEdit ? () => setAssocDialog({ open: true, orgId: node.id, orgName: node.name, orgType: node.type }) : undefined}
          onViewDetails={() => setDetailsDialog({ open: true, entityId: node.id })}
          onViewPeople={() => setPeopleDialog({ open: true, entityId: node.id, entityName: node.name })}
          onEdit={canEdit ? () => navigate(`/organizations/${node.id}`) : undefined}
          onRemove={parentId && canEdit ? () => setRemoveDialog({ open: true, childId: node.id, parentId }) : undefined}
          canRemove={!!parentId && canEdit}
        />

        <AnimatePresence>
          {visibleChildren.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
              className="flex flex-col items-center overflow-hidden"
            >
              <div className="w-px h-8" style={{ backgroundColor: colors.border, opacity: 0.4 }} />

              {visibleChildren.length > 1 && (
                <div className="relative w-full flex justify-center min-h-[2px]">
                  <div
                    className="absolute top-0 h-px"
                    style={{
                      backgroundColor: colors.border,
                      opacity: 0.4,
                      width: `calc(${(visibleChildren.length - 1) * 100}% / ${visibleChildren.length} + 8rem)`,
                      left: '50%',
                      transform: 'translateX(-50%)',
                    }}
                  />
                </div>
              )}

              <div className="flex gap-10 justify-center items-start">
                {visibleChildren.map(child => (
                  <div key={child.id} className="flex flex-col items-center">
                    {visibleChildren.length > 1 && (
                      <div className="w-px h-5" style={{ backgroundColor: colors.border, opacity: 0.4 }} />
                    )}
                    {renderNode(child, depth + 1, node.id)}
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  if (permLoading || loading) {
    return (
      <>
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </>
    );
  }

  if (!canView) {
    return (
      <>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Card>
            <CardContent className="p-12 text-center">
              <Shield className="w-16 h-16 mx-auto mb-4 text-destructive" />
              <h2 className="text-2xl font-bold mb-2">{t('orgChart.accessDenied')}</h2>
              <p className="text-muted-foreground">{t('orgChart.noPermission')}</p>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{t('orgChart.title')}</h1>
            <p className="text-muted-foreground mt-1">{t('orgChart.subtitle')}</p>
          </div>
          <div className="flex items-center gap-2">
            {selectedRootId && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setTemplatePickerOpen(true)}
                  size="sm"
                  className="gap-2"
                >
                  <LayoutTemplate className="w-4 h-4" />
                  {t('orgChartTemplates.buttonLabel')}
                </Button>
                <Button
                  variant={dragEnabled ? "default" : "outline"}
                  onClick={() => setDragEnabled(!dragEnabled)}
                  size="sm"
                  className="gap-2"
                >
                  <Move className="w-4 h-4" />
                  {dragEnabled ? t('orgChart.dragEnabled') : t('orgChart.enableDrag')}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Drag mode indicator */}
        {dragEnabled && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-primary/10 border border-primary/30 rounded-lg p-3 flex items-center gap-3"
          >
            <Move className="h-5 w-5 text-primary shrink-0" />
            <p className="text-sm text-primary">{t('orgChart.dragInstructions')}</p>
            <Button variant="ghost" size="sm" onClick={() => setDragEnabled(false)} className="ml-auto shrink-0">
              {t('common.close')}
            </Button>
          </motion.div>
        )}

        {/* Root org selector */}
        {rootOrgs.length > 1 && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <label className="font-medium">{t('orgChart.selectOrganization')}:</label>
                <Select value={selectedRootId || ""} onValueChange={setSelectedRootId}>
                  <SelectTrigger className="w-[250px]">
                    <SelectValue placeholder={t('orgChart.selectOrganizationPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {rootOrgs.map(org => (
                      <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        )}

        {/* View mode toggle */}
        {selectedTree && (
          <div className="flex items-center gap-2">
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
              <TabsList>
                <TabsTrigger value="hierarchy" className="gap-2">
                  <Building2 className="h-4 w-4" />
                  {t('orgChart.viewByCompanies')}
                </TabsTrigger>
                <TabsTrigger value="by_departments" className="gap-2">
                  <Building className="h-4 w-4" />
                  {t('orgChart.viewByDepartments')}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        )}

        {/* Tree visualization */}
        {activeTree ? (
          <div className="relative">
            {/* Zoom controls */}
            <div className="absolute top-3 right-3 z-20 flex flex-col gap-1 bg-background/90 backdrop-blur rounded-lg border shadow-sm p-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleZoom(0.15)}>
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom(1)}>
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleZoom(-0.15)}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <div className="text-[10px] text-center text-muted-foreground font-mono">
                {Math.round(zoom * 100)}%
              </div>
            </div>

            <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              <div 
                ref={containerRef}
                className="overflow-auto rounded-xl border bg-muted/30 min-h-[500px]" 
                style={{ maxHeight: 'calc(100vh - 280px)' }}
              >
                <div 
                  className="flex flex-col items-center min-w-max p-8 pt-10"
                  style={{ transform: `scale(${zoom})`, transformOrigin: 'top center', transition: 'transform 0.2s ease' }}
                >
                  {renderNode(activeTree!)}
                </div>
              </div>
              <DragOverlay>
                {activeDragId && (
                  <div className="bg-primary text-primary-foreground px-4 py-2 rounded-lg shadow-xl font-semibold text-sm flex items-center gap-2 opacity-90">
                    <Move className="h-4 w-4" />
                    {activeDragName}
                  </div>
                )}
              </DragOverlay>
            </DndContext>
          </div>
        ) : rootOrgs.length > 1 ? (
          <Card className="w-full max-w-md mx-auto">
            <CardContent className="p-12 text-center">
              <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">{t('orgChart.selectOrganizationPrompt')}</p>
            </CardContent>
          </Card>
        ) : rootOrgs.length === 0 ? (
          <NoOrganizationState inline />
        ) : null}

        {/* Dynamic Legend based on actual types */}
        {legendTypes.length > 0 && (
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">{t('orgChart.legend')}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 pb-3">
              <div className="flex flex-wrap gap-4">
                {legendTypes.map(orgType => {
                  const c = getOrgTypeColors(orgType);
                  return (
                    <div key={orgType} className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-sm border-2"
                        style={{ backgroundColor: c.bg, borderColor: c.border }}
                      />
                      <span className="text-xs text-muted-foreground">{getOrgTypeLabel(orgType, language)}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Dialogs */}
      {addDialog && (
        <OrgChartAddDialog open={addDialog.open} onOpenChange={(open) => !open && setAddDialog(null)} parentId={addDialog.parentId} onSuccess={loadData} />
      )}

      <AlertDialog open={removeDialog?.open} onOpenChange={(open) => !open && setRemoveDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.confirm')}</AlertDialogTitle>
            <AlertDialogDescription>{t('orgChart.confirmRemove')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove}>{t('common.confirm')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {peopleDialog && (
        <PeopleOrgChartDialog open={peopleDialog.open} onOpenChange={(open) => !open && setPeopleDialog(null)} entityId={peopleDialog.entityId} entityName={peopleDialog.entityName} />
      )}

      {detailsDialog && (
        <OrgChartDetailsDialog open={detailsDialog.open} onOpenChange={(open) => !open && setDetailsDialog(null)} entityId={detailsDialog.entityId} />
      )}

      {selectedRootId && selectedTree && (
        <OrgChartTemplatePicker
          open={templatePickerOpen}
          onOpenChange={setTemplatePickerOpen}
          rootOrgId={selectedRootId}
          rootOrgName={selectedTree.name}
          onSuccess={loadData}
        />
      )}

      {assocDialog && selectedRootId && (
        <OrgAssociationsDialog
          open={assocDialog.open}
          onOpenChange={(open) => !open && setAssocDialog(null)}
          orgId={assocDialog.orgId}
          orgName={assocDialog.orgName}
          orgType={assocDialog.orgType}
          rootOrgId={selectedRootId}
          onSuccess={loadData}
        />
      )}
    </>
  );
}
