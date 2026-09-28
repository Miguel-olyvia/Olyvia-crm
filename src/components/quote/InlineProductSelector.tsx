import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";

interface InlineProductSelectorProps {
  currentDescription: string;
  currentSku: string | null;
  onEditClick: () => void;
  isProduct: boolean;
  supplierSku?: string | null;
}

export function InlineProductSelector({
  currentDescription,
  onEditClick,
  supplierSku,
}: InlineProductSelectorProps) {
  return (
    <div className="flex items-center gap-2 group/desc">
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{currentDescription}</p>
        {supplierSku && (
          <p className="text-xs text-muted-foreground truncate">Ref: {supplierSku}</p>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 opacity-60 hover:opacity-100 transition-opacity flex-shrink-0"
        onClick={onEditClick}
        title="Alterar item"
      >
        <Pencil className="w-3 h-3" />
      </Button>
    </div>
  );
}
