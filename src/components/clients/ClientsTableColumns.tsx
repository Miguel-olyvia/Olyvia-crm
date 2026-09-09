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
import { Settings2, RotateCcw, Save } from "lucide-react";
import { toast } from "@/lib/toast";

export interface ClientColumnConfig {
  id: string;
  key: string;
  label: string;
  visible: boolean;
}

// Ordem fixa = ordem de exibição na tabela. Todas visíveis por omissão,
// tal como a tabela já mostra hoje (mais "origin", nova).
export const DEFAULT_CLIENT_COLUMNS: ClientColumnConfig[] = [
  { id: "health", key: "health", label: "Saúde", visible: true },
  { id: "avatar", key: "avatar", label: "Avatar", visible: true },
  { id: "client", key: "client", label: "Cliente", visible: true },
  { id: "contracts", key: "contracts", label: "Contratos", visible: true },
  { id: "value", key: "value", label: "Valor Total", visible: true },
  { id: "tags", key: "tags", label: "Tags", visible: true },
  { id: "nif", key: "nif", label: "NIF", visible: true },
  { id: "assigned_to", key: "assigned_to", label: "Comercial", visible: true },
  { id: "last_contact", key: "last_contact", label: "Último Contacto", visible: true },
  { id: "sentiment", key: "sentiment", label: "Sentimento", visible: true },
  { id: "client_since", key: "client_since", label: "Cliente Desde", visible: true },
  { id: "origin", key: "origin", label: "Origem", visible: true },
  { id: "status", key: "status", label: "Estado", visible: true },
];

const STORAGE_KEY = "clients_columns_v1";

interface ClientsTableColumnsProps {
  onColumnsChange: (columns: ClientColumnConfig[]) => void;
}

export function ClientsTableColumns({ onColumnsChange }: ClientsTableColumnsProps) {
  const [columns, setColumns] = useState<ClientColumnConfig[]>([]);
  const [showDialog, setShowDialog] = useState(false);

  useEffect(() => {
    loadColumns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadColumns = () => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed: ClientColumnConfig[] = JSON.parse(saved);
        // Merge: garante que colunas novas adicionadas depois (ex.: "origin")
        // aparecem mesmo que o utilizador já tenha uma config antiga gravada.
        const merged = DEFAULT_CLIENT_COLUMNS.map(def => {
          const existing = parsed.find(c => c.key === def.key);
          return existing ? { ...def, visible: existing.visible } : def;
        });
        setColumns(merged);
        onColumnsChange(merged.filter(c => c.visible));
      } catch {
        initializeDefaultColumns();
      }
    } else {
      initializeDefaultColumns();
    }
  };

  const initializeDefaultColumns = () => {
    setColumns(DEFAULT_CLIENT_COLUMNS);
    onColumnsChange(DEFAULT_CLIENT_COLUMNS.filter(c => c.visible));
  };

  const toggleColumn = (columnId: string) => {
    setColumns(prev => prev.map(col => col.id === columnId ? { ...col, visible: !col.visible } : col));
  };

  const saveColumns = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(columns));
    onColumnsChange(columns.filter(c => c.visible));
    toast.success("Configuração de colunas guardada");
    setShowDialog(false);
  };

  const resetToDefault = () => {
    localStorage.removeItem(STORAGE_KEY);
    initializeDefaultColumns();
    toast.success("Colunas restauradas para o padrão");
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setShowDialog(true)} className="flex items-center gap-2">
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
            <p className="text-sm text-muted-foreground mb-3">Selecione as colunas visíveis</p>
            {columns.map((column) => (
              <div key={column.id} className="flex items-center gap-3 p-2 rounded-md border bg-background hover:bg-muted/50 transition-colors">
                <Checkbox id={`col-${column.id}`} checked={column.visible} onCheckedChange={() => toggleColumn(column.id)} />
                <Label htmlFor={`col-${column.id}`} className="flex-1 cursor-pointer text-sm">{column.label}</Label>
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
