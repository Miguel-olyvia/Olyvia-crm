import { CheckSquare, Trash2, Building2, XSquare, DollarSign, Tag, FolderTree, Layers, Truck, Package, Ruler } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PermissionGate } from "@/components/PermissionGate";
import { useTranslation } from "@/hooks/useTranslation";

interface BulkActionsBarProps {
  selectedCount: number;
  onStatusClick: () => void;
  onDeleteClick: () => void;
  onOrgClick?: () => void;
  onClearSelection: () => void;
  showOrgAction?: boolean;
  statusPermission?: string;
  deletePermission?: string;
  // New props for products bulk actions
  onBulkPriceClick?: () => void;
  onBulkAttributesClick?: () => void;
  showBulkPrice?: boolean;
  showBulkAttributes?: boolean;
  // New props for category, subcategory, supplier
  onBulkCategoryClick?: () => void;
  onBulkSubcategoryClick?: () => void;
  onBulkSupplierClick?: () => void;
  showBulkCategory?: boolean;
  showBulkSubcategory?: boolean;
  showBulkSupplier?: boolean;
  // Product type
  onBulkProductTypeClick?: () => void;
  showBulkProductType?: boolean;
  // Unit of Measure
  onBulkUomClick?: () => void;
  showBulkUom?: boolean;
}

export function BulkActionsBar({
  selectedCount,
  onStatusClick,
  onDeleteClick,
  onOrgClick,
  onClearSelection,
  showOrgAction = true,
  statusPermission = "edit",
  deletePermission = "delete",
  onBulkPriceClick,
  onBulkAttributesClick,
  showBulkPrice = false,
  showBulkAttributes = false,
  onBulkCategoryClick,
  onBulkSubcategoryClick,
  onBulkSupplierClick,
  showBulkCategory = false,
  showBulkSubcategory = false,
  showBulkSupplier = false,
  onBulkProductTypeClick,
  showBulkProductType = false,
  onBulkUomClick,
  showBulkUom = false,
}: BulkActionsBarProps) {
  const { t } = useTranslation();

  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center justify-between p-3 bg-muted rounded-lg mb-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium">
          {t('common.selectedCount', { count: selectedCount })}
        </span>
        <PermissionGate permission={statusPermission}>
          <Button
            variant="outline"
            size="sm"
            onClick={onStatusClick}
          >
            <CheckSquare className="h-4 w-4 mr-2" />
            {t('common.changeStatus')}
          </Button>
        </PermissionGate>
        {showOrgAction && onOrgClick && (
          <Button
            variant="outline"
            size="sm"
            onClick={onOrgClick}
          >
            <Building2 className="h-4 w-4 mr-2" />
            {t('common.changeOrg')}
          </Button>
        )}
        {showBulkCategory && onBulkCategoryClick && (
          <PermissionGate permission={statusPermission}>
            <Button
              variant="outline"
              size="sm"
              onClick={onBulkCategoryClick}
            >
              <FolderTree className="h-4 w-4 mr-2" />
              {t('common.bulkCategory') || 'Alterar Categoria'}
            </Button>
          </PermissionGate>
        )}
        {showBulkSubcategory && onBulkSubcategoryClick && (
          <PermissionGate permission={statusPermission}>
            <Button
              variant="outline"
              size="sm"
              onClick={onBulkSubcategoryClick}
            >
              <Layers className="h-4 w-4 mr-2" />
              {t('common.bulkSubcategory') || 'Alterar Subcategoria'}
            </Button>
          </PermissionGate>
        )}
        {showBulkSupplier && onBulkSupplierClick && (
          <PermissionGate permission={statusPermission}>
            <Button
              variant="outline"
              size="sm"
              onClick={onBulkSupplierClick}
            >
              <Truck className="h-4 w-4 mr-2" />
              {t('common.bulkSupplier') || 'Alterar Fornecedor'}
            </Button>
          </PermissionGate>
        )}
        {showBulkProductType && onBulkProductTypeClick && (
          <PermissionGate permission={statusPermission}>
            <Button
              variant="outline"
              size="sm"
              onClick={onBulkProductTypeClick}
            >
              <Package className="h-4 w-4 mr-2" />
              {t('common.bulkProductType') || 'Alterar Tipo'}
            </Button>
          </PermissionGate>
        )}
        {showBulkPrice && onBulkPriceClick && (
          <PermissionGate permission={statusPermission}>
            <Button
              variant="outline"
              size="sm"
              onClick={onBulkPriceClick}
            >
              <DollarSign className="h-4 w-4 mr-2" />
              {t('common.bulkPrice')}
            </Button>
          </PermissionGate>
        )}
        {showBulkUom && onBulkUomClick && (
          <PermissionGate permission={statusPermission}>
            <Button
              variant="outline"
              size="sm"
              onClick={onBulkUomClick}
            >
              <Ruler className="h-4 w-4 mr-2" />
              {t('common.bulkUom') || 'Alterar Unidade'}
            </Button>
          </PermissionGate>
        )}
        {showBulkAttributes && onBulkAttributesClick && (
          <PermissionGate permission={statusPermission}>
            <Button
              variant="outline"
              size="sm"
              onClick={onBulkAttributesClick}
            >
              <Tag className="h-4 w-4 mr-2" />
              {t('common.bulkAttributes')}
            </Button>
          </PermissionGate>
        )}
        <PermissionGate permission={deletePermission}>
          <Button
            variant="destructive"
            size="sm"
            onClick={onDeleteClick}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {t('common.delete')}
          </Button>
        </PermissionGate>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onClearSelection}
      >
        <XSquare className="h-4 w-4 mr-2" />
        {t('common.clearSelection')}
      </Button>
    </div>
  );
}
