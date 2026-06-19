import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trash2, X, CheckSquare, ArrowRightCircle, User } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface WorkflowStage {
  id: string;
  name: string;
  label: string;
  color: string;
}

interface ContactResult {
  id: string;
  name: string;
  color: string;
}

interface CompanyUser {
  id: string;
  name: string;
}

interface LeadsBulkActionsProps {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBulkStatusChange: (newStatus: string) => void;
  onBulkContactResultChange: (resultId: string) => void;
  onBulkAssigneeChange: (userId: string) => void;
  onBulkDelete: () => void;
  workflowStages: WorkflowStage[];
  contactResults: ContactResult[];
  companyUsers: CompanyUser[];
  isDeleting?: boolean;
  isUpdating?: boolean;
}

export function LeadsBulkActions({
  selectedCount,
  totalCount,
  onSelectAll,
  onClearSelection,
  onBulkStatusChange,
  onBulkContactResultChange,
  onBulkAssigneeChange,
  onBulkDelete,
  workflowStages,
  contactResults,
  companyUsers,
  isDeleting = false,
  isUpdating = false,
}: LeadsBulkActionsProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="sticky top-0 z-20 bg-primary text-primary-foreground px-4 py-3 rounded-lg shadow-lg mb-4 flex items-center justify-between flex-wrap gap-3">
      <div className="flex items-center gap-3">
        <Badge variant="secondary" className="bg-primary-foreground/20 text-primary-foreground border-0 gap-1.5">
          <CheckSquare className="h-4 w-4" />
          {selectedCount} selecionado{selectedCount !== 1 ? 's' : ''}
        </Badge>
        
        {selectedCount < totalCount && (
          <Button
            variant="ghost"
            size="sm"
            className="text-primary-foreground hover:bg-primary-foreground/10"
            onClick={onSelectAll}
          >
            Selecionar todos ({totalCount})
          </Button>
        )}
        
        <Button
          variant="ghost"
          size="sm"
          className="text-primary-foreground hover:bg-primary-foreground/10"
          onClick={onClearSelection}
        >
          <X className="h-4 w-4 mr-1" />
          Limpar seleção
        </Button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {/* Bulk Status Change */}
        <Select 
          onValueChange={onBulkStatusChange} 
          disabled={isUpdating}
        >
          <SelectTrigger className="w-[160px] h-8 bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground">
            <div className="flex items-center gap-2">
              <ArrowRightCircle className="h-4 w-4" />
              <SelectValue placeholder="Alterar Status" />
            </div>
          </SelectTrigger>
          <SelectContent>
            {workflowStages.map(stage => (
              <SelectItem key={stage.id} value={stage.name}>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color }} />
                  {stage.label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Bulk Contact Result Change */}
        <Select 
          onValueChange={onBulkContactResultChange}
          disabled={isUpdating}
        >
          <SelectTrigger className="w-[180px] h-8 bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground">
            <SelectValue placeholder="Alterar Resultado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="clear">
              <span className="text-muted-foreground">Limpar resultado</span>
            </SelectItem>
            {contactResults.map(result => (
              <SelectItem key={result.id} value={result.id}>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: result.color }} />
                  {result.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Bulk Assignee Change */}
        <Select 
          onValueChange={onBulkAssigneeChange}
          disabled={isUpdating}
        >
          <SelectTrigger className="w-[180px] h-8 bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4" />
              <SelectValue placeholder="Alterar Atribuído" />
            </div>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="clear">
              <span className="text-muted-foreground">Remover atribuição</span>
            </SelectItem>
            {companyUsers.map(user => (
              <SelectItem key={user.id} value={user.id}>
                <div className="flex items-center gap-2">
                  <User className="w-3 h-3" />
                  {user.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Bulk Delete */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="text-primary-foreground hover:bg-destructive hover:text-destructive-foreground"
              disabled={isDeleting}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Eliminar
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar {selectedCount} lead{selectedCount !== 1 ? 's' : ''}?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser revertida. As leads selecionadas serão permanentemente eliminadas.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={onBulkDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
