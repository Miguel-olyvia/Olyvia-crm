import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Settings2, GripVertical, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";

export interface ColumnConfig {
  id: string;
  key: string;
  label: string;
  visible: boolean;
  order: number;
  width?: number;
  isSystem?: boolean; // For system columns like status, created_at, etc.
}

interface LeadsTableColumnsProps {
  campaignId?: string;
  fieldDefinitions: { field_key: string; field_label: string }[];
  onColumnsChange: (columns: ColumnConfig[]) => void;
}

// Default system columns
const DEFAULT_SYSTEM_COLUMNS: ColumnConfig[] = [
  { id: "phone_icon", key: "phone_icon", label: "📞", visible: true, order: 0, isSystem: true },
  { id: "last_contact_at", key: "last_contact_at", label: "Último Contacto", visible: true, order: 1, isSystem: true },
  { id: "campaign", key: "campaign", label: "Campanha", visible: true, order: 2, isSystem: true },
  { id: "name", key: "name", label: "Nome", visible: true, order: 3, isSystem: true },
  { id: "phone", key: "phone", label: "Telefone", visible: true, order: 4, isSystem: true },
  { id: "email", key: "email", label: "Email", visible: true, order: 5, isSystem: true },
  { id: "status", key: "status", label: "Status", visible: true, order: 6, isSystem: true },
  { id: "last_contact_result", key: "last_contact_result", label: "Resultado", visible: true, order: 7, isSystem: true },
  { id: "source", key: "source", label: "Origem", visible: false, order: 8, isSystem: true },
  { id: "created_at", key: "created_at", label: "Criado", visible: true, order: 9, isSystem: true },
];

const STORAGE_KEY_PREFIX = "leads_columns_";

export function LeadsTableColumns({ 
  campaignId, 
  fieldDefinitions, 
  onColumnsChange 
}: LeadsTableColumnsProps) {
  const [columns, setColumns] = useState<ColumnConfig[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [draggedItem, setDraggedItem] = useState<number | null>(null);

  // Load columns from localStorage on mount
  useEffect(() => {
    loadColumns();
  }, [campaignId, fieldDefinitions]);

  const getStorageKey = () => {
    return `${STORAGE_KEY_PREFIX}${campaignId || 'all'}`;
  };

  const loadColumns = () => {
    const storageKey = getStorageKey();
    const saved = localStorage.getItem(storageKey);
    
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Merge with current field definitions to handle new/removed fields
        const mergedColumns = mergeColumnsWithFields(parsed, fieldDefinitions);
        setColumns(mergedColumns);
        onColumnsChange(mergedColumns.filter(c => c.visible));
      } catch {
        initializeDefaultColumns();
      }
    } else {
      initializeDefaultColumns();
    }
  };

  const initializeDefaultColumns = () => {
    // Combine system columns with field definitions
    const allColumns: ColumnConfig[] = [...DEFAULT_SYSTEM_COLUMNS];
    
    // Add field definitions as additional columns
    fieldDefinitions.forEach((field, index) => {
      const existingSystem = allColumns.find(c => 
        c.key === field.field_key || 
        (c.isSystem && (
          (c.key === 'name' && field.field_key.match(/nome|name|full_name/i)) ||
          (c.key === 'phone' && field.field_key.match(/telefone|phone|telemovel|mobile/i)) ||
          (c.key === 'email' && field.field_key.match(/email|e-mail|e_mail/i))
        ))
      );
      
      if (!existingSystem) {
        allColumns.push({
          id: field.field_key,
          key: field.field_key,
          label: field.field_label,
          visible: false, // Hidden by default for extra fields
          order: 100 + index,
          isSystem: false
        });
      }
    });

    setColumns(allColumns);
    onColumnsChange(allColumns.filter(c => c.visible));
  };

  const mergeColumnsWithFields = (savedColumns: ColumnConfig[], fields: { field_key: string; field_label: string }[]): ColumnConfig[] => {
    const result = [...savedColumns];
    
    // Add any new fields that weren't in saved config
    fields.forEach((field, index) => {
      const exists = result.find(c => c.key === field.field_key);
      if (!exists) {
        result.push({
          id: field.field_key,
          key: field.field_key,
          label: field.field_label,
          visible: false,
          order: 100 + index,
          isSystem: false
        });
      }
    });
    
    return result.sort((a, b) => a.order - b.order);
  };

  const toggleColumn = (columnId: string) => {
    setColumns(prev => 
      prev.map(col => 
        col.id === columnId ? { ...col, visible: !col.visible } : col
      )
    );
  };

  const handleDragStart = (index: number) => {
    setDraggedItem(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedItem === null || draggedItem === index) return;
    
    setColumns(prev => {
      const newCols = [...prev];
      const [draggedCol] = newCols.splice(draggedItem, 1);
      newCols.splice(index, 0, draggedCol);
      // Update order
      return newCols.map((col, i) => ({ ...col, order: i }));
    });
    setDraggedItem(index);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
  };

  const saveColumns = () => {
    const storageKey = getStorageKey();
    localStorage.setItem(storageKey, JSON.stringify(columns));
    onColumnsChange(columns.filter(c => c.visible));
    toast.success("Configuração de colunas guardada");
    setShowDialog(false);
  };

  const resetToDefault = () => {
    const storageKey = getStorageKey();
    localStorage.removeItem(storageKey);
    initializeDefaultColumns();
    toast.success("Colunas restauradas para o padrão");
  };

  return (
    <>
      <Button 
        variant="outline" 
        size="sm" 
        onClick={() => setShowDialog(true)}
        className="flex items-center gap-2"
      >
        <Settings2 className="h-4 w-4" />
        Colunas
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              Personalizar Colunas
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-1 max-h-[400px] overflow-y-auto">
            <p className="text-sm text-muted-foreground mb-3">
              Arraste para reordenar e selecione as colunas visíveis
            </p>
            
            {columns.map((column, index) => (
              <div
                key={column.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-3 p-2 rounded-md border bg-background cursor-move transition-colors ${
                  draggedItem === index ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                }`}
              >
                <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                <Checkbox
                  id={`col-${column.id}`}
                  checked={column.visible}
                  onCheckedChange={() => toggleColumn(column.id)}
                />
                <Label 
                  htmlFor={`col-${column.id}`} 
                  className="flex-1 cursor-pointer text-sm"
                >
                  {column.label}
                </Label>
                {column.isSystem && (
                  <span className="text-xs text-muted-foreground">Sistema</span>
                )}
              </div>
            ))}
          </div>

          <DialogFooter className="flex justify-between sm:justify-between">
            <Button variant="ghost" size="sm" onClick={resetToDefault}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Repor Padrão
            </Button>
            <Button onClick={saveColumns}>
              <Save className="h-4 w-4 mr-2" />
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
