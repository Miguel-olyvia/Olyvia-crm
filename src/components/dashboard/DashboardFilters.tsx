import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "@/hooks/useTranslation";

interface FilterOption {
  id: string;
  name: string;
}

interface DashboardFiltersProps {
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
  allLabel?: string;
}

const DashboardFilters = ({
  label,
  options,
  value,
  onChange,
  allLabel,
}: DashboardFiltersProps) => {
  const { t } = useTranslation();
  const defaultAllLabel = allLabel || t('common.all');
  
  if (options.length <= 1) return null;

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">{label}:</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder={defaultAllLabel} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{defaultAllLabel} ({options.length})</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default DashboardFilters;
