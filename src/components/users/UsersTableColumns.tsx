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
import { useTranslation } from "@/hooks/useTranslation";

export interface UserColumnConfig {
  id: string;
  key: string;
  label: string;
  visible: boolean;
  order: number;
}

interface UsersTableColumnsProps {
  onColumnsChange: (columns: UserColumnConfig[]) => void;
}

const STORAGE_KEY = "users_table_columns";

export function UsersTableColumns({ onColumnsChange }: UsersTableColumnsProps) {
  const { t } = useTranslation();
  const [columns, setColumns] = useState<UserColumnConfig[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [draggedItem, setDraggedItem] = useState<number | null>(null);

  const getDefaultColumns = (): UserColumnConfig[] => [
    { id: "name", key: "name", label: t("common.name"), visible: true, order: 0 },
    { id: "email", key: "email", label: t("common.email"), visible: true, order: 1 },
    { id: "phone", key: "phone", label: t("common.phone"), visible: true, order: 2 },
    { id: "status", key: "status", label: t("common.status"), visible: true, order: 3 },
    { id: "position", key: "position", label: t("users.position"), visible: false, order: 4 },
    { id: "location", key: "location", label: t("users.locationMain"), visible: false, order: 5 },
    { id: "organizations", key: "organizations", label: t("users.organizations"), visible: true, order: 6 },
    { id: "created_at", key: "created_at", label: t("common.createdAt"), visible: false, order: 7 },
  ];

  useEffect(() => {
    loadColumns();
  }, []);

  const loadColumns = () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Update labels with current translations
        const defaultCols = getDefaultColumns();
        const mergedColumns = parsed.map((col: UserColumnConfig) => {
          const defaultCol = defaultCols.find(d => d.id === col.id);
          return {
            ...col,
            label: defaultCol?.label || col.label
          };
        });
        setColumns(mergedColumns);
        onColumnsChange(mergedColumns.filter((c: UserColumnConfig) => c.visible));
      } catch {
        initializeDefaultColumns();
      }
    } else {
      initializeDefaultColumns();
    }
  };

  const initializeDefaultColumns = () => {
    const defaultColumns = getDefaultColumns();
    setColumns(defaultColumns);
    onColumnsChange(defaultColumns.filter(c => c.visible));
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
      return newCols.map((col, i) => ({ ...col, order: i }));
    });
    setDraggedItem(index);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
  };

  const saveColumns = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(columns));
    onColumnsChange(columns.filter(c => c.visible));
    toast.success(t("common.saved"));
    setShowDialog(false);
  };

  const resetToDefault = () => {
    localStorage.removeItem(STORAGE_KEY);
    initializeDefaultColumns();
    toast.success(t("common.reset"));
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
        {t("common.columns")}
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              {t("common.customizeColumns")}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-1 max-h-[400px] overflow-y-auto">
            <p className="text-sm text-muted-foreground mb-3">
              {t("common.dragToReorder")}
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
              </div>
            ))}
          </div>

          <DialogFooter className="flex justify-between sm:justify-between">
            <Button variant="ghost" size="sm" onClick={resetToDefault}>
              <RotateCcw className="h-4 w-4 mr-2" />
              {t("common.reset")}
            </Button>
            <Button onClick={saveColumns}>
              <Save className="h-4 w-4 mr-2" />
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
