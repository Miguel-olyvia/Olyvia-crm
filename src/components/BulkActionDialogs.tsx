import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "@/hooks/useTranslation";

interface Company {
  id: string;
  name: string;
}

interface BulkStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  status: string;
  onStatusChange: (status: string) => void;
  onConfirm: () => void;
  processing?: boolean;
  statusOptions?: { value: string; label: string }[];
}

interface BulkDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  onConfirm: () => void;
  processing?: boolean;
}

interface BulkOrgDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCount: number;
  companyId: string;
  onCompanyChange: (companyId: string) => void;
  onConfirm: () => void;
  companies: Company[];
  processing?: boolean;
}

export function BulkStatusDialog({
  open,
  onOpenChange,
  selectedCount,
  status,
  onStatusChange,
  onConfirm,
  processing = false,
  statusOptions,
}: BulkStatusDialogProps) {
  const { t } = useTranslation();

  const defaultOptions = [
    { value: "active", label: t('common.active') },
    { value: "inactive", label: t('common.inactive') },
  ];

  const options = statusOptions || defaultOptions;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('common.changeStatus')}</DialogTitle>
          <DialogDescription>
            {t('common.changeStatusDesc', { count: selectedCount })}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Label htmlFor="bulk-status">{t('common.newStatus')}</Label>
          <Select value={status} onValueChange={onStatusChange}>
            <SelectTrigger className="mt-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={processing}>
            {t('common.cancel')}
          </Button>
          <Button onClick={onConfirm} disabled={processing}>
            {processing ? t('common.processing') : t('common.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BulkDeleteDialog({
  open,
  onOpenChange,
  selectedCount,
  onConfirm,
  processing = false,
}: BulkDeleteDialogProps) {
  const { t } = useTranslation();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('common.confirmDelete')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('common.confirmDeleteDesc', { count: selectedCount })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={processing}>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction 
            onClick={onConfirm} 
            disabled={processing}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {processing ? t('common.processing') : t('common.delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function BulkOrgDialog({
  open,
  onOpenChange,
  selectedCount,
  companyId,
  onCompanyChange,
  onConfirm,
  companies,
  processing = false,
}: BulkOrgDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('common.changeOrg')}</DialogTitle>
          <DialogDescription>
            {t('common.changeOrgDesc', { count: selectedCount })}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Label htmlFor="bulk-company">{t('common.newCompany')}</Label>
          <Select value={companyId} onValueChange={onCompanyChange}>
            <SelectTrigger className="mt-2">
              <SelectValue placeholder={t('common.selectCompany')} />
            </SelectTrigger>
            <SelectContent>
              {companies.map((company) => (
                <SelectItem key={company.id} value={company.id}>
                  {company.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={processing}>
            {t('common.cancel')}
          </Button>
          <Button onClick={onConfirm} disabled={processing || !companyId}>
            {processing ? t('common.processing') : t('common.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
