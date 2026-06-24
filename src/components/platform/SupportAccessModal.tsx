import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, ShieldAlert } from "lucide-react";

interface Organization {
  id: string;
  name: string;
}

type Duration = "1" | "2" | "4" | "8";

const DURATION_OPTIONS: { value: Duration; label: string }[] = [
  { value: "1", label: "1 hora" },
  { value: "2", label: "2 horas" },
  { value: "4", label: "4 horas" },
  { value: "8", label: "8 horas" },
];

interface SupportAccessModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SupportAccessModal({ open, onOpenChange }: SupportAccessModalProps) {
  const { isSystemAdmin } = usePermissions();
  const queryClient = useQueryClient();

  const [orgId, setOrgId] = useState("");
  const [reason, setReason] = useState("");
  const [duration, setDuration] = useState<Duration>("1");

  const { data: organizations = [], isLoading: orgsLoading } = useQuery<Organization[]>({
    queryKey: ["support_access_organizations"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("anew_organizations")
        .select("id, name")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Organization[];
    },
    enabled: open && isSystemAdmin,
  });

  const requestMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("request-support-access", {
        body: {
          org_id: orgId,
          reason: reason.trim(),
          duration_hours: parseInt(duration, 10),
        },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Pedido de acesso enviado com sucesso.");
      queryClient.invalidateQueries({ queryKey: ["support_access_requests"] });
      handleClose();
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Erro ao enviar pedido de acesso.";
      toast.error(message);
    },
  });

  function handleClose() {
    setOrgId("");
    setReason("");
    setDuration("1");
    onOpenChange(false);
  }

  function handleSubmit() {
    if (!orgId) {
      toast.error("Seleccione uma organização.");
      return;
    }
    if (reason.trim().length < 10) {
      toast.error("O motivo deve ter pelo menos 10 caracteres.");
      return;
    }
    requestMutation.mutate();
  }

  if (!isSystemAdmin) return null;

  const isReasonValid = reason.trim().length >= 10;
  const canSubmit = !!orgId && isReasonValid && !requestMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!requestMutation.isPending) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            <DialogTitle>Pedir Acesso de Suporte</DialogTitle>
          </div>
          <DialogDescription>
            Este pedido ficará registado na auditoria e requer aprovação de um administrador da organização.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="support-org">Organização</Label>
            <Select value={orgId} onValueChange={setOrgId} disabled={orgsLoading || requestMutation.isPending}>
              <SelectTrigger id="support-org">
                <SelectValue placeholder={orgsLoading ? "A carregar…" : "Seleccione uma organização"} />
              </SelectTrigger>
              <SelectContent>
                {organizations.map((org) => (
                  <SelectItem key={org.id} value={org.id}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="support-reason">Motivo</Label>
            <Textarea
              id="support-reason"
              placeholder="Descreva o motivo do acesso (mín. 10 caracteres)…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={requestMutation.isPending}
              rows={3}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground text-right">
              {reason.trim().length} / 10 mín.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="support-duration">Duração</Label>
            <Select
              value={duration}
              onValueChange={(v) => setDuration(v as Duration)}
              disabled={requestMutation.isPending}
            >
              <SelectTrigger id="support-duration">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={requestMutation.isPending}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {requestMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Pedir Acesso
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
