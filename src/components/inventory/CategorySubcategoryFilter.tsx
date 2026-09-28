import { useTranslation } from "@/hooks/useTranslation";
import { useProductCategories } from "@/hooks/useProductCategories";
import { cn } from "@/lib/utils";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// Filtro Categoria + Subcategoria partilhado pelos ecrãs de inventário (Stocks
// e folha de contagem). Mesmo comportamento de Products.tsx: mudar a categoria
// volta a subcategoria a "all"; com categoria "all" a subcategoria lista todas
// as subcategorias. Os dois valores usam "all" para "sem filtro".
//
// Quem consome o filtro deve usar useProductCategories().resolveFilterIds e
// comparar com `category_id IN ids OR subcategory_id IN ids`: há produtos que
// guardam o id da folha (subcategoria) em category_id (ver AddItemsDialog.tsx).

// Valor da opção "Sem categoria" (products.category_id nulo). Mantém o mesmo
// valor que Stocks.tsx já usava.
export const UNCATEGORIZED_CATEGORY_VALUE = "__uncategorized__";

export interface CategorySubcategoryValue {
  categoryId: string;
  subcategoryId: string;
}

interface CategorySubcategoryFilterProps {
  categoryId: string;
  subcategoryId: string;
  onChange: (value: CategorySubcategoryValue) => void;
  /** Mostra a opção "Sem categoria" (UNCATEGORIZED_CATEGORY_VALUE). */
  includeUncategorized?: boolean;
  /** Classes de cada SelectTrigger (largura/altura da página). */
  triggerClassName?: string;
  disabled?: boolean;
}

export default function CategorySubcategoryFilter({
  categoryId,
  subcategoryId,
  onChange,
  includeUncategorized = false,
  triggerClassName = "w-[200px]",
  disabled = false,
}: CategorySubcategoryFilterProps) {
  const { t } = useTranslation();
  const { topLevelCategories, getSubcategories } = useProductCategories();

  // "Sem categoria" não tem subcategorias — o segundo seletor fica inativo.
  const isUncategorized = categoryId === UNCATEGORIZED_CATEGORY_VALUE;
  const subcategories = isUncategorized ? [] : getSubcategories(categoryId);

  return (
    <>
      <Select
        value={categoryId}
        onValueChange={(value) => onChange({ categoryId: value, subcategoryId: "all" })}
        disabled={disabled}
      >
        <SelectTrigger className={cn(triggerClassName)} aria-label={t('inventory.categoryFilter.category')}>
          <SelectValue placeholder={t('inventory.categoryFilter.category')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('products.allCategories')}</SelectItem>
          {includeUncategorized && (
            <SelectItem value={UNCATEGORIZED_CATEGORY_VALUE}>{t('inventory.categoryFilter.uncategorized')}</SelectItem>
          )}
          {topLevelCategories.map((category) => (
            <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={subcategoryId}
        onValueChange={(value) => onChange({ categoryId, subcategoryId: value })}
        disabled={disabled || isUncategorized}
      >
        <SelectTrigger className={cn(triggerClassName)} aria-label={t('inventory.categoryFilter.subcategory')}>
          <SelectValue placeholder={t('inventory.categoryFilter.subcategory')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('products.allSubcategories')}</SelectItem>
          {subcategories.map((subcategory) => (
            <SelectItem key={subcategory.id} value={subcategory.id}>{subcategory.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
