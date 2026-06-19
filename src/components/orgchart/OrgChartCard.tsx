import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { 
  Plus, 
  Edit, 
  Trash2, 
  ExternalLink, 
  MoreVertical,
  GripVertical,
  Globe,
  Building2,
  Building,
  Briefcase,
  Users,
  ChevronDown,
  ChevronRight,
  GitBranch,
  UsersRound,
  FolderKanban,
  Link2,
} from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

export interface OrgChartColors {
  bg: string;
  border: string;
  text: string;
}

export type OrgType = 'holding' | 'empresa' | 'filial' | 'departamento' | 'equipa' | 'divisao' | 'projeto';

export interface OrgChartCardProps {
  id: string;
  orgType: OrgType;
  name: string;
  isDraggable?: boolean;
  isDropTarget?: boolean;
  childrenCount?: number;
  memberCount?: number;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onAdd?: () => void;
  onEdit?: () => void;
  onRemove?: () => void;
  onViewDetails?: () => void;
  onViewPeople?: () => void;
  onManageAssociations?: () => void;
  canAdd?: boolean;
  canEdit?: boolean;
  canRemove?: boolean;
}

const iconMap: Record<OrgType, any> = {
  holding: Globe,
  empresa: Building2,
  filial: GitBranch,
  departamento: Building,
  equipa: UsersRound,
  divisao: Briefcase,
  projeto: FolderKanban,
};

const colorMap: Record<OrgType, OrgChartColors> = {
  holding: { bg: '#f3e8ff', border: '#a855f7', text: '#6b21a8' },
  empresa: { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' },
  filial: { bg: '#cffafe', border: '#06b6d4', text: '#155e75' },
  departamento: { bg: '#dcfce7', border: '#22c55e', text: '#166534' },
  equipa: { bg: '#fef9c3', border: '#eab308', text: '#713f12' },
  divisao: { bg: '#fed7aa', border: '#f97316', text: '#9a3412' },
  projeto: { bg: '#fce7f3', border: '#ec4899', text: '#9d174d' },
};

const typeLabels: Record<string, Record<OrgType, string>> = {
  pt: { holding: 'Holding', empresa: 'Empresa', filial: 'Filial', departamento: 'Departamento', equipa: 'Equipa', divisao: 'Divisão', projeto: 'Projeto' },
  en: { holding: 'Holding', empresa: 'Company', filial: 'Branch', departamento: 'Department', equipa: 'Team', divisao: 'Division', projeto: 'Project' },
  es: { holding: 'Holding', empresa: 'Empresa', filial: 'Filial', departamento: 'Departamento', equipa: 'Equipo', divisao: 'División', projeto: 'Proyecto' },
  fr: { holding: 'Holding', empresa: 'Entreprise', filial: 'Filiale', departamento: 'Département', equipa: 'Équipe', divisao: 'Division', projeto: 'Projet' },
  de: { holding: 'Holding', empresa: 'Unternehmen', filial: 'Filiale', departamento: 'Abteilung', equipa: 'Team', divisao: 'Abteilung', projeto: 'Projekt' },
};

export function getOrgTypeColors(orgType: OrgType): OrgChartColors {
  return colorMap[orgType] || colorMap.empresa;
}

export function getOrgTypeLabel(orgType: OrgType, lang: string): string {
  const labels = typeLabels[lang] || typeLabels.pt;
  return labels[orgType] || orgType;
}

export function OrgChartCard({
  id,
  orgType,
  name,
  isDraggable: draggable = false,
  isDropTarget = true,
  childrenCount = 0,
  memberCount,
  isCollapsed = false,
  onToggleCollapse,
  onAdd,
  onEdit,
  onRemove,
  onViewDetails,
  onViewPeople,
  onManageAssociations,
  canAdd = true,
  canEdit = true,
  canRemove = true,
}: OrgChartCardProps) {
  const { t, language } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  
  const Icon = iconMap[orgType] || Building2;
  const colors = getOrgTypeColors(orgType);
  const typeLabel = getOrgTypeLabel(orgType, language);

  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    transform,
    isDragging,
  } = useDraggable({ id, disabled: !draggable, data: { name, orgType } });

  const {
    setNodeRef: setDropRef,
    isOver,
  } = useDroppable({ id, disabled: !isDropTarget, data: { name, orgType } });

  const dragStyle = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    zIndex: 1000,
  } : undefined;

  const hasActions = onAdd || onEdit || onRemove || onViewDetails || onViewPeople;

  const setRefs = (node: HTMLElement | null) => {
    setDragRef(node);
    setDropRef(node);
  };

  const isRoot = orgType === 'holding';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div
        ref={setRefs}
        style={dragStyle}
        className={cn("relative group", isDragging && "opacity-40 scale-95")}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
      <div 
        className={cn(
          "rounded-xl border-2 transition-all duration-200 cursor-default select-none relative overflow-hidden",
          isRoot ? "min-w-[260px] max-w-[300px]" : "min-w-[200px] max-w-[240px]",
          isOver && "ring-2 ring-primary shadow-2xl scale-105 border-dashed",
          !isOver && isHovered && "shadow-lg",
          !isOver && !isHovered && "shadow-sm",
        )}
        style={{
          backgroundColor: isOver ? `${colors.border}22` : colors.bg,
          borderColor: isOver ? colors.text : colors.border,
        }}
      >
        {/* Accent strip at top */}
        <div className="h-1.5 w-full" style={{ backgroundColor: colors.border }} />

        {/* Drag Handle */}
        {draggable && (isHovered || isDragging) && (
          <div
            {...attributes}
            {...listeners}
            className="absolute left-1.5 top-4 cursor-grab active:cursor-grabbing p-1 rounded-md hover:bg-black/10 transition-colors z-10"
          >
            <GripVertical className="h-4 w-4" style={{ color: colors.text }} />
          </div>
        )}

        {/* Actions Menu */}
        {hasActions && (isHovered || menuOpen) && !isDragging && (
          <div className="absolute right-1.5 top-4 z-10">
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6 hover:bg-black/10 rounded-md"
                >
                  <MoreVertical className="h-4 w-4" style={{ color: colors.text }} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="z-50">
                {onViewDetails && (
                  <DropdownMenuItem onClick={onViewDetails}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    {t('common.viewDetails')}
                  </DropdownMenuItem>
                )}
                {onViewPeople && (
                  <DropdownMenuItem onClick={onViewPeople}>
                    <Users className="mr-2 h-4 w-4" />
                    {t('orgChart.viewPeople')}
                  </DropdownMenuItem>
                )}
                {onManageAssociations && (
                  <DropdownMenuItem onClick={onManageAssociations}>
                    <Link2 className="mr-2 h-4 w-4" />
                    {t('orgChart.crossAssociations')}
                  </DropdownMenuItem>
                )}
                {canEdit && onEdit && (
                  <DropdownMenuItem onClick={onEdit}>
                    <Edit className="mr-2 h-4 w-4" />
                    {t('common.edit')}
                  </DropdownMenuItem>
                )}
                {canAdd && onAdd && (
                  <>
                    {(onViewDetails || onEdit) && <DropdownMenuSeparator />}
                    <DropdownMenuItem onClick={onAdd}>
                      <Plus className="mr-2 h-4 w-4" />
                      {t('orgChart.addChild')}
                    </DropdownMenuItem>
                  </>
                )}
                {canRemove && onRemove && !isRoot && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={onRemove} className="text-destructive">
                      <Trash2 className="mr-2 h-4 w-4" />
                      {t('orgChart.removeFromChart')}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Content */}
        <div className={cn("px-4 pt-3 pb-3", isRoot ? "py-4" : "py-3")}>
          {/* Icon + Type Badge */}
          <div className="flex items-center gap-2 mb-2">
            <div 
              className="flex items-center justify-center rounded-lg p-1.5"
              style={{ backgroundColor: `${colors.border}25` }}
            >
              <Icon className={cn(isRoot ? "h-5 w-5" : "h-4 w-4")} style={{ color: colors.border }} />
            </div>
            <span 
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: colors.border }}
            >
              {typeLabel}
            </span>
          </div>

          {/* Name */}
          <h4 
            className={cn(
              "font-bold leading-tight line-clamp-2 mb-2",
              isRoot ? "text-base" : "text-sm"
            )}
            style={{ color: colors.text }}
          >
            {name}
          </h4>

          {/* Stats row */}
          <div className="flex items-center gap-3">
            {memberCount !== undefined && (
              <button
                onClick={onViewPeople}
                className="flex items-center gap-1 text-[11px] font-medium rounded-full px-2 py-0.5 hover:opacity-80 transition-opacity"
                style={{ backgroundColor: `${colors.border}18`, color: colors.text }}
              >
                <Users className="h-3 w-3" />
                {memberCount}
              </button>
            )}
            {childrenCount > 0 && onToggleCollapse && (
              <button
                onClick={onToggleCollapse}
                className="flex items-center gap-1 text-[11px] font-medium rounded-full px-2 py-0.5 hover:opacity-80 transition-opacity"
                style={{ backgroundColor: `${colors.border}18`, color: colors.text }}
              >
                {isCollapsed ? (
                  <ChevronRight className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                {childrenCount}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Quick Add Button */}
      {canAdd && onAdd && isHovered && !isDragging && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                className="absolute -bottom-3 left-1/2 -translate-x-1/2 h-6 w-6 rounded-full shadow-lg z-10 border-2 border-background"
                style={{ backgroundColor: colors.border, color: '#fff' }}
                onClick={onAdd}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t('orgChart.addChild')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* Drop indicator */}
      {isOver && (
        <div className="absolute inset-0 rounded-xl border-2 border-dashed border-primary animate-pulse pointer-events-none" />
      )}
      </div>
    </motion.div>
  );
}
