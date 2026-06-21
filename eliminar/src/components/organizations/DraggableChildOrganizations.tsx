import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, Pencil, Trash2, GripVertical } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Organization {
  id: string;
  name: string;
  type: string;
  description: string | null;
  status: string;
}

interface HierarchyItem {
  id: string;
  parent_org_id: string;
  child_org_id: string;
  child?: Organization;
}

interface DraggableChildOrganizationsProps {
  children: HierarchyItem[];
  onReorder: (reorderedChildren: HierarchyItem[]) => void;
  onEdit: (org: Organization) => void;
  onRemove: (hierarchyId: string) => void;
}

interface SortableChildItemProps {
  item: HierarchyItem;
  onEdit: (org: Organization) => void;
  onRemove: (hierarchyId: string) => void;
}

function SortableChildItem({ item, onEdit, onRemove }: SortableChildItemProps) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between p-4 border rounded-lg bg-background ${
        isDragging ? 'shadow-lg ring-2 ring-primary' : ''
      }`}
    >
      <div className="flex items-center gap-3">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-muted transition-colors touch-none"
          aria-label="Drag to reorder"
        >
          <GripVertical className="w-4 h-4 text-muted-foreground" />
        </button>
        <ChevronRight className="w-5 h-5 text-muted-foreground" />
        <div>
          <p className="font-medium">{item.child?.name}</p>
          <Badge variant="outline" className="mt-1">
            {t(`organizations.types.${item.child?.type}`) || item.child?.type}
          </Badge>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => item.child && onEdit(item.child)}
          className="text-muted-foreground hover:text-foreground"
        >
          <Pencil className="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onRemove(item.id)}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

export function DraggableChildOrganizations({
  children,
  onReorder,
  onEdit,
  onRemove,
}: DraggableChildOrganizationsProps) {
  const { t } = useTranslation();
  
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
      const oldIndex = children.findIndex((item) => item.id === active.id);
      const newIndex = children.findIndex((item) => item.id === over.id);
      const reordered = arrayMove(children, oldIndex, newIndex);
      onReorder(reordered);
    }
  };

  if (children.length === 0) {
    return (
      <p className="text-muted-foreground text-center py-4 border rounded-lg">
        {t("organizations.noChildren")}
      </p>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={children.map(c => c.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {children.map((item) => (
            <SortableChildItem
              key={item.id}
              item={item}
              onEdit={onEdit}
              onRemove={onRemove}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
