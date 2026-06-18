import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ChevronRight, ChevronDown, Pencil, Trash2, Building2, GripVertical, Plus } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core';
import { resolveBusinessUserId } from '@/lib/identity/resolveBusinessUserId';
import { resolveOrganizationEntityId } from '@/utils/orgEntity';
import { toast } from 'sonner';

interface Organization {
  id: string;
  name: string;
  type: string;
  description: string | null;
  status: string;
}
// Hierarchy type priority — lower number = higher in the org chain
// A child must have a HIGHER priority number than its parent
const ORG_TYPE_LEVEL: Record<string, number> = {
  holding: 0, empresa: 1, filial: 2, departamento: 3, divisao: 4, equipa: 5, projeto: 6,
};

function isValidParentChild(parentType: string, childType: string): boolean {
  const parentLevel = ORG_TYPE_LEVEL[parentType?.toLowerCase()] ?? 99;
  const childLevel = ORG_TYPE_LEVEL[childType?.toLowerCase()] ?? 99;
  return childLevel > parentLevel;
}


interface HierarchyItem {
  id: string;
  parent_org_id: string;
  child_org_id: string;
  child?: Organization;
  parent?: Organization;
}

interface TreeNode {
  hierarchyId: string;
  org: Organization;
  parentOrgId: string;
  children: TreeNode[];
}

interface ChildOrganizationsTreeProps {
  children: HierarchyItem[];
  parents?: HierarchyItem[];
  rootOrgId: string;
  rootOrg?: Organization; // The current organization to show as root
  onEdit: (org: Organization) => void;
  onRemove: (hierarchyId: string) => void;
  onHierarchyChanged?: () => void;
  onSelect?: (org: Organization) => void; // Click to navigate/open in panel
  onRequestAddChild?: (parentOrg: Organization) => void; // External handler for full form
}

type MoveDialogState = {
  open: boolean;
  draggedOrg: Organization;
  newParentOrg: Organization;
  oldParentId: string;
} | null;

type AddChildDialogState = {
  open: boolean;
  parentOrg: Organization;
} | null;

// Color coding by organization type
const typeColors: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  holding: {
    bg: 'bg-amber-50 hover:bg-amber-100',
    border: 'border-amber-200',
    text: 'text-amber-700',
    badge: 'bg-amber-100 text-amber-800 border-amber-300',
  },
  empresa: {
    bg: 'bg-blue-50 hover:bg-blue-100',
    border: 'border-blue-200',
    text: 'text-blue-700',
    badge: 'bg-blue-100 text-blue-800 border-blue-300',
  },
  filial: {
    bg: 'bg-green-50 hover:bg-green-100',
    border: 'border-green-200',
    text: 'text-green-700',
    badge: 'bg-green-100 text-green-800 border-green-300',
  },
  departamento: {
    bg: 'bg-purple-50 hover:bg-purple-100',
    border: 'border-purple-200',
    text: 'text-purple-700',
    badge: 'bg-purple-100 text-purple-800 border-purple-300',
  },
  equipa: {
    bg: 'bg-pink-50 hover:bg-pink-100',
    border: 'border-pink-200',
    text: 'text-pink-700',
    badge: 'bg-pink-100 text-pink-800 border-pink-300',
  },
  projeto: {
    bg: 'bg-cyan-50 hover:bg-cyan-100',
    border: 'border-cyan-200',
    text: 'text-cyan-700',
    badge: 'bg-cyan-100 text-cyan-800 border-cyan-300',
  },
};

const defaultColors = {
  bg: 'bg-gray-50 hover:bg-gray-100',
  border: 'border-gray-200',
  text: 'text-gray-700',
  badge: 'bg-gray-100 text-gray-800 border-gray-300',
};

function getTypeColors(type: string) {
  return typeColors[type.toLowerCase()] || defaultColors;
}

interface DraggableTreeNodeProps {
  node: TreeNode;
  level: number;
  onEdit: (org: Organization) => void;
  onRemove: (hierarchyId: string) => void;
  onAddChild: (parentOrg: Organization) => void;
  onSelect?: (org: Organization) => void;
}

function DraggableTreeNode({ node, level, onEdit, onRemove, onAddChild, onSelect }: DraggableTreeNodeProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(level < 2);
  const hasChildren = node.children.length > 0;
  const colors = getTypeColors(node.org.type);

  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `drag-${node.org.id}`,
    data: { org: node.org, parentOrgId: node.parentOrgId, hierarchyId: node.hierarchyId },
  });

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop-${node.org.id}`,
    data: { org: node.org },
  });

  const countDescendants = (n: TreeNode): number => {
    return n.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
  };

  const descendantCount = countDescendants(node);

  return (
    <div className={cn("transition-all", level > 0 && "ml-6", isDragging && "opacity-50")}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div
          ref={(el) => {
            setDragRef(el);
            setDropRef(el);
          }}
          className={cn(
            "flex items-center justify-between p-3 rounded-lg transition-all border group",
            colors.bg,
            colors.border,
            isOver && "ring-2 ring-primary ring-offset-2"
          )}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {/* Drag handle */}
            <button
              {...attributes}
              {...listeners}
              className="p-1 rounded cursor-grab active:cursor-grabbing hover:bg-black/5 touch-none shrink-0"
              title={t('orgChart.dragToMove')}
            >
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </button>

            {hasChildren ? (
              <CollapsibleTrigger asChild>
                <button type="button" className="p-0.5 hover:bg-black/5 rounded shrink-0">
                  {isOpen ? (
                    <ChevronDown className={cn("h-4 w-4", colors.text)} />
                  ) : (
                    <ChevronRight className={cn("h-4 w-4", colors.text)} />
                  )}
                </button>
              </CollapsibleTrigger>
            ) : (
              <div className="w-5 shrink-0" />
            )}

            <Building2 className={cn("h-4 w-4 shrink-0", colors.text)} />

            <div className="flex items-center gap-2 flex-1 min-w-0">
              <button
                type="button"
                onClick={() => onSelect?.(node.org)}
                className={cn(
                  "font-medium text-sm truncate text-left hover:underline",
                  colors.text,
                  onSelect && "cursor-pointer"
                )}
              >
                {node.org.name}
              </button>
              <Badge variant="outline" className={cn("text-xs shrink-0", colors.badge)}>
                {t(`organizations.types.${node.org.type}`) || node.org.type}
              </Badge>
              {hasChildren && (
                <Badge variant="secondary" className="text-xs shrink-0">
                  {descendantCount} {descendantCount === 1 ? 'filho' : 'filhos'}
                </Badge>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0 ml-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onAddChild(node.org)}
              className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
              title={t('organizations.addChild')}
            >
              <Plus className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onEdit(node.org)}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <Pencil className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onRemove(node.hierarchyId)}
              className="h-8 w-8 text-destructive hover:text-destructive"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {hasChildren && (
          <CollapsibleContent className="mt-1 space-y-1">
            {node.children.map((child) => (
              <DraggableTreeNode
                key={child.hierarchyId}
                node={child}
                level={level + 1}
                onEdit={onEdit}
                onRemove={onRemove}
                onAddChild={onAddChild}
                onSelect={onSelect}
              />
            ))}
          </CollapsibleContent>
        )}
      </Collapsible>
    </div>
  );
}

// Droppable Parent Item - shows parent orgs with drop zone capability
interface DroppableParentItemProps {
  item: HierarchyItem;
  parentOrg: Organization;
  colors: { bg: string; border: string; text: string; badge: string };
  onEdit: (org: Organization) => void;
  onRemove: (hierarchyId: string) => void;
  onSelect?: (org: Organization) => void;
}

function DroppableParentItem({ item, parentOrg, colors, onEdit, onRemove, onSelect }: DroppableParentItemProps) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({
    id: `drop-parent-${parentOrg.id}`,
    data: { org: parentOrg },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex items-center justify-between p-4 rounded-lg transition-all border",
        colors.bg,
        colors.border,
        isOver && "ring-2 ring-primary ring-offset-2"
      )}
    >
      <div className="flex items-center gap-3">
        <Building2 className={cn("w-5 h-5", colors.text)} />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSelect?.(parentOrg)}
            className={cn(
              "font-medium hover:underline",
              colors.text,
              onSelect && "cursor-pointer"
            )}
          >
            {parentOrg.name}
          </button>
          <Badge variant="outline" className={cn("text-xs", colors.badge)}>
            {t(`organizations.types.${parentOrg.type}`) || parentOrg.type}
          </Badge>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onEdit(parentOrg)}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <Pencil className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onRemove(item.id)}
          className="h-8 w-8 text-destructive hover:text-destructive"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// Droppable Current Organization - the main org in the middle
interface DroppableCurrentOrgProps {
  org: Organization;
  isCurrent: boolean;
  onEdit: (org: Organization) => void;
  onAddChild: (parentOrg: Organization) => void;
  onSelect?: (org: Organization) => void;
}

function DroppableCurrentOrg({ org, isCurrent, onEdit, onAddChild, onSelect }: DroppableCurrentOrgProps) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({
    id: `drop-current-${org.id}`,
    data: { org },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex items-center justify-between p-4 bg-primary/5 border border-primary/20 rounded-lg transition-all",
        isOver && "ring-2 ring-primary ring-offset-2"
      )}
    >
      <div className="flex items-center gap-3">
        <Building2 className="w-5 h-5 text-primary" />
        <div className="flex items-center gap-2 flex-1">
          <span className="font-medium text-primary">{org.name}</span>
          <Badge variant="outline" className="border-primary/30 text-primary">
            {t(`organizations.types.${org.type}`) || org.type}
          </Badge>
          {isCurrent && (
            <Badge variant="secondary" className="text-xs">
              {t('organizations.current')}
            </Badge>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onAddChild(org)}
          className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
          title={t('organizations.addChild')}
        >
          <Plus className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onEdit(org)}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <Pencil className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// Overlay component shown while dragging
function DragOverlayContent({ org }: { org: Organization }) {
  const { t } = useTranslation();
  const colors = getTypeColors(org.type);

  return (
    <div
      className={cn(
        "flex items-center gap-2 p-3 rounded-lg border shadow-lg",
        colors.bg,
        colors.border
      )}
    >
      <GripVertical className="h-4 w-4 text-muted-foreground" />
      <Building2 className={cn("h-4 w-4", colors.text)} />
      <span className={cn("font-medium text-sm", colors.text)}>{org.name}</span>
      <Badge variant="outline" className={cn("text-xs", colors.badge)}>
        {t(`organizations.types.${org.type}`) || org.type}
      </Badge>
    </div>
  );
}

export function ChildOrganizationsTree({
  children,
  parents = [],
  rootOrgId,
  rootOrg,
  onEdit,
  onRemove,
  onHierarchyChanged,
  onSelect,
  onRequestAddChild,
}: ChildOrganizationsTreeProps) {
  const { t } = useTranslation();
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [allHierarchy, setAllHierarchy] = useState<HierarchyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggedOrg, setDraggedOrg] = useState<Organization | null>(null);
  const [moveDialog, setMoveDialog] = useState<MoveDialogState>(null);
  const [addChildDialog, setAddChildDialog] = useState<AddChildDialogState>(null);
  const [newChildForm, setNewChildForm] = useState({
    name: '',
    type: 'departamento',
    description: '',
  });
  const [addingChild, setAddingChild] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  useEffect(() => {
    buildTree();
  }, [children]);

  const buildTree = async () => {
    if (children.length === 0) {
      setTreeData([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    // Fetch all hierarchy relationships to build full tree
    const { data: hierarchyData } = await (supabase as any)
      .from('anew_hierarchy')
      .select(`
        id,
        parent_org_id,
        child_org_id,
        child:anew_organizations!anew_hierarchy_child_org_id_fkey(id, name, type, description, status)
      `);

    if (!hierarchyData) {
      setTreeData([]);
      setLoading(false);
      return;
    }

    setAllHierarchy(hierarchyData);

    // Build a map of parent_org_id -> children
    const childrenMap = new Map<string, HierarchyItem[]>();
    hierarchyData.forEach((h: HierarchyItem) => {
      const existing = childrenMap.get(h.parent_org_id) || [];
      existing.push(h);
      childrenMap.set(h.parent_org_id, existing);
    });

    // Type priority for organizational hierarchy sorting
    const typePriority: Record<string, number> = {
      holding: 0, empresa: 1, filial: 2, departamento: 3, divisao: 4, equipa: 5, projeto: 6,
    };
    const sortByType = (nodes: TreeNode[]) =>
      nodes.sort((a, b) => {
        const pa = typePriority[a.org.type?.toLowerCase() || ''] ?? 99;
        const pb = typePriority[b.org.type?.toLowerCase() || ''] ?? 99;
        return pa - pb || a.org.name.localeCompare(b.org.name);
      });

    // Recursive function to build tree
    const buildNodeChildren = (orgId: string): TreeNode[] => {
      const childItems = childrenMap.get(orgId) || [];
      const nodes = childItems.map((item) => ({
        hierarchyId: item.id,
        org: item.child!,
        parentOrgId: item.parent_org_id,
        children: item.child ? buildNodeChildren(item.child.id) : [],
      }));
      return sortByType(nodes);
    };

    // Build tree from direct children
    const tree: TreeNode[] = children
      .filter((c) => c.child)
      .map((c) => ({
        hierarchyId: c.id,
        org: c.child!,
        parentOrgId: c.parent_org_id,
        children: buildNodeChildren(c.child!.id),
      }));

    setTreeData(sortByType(tree));
    setLoading(false);
  };

  // Check if moving would create a cycle
  const wouldCreateCycle = useCallback((draggedId: string, newParentId: string): boolean => {
    const checkDescendants = (currentId: string): boolean => {
      const childItems = allHierarchy.filter(h => h.parent_org_id === currentId);
      for (const child of childItems) {
        if (child.child_org_id === newParentId) return true;
        if (checkDescendants(child.child_org_id)) return true;
      }
      return false;
    };
    
    return checkDescendants(draggedId);
  }, [allHierarchy]);

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current;
    if (data?.org) {
      setDraggedOrg(data.org);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggedOrg(null);
    const { active, over } = event;
    
    if (!over || !active) return;
    
    const draggedId = (active.id as string).replace('drag-', '');
    const droppedOnId = (over.id as string).replace('drop-', '');
    
    if (draggedId === droppedOnId) return;
    
    const activeData = active.data.current;
    const overData = over.data.current;
    
    if (!activeData?.org || !overData?.org) return;
    
    const draggedOrgData = activeData.org as Organization;
    const newParentOrgData = overData.org as Organization;
    const oldParentId = activeData.parentOrgId as string;
    
    if (oldParentId === droppedOnId) return;
    
    if (wouldCreateCycle(draggedId, droppedOnId)) {
      toast.error(t('orgChart.wouldCreateCycle'));
      return;
    }

    // Validate hierarchy: child type must be lower than parent type
    if (!isValidParentChild(newParentOrgData.type, draggedOrgData.type)) {
      toast.error(t('orgChart.invalidHierarchy'));
      return;
    }
    
    setMoveDialog({
      open: true,
      draggedOrg: draggedOrgData,
      newParentOrg: newParentOrgData,
      oldParentId,
    });
  };

  const handleConfirmMove = async () => {
    if (!moveDialog) return;
    
    try {
      const { data: userData } = await supabase.auth.getUser();
      const businessUserId = await resolveBusinessUserId(userData.user?.id);
      const { error } = await (supabase as any).rpc('move_organization_node', {
        p_child_org_id: moveDialog.draggedOrg.id,
        p_new_parent_org_id: moveDialog.newParentOrg.id,
        p_created_by: businessUserId,
      });

      if (error) throw error;

      toast.success(t('orgChart.hierarchyChanged'));
      onHierarchyChanged?.();
    } catch (error: any) {
      console.error("Error moving organization:", error);
      toast.error(error.message);
    } finally {
      setMoveDialog(null);
    }
  };

  const handleOpenAddChild = (parentOrg: Organization) => {
    // If external handler is provided, use it (full form experience)
    if (onRequestAddChild) {
      onRequestAddChild(parentOrg);
      return;
    }
    // Fallback to inline dialog
    setAddChildDialog({ open: true, parentOrg });
    setNewChildForm({ name: '', type: 'departamento', description: '' });
  };

  const handleAddChild = async () => {
    if (!addChildDialog || !newChildForm.name.trim()) {
      toast.error(t('common.required'));
      return;
    }

    // Validate hierarchy type
    if (!isValidParentChild(addChildDialog.parentOrg.type, newChildForm.type)) {
      toast.error(t('orgChart.invalidHierarchy'));
      return;
    }

    setAddingChild(true);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const businessUserId = await resolveBusinessUserId(userData.user?.id);
      const entityId = await resolveOrganizationEntityId({
        orgName: newChildForm.name.trim(),
        createdBy: businessUserId,
      });

      // Create the new organization
      const { data: newOrg, error: createError } = await (supabase as any)
        .from('anew_organizations')
        .insert({
          name: newChildForm.name.trim(),
          type: newChildForm.type,
          description: newChildForm.description.trim() || null,
          status: 'active',
          entity_id: entityId,
          created_by: businessUserId,
        })
        .select()
        .single();

      if (createError) throw createError;

      // Create the hierarchy relationship
      const { error: hierarchyError } = await (supabase as any)
        .from('anew_hierarchy')
        .insert({
          parent_org_id: addChildDialog.parentOrg.id,
          child_org_id: newOrg.id,
          relationship_type: 'parent_of',
          is_primary: true,
          created_by: businessUserId,
        });

      if (hierarchyError) throw hierarchyError;

      toast.success(t('common.created'));
      setAddChildDialog(null);
      setNewChildForm({ name: '', type: 'departamento', description: '' });
      onHierarchyChanged?.();
    } catch (error: any) {
      console.error("Error adding child:", error);
      toast.error(error.message);
    } finally {
      setAddingChild(false);
    }
  };

  if (loading) {
    return (
      <div className="text-muted-foreground text-center py-4 border rounded-lg">
        {t('common.loading')}...
      </div>
    );
  }

  const hasParents = parents.length > 0;
  const hasChildren = treeData.length > 0;

  // If no parents, no children, and no rootOrg, show empty state
  if (!hasParents && !hasChildren && !rootOrg) {
    return (
      <p className="text-muted-foreground text-center py-4 border rounded-lg">
        {t('organizations.noHierarchy')}
      </p>
    );
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="space-y-6">
          {/* Parents Section */}
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-3">
              {t("organizations.parentOrgs")}
            </h4>
            {hasParents ? (
              <div className="space-y-2">
                {parents.map((item) => {
                  const parentOrg = item.parent;
                  if (!parentOrg) return null;
                  const colors = getTypeColors(parentOrg.type);
                  return (
                    <DroppableParentItem 
                      key={item.id}
                      item={item}
                      parentOrg={parentOrg}
                      colors={colors}
                      onEdit={onEdit}
                      onRemove={onRemove}
                      onSelect={onSelect}
                    />
                  );
                })}
              </div>
            ) : (
              rootOrg && (
                <DroppableCurrentOrg 
                  org={rootOrg}
                  isCurrent={true}
                  onEdit={onEdit}
                  onAddChild={handleOpenAddChild}
                  onSelect={onSelect}
                />
              )
            )}
          </div>

          {/* Current Organization (if has parents) */}
          {hasParents && rootOrg && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-3">
                {t("organizations.current")}
              </h4>
              <DroppableCurrentOrg 
                org={rootOrg}
                isCurrent={true}
                onEdit={onEdit}
                onAddChild={handleOpenAddChild}
                onSelect={onSelect}
              />
            </div>
          )}

          {/* Children Section */}
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-3">
              {t("organizations.childOrgs")}
            </h4>
            {hasChildren ? (
              <div className="space-y-2">
                {treeData.map((node) => (
                  <DraggableTreeNode
                    key={node.hierarchyId}
                    node={node}
                    level={0}
                    onEdit={onEdit}
                    onRemove={onRemove}
                    onAddChild={handleOpenAddChild}
                    onSelect={onSelect}
                  />
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-4 border rounded-lg">
                {t('organizations.noChildren')}
              </p>
            )}
          </div>
        </div>
        
        <DragOverlay>
          {draggedOrg && <DragOverlayContent org={draggedOrg} />}
        </DragOverlay>
      </DndContext>

      {/* Move Confirmation Dialog */}
      <AlertDialog open={moveDialog?.open || false} onOpenChange={(open) => !open && setMoveDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('orgChart.confirmMove')}</AlertDialogTitle>
            <AlertDialogDescription>
              {moveDialog && t('orgChart.confirmMoveDescription', {
                org: moveDialog.draggedOrg.name,
                newParent: moveDialog.newParentOrg.name,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmMove}>
              {t('common.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Child Dialog */}
      <Dialog open={addChildDialog?.open || false} onOpenChange={(open) => !open && setAddChildDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('organizations.addChildTo', { name: addChildDialog?.parentOrg.name })}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('common.name')} *</Label>
              <Input
                value={newChildForm.name}
                onChange={(e) => setNewChildForm({ ...newChildForm, name: e.target.value })}
                placeholder={t('organizations.namePlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('organizations.type')}</Label>
              <Select
                value={newChildForm.type}
                onValueChange={(value) => setNewChildForm({ ...newChildForm, type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="holding">{t('organizations.types.holding')}</SelectItem>
                  <SelectItem value="empresa">{t('organizations.types.empresa')}</SelectItem>
                  <SelectItem value="filial">{t('organizations.types.filial')}</SelectItem>
                  <SelectItem value="departamento">{t('organizations.types.departamento')}</SelectItem>
                  <SelectItem value="equipa">{t('organizations.types.equipa')}</SelectItem>
                  <SelectItem value="projeto">{t('organizations.types.projeto')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('common.description')}</Label>
              <Textarea
                value={newChildForm.description}
                onChange={(e) => setNewChildForm({ ...newChildForm, description: e.target.value })}
                placeholder={t('organizations.descriptionPlaceholder')}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddChildDialog(null)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleAddChild} disabled={addingChild || !newChildForm.name.trim()}>
              {addingChild ? t('common.saving') : t('common.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
