import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useCompany } from "@/contexts/CompanyContext";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldAlert, Check, X } from "lucide-react";
import { format, parseISO, differenceInMinutes } from "date-fns";
import { pt } from "date-fns/locale";

type AccessStatus = "pending" | "approved" | "rejected" | "expired";

interface AccessRequest {
  id: string;
  target_org_id: string;
  organization_name: string | null;
  reason: string;
  status: AccessStatus;
  duration_hours: number;
  expires_at: string | null;
  requested_at: string;
  requested_by_name: string | null;
}

function statusBadge(status: AccessStatus) {
  switch (status) {
    case "pending":
      return <Badge variant="secondary">Pendente</Badge>;
    case "approved":
      return <Badge variant="default" className="bg-green-600 text-white">Aprovado</Badge>;
    case "rejected":
      return <Badge variant="destructive">Rejeitado</Badge>;
    case "expired":
      return <Badge variant="outline">Expirado</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function timeRemainingLabel(expiresAt: string | null): string {
  if (!expiresAt) return "—";
  const now = new Date();
  const expiry = parseISO(expiresAt);
  const minutes = differenceInMinutes(expiry, now);
  if (minutes <= 0) return "Expirado";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}

// Sysadmin view: all own requests across all orgs
function SysadminRequestsTable() {
  const queryClient = useQueryClient();

  const { data: requests = [], isLoading } = useQuery<AccessRequest[]>({
    queryKey: ["support_access_requests"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("support_access_log")
        .select("id, target_org_id, reason, status, duration_hours, expires_at, requested_at, anew_organizations(name)")
        .order("requested_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return ((data ?? []) as any[]).map((row) => ({
        id: row.id,
        target_org_id: row.target_org_id,
        organization_name: row.anew_organizations?.name ?? null,
        reason: row.reason,
        status: row.status as AccessStatus,
        duration_hours: row.duration_hours,
        expires_at: row.expires_at,
        requested_at: row.requested_at,
        requested_by_name: null,
      }));
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (accessId: string) => {
      const { data, error } = await supabase.functions.invoke("approve-support-access", {
        body: { request_id: accessId, action: "rejected" },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Acesso revogado.");
      queryClient.invalidateQueries({ queryKey: ["support_access_requests"] });
      queryClient.invalidateQueries({ queryKey: ["support_access_active"] });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Erro ao revogar acesso.";
      toast.error(message);
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-muted-foreground" />
          <CardTitle>Pedidos de Acesso de Suporte</CardTitle>
        </div>
        <CardDescription>
          Histórico de todos os pedidos de acesso de suporte efectuados.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <ShieldAlert className="h-10 w-10 opacity-40" />
            <p className="text-sm">Nenhum pedido de acesso encontrado.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Organização</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Duração</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Tempo restante</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {format(parseISO(req.requested_at), "dd/MM/yyyy HH:mm", { locale: pt })}
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {req.organization_name ?? req.target_org_id.slice(0, 8) + "…"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                      {req.reason}
                    </TableCell>
                    <TableCell className="text-sm">{req.duration_hours}h</TableCell>
                    <TableCell>{statusBadge(req.status)}</TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {req.status === "approved" && req.expires_at
                        ? timeRemainingLabel(req.expires_at)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {req.status === "approved" && req.expires_at && new Date(req.expires_at) > new Date() && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => revokeMutation.mutate(req.id)}
                          disabled={revokeMutation.isPending}
                        >
                          <X className="mr-1.5 h-3.5 w-3.5" />
                          Revogar
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Super-admin view: pending requests for own org
function SuperAdminRequestsTable() {
  const { activeCompany } = useCompany();
  const queryClient = useQueryClient();

  const { data: requests = [], isLoading } = useQuery<AccessRequest[]>({
    queryKey: ["support_access_pending_org", activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany?.id) return [];
      const { data, error } = await (supabase as any)
        .from("support_access_log")
        .select("id, target_org_id, reason, status, duration_hours, expires_at, requested_at, anew_organizations(name)")
        .eq("target_org_id", activeCompany.id)
        .eq("status", "pending")
        .order("requested_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as any[]).map((row) => ({
        id: row.id,
        target_org_id: row.target_org_id,
        organization_name: row.anew_organizations?.name ?? null,
        reason: row.reason,
        status: row.status as AccessStatus,
        duration_hours: row.duration_hours,
        expires_at: row.expires_at,
        requested_at: row.requested_at,
        requested_by_name: null,
      }));
    },
    enabled: !!activeCompany?.id,
  });

  const actionMutation = useMutation({
    mutationFn: async ({ accessId, action }: { accessId: string; action: "approved" | "rejected" }) => {
      const { data, error } = await supabase.functions.invoke("approve-support-access", {
        body: { request_id: accessId, action },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      const label = variables.action === "approved" ? "aprovado" : "rejeitado";
      toast.success(`Pedido de acesso ${label}.`);
      queryClient.invalidateQueries({ queryKey: ["support_access_pending_org"] });
      queryClient.invalidateQueries({ queryKey: ["support_access_active"] });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Erro ao processar pedido.";
      toast.error(message);
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-muted-foreground" />
          <CardTitle>Pedidos de Acesso Pendentes</CardTitle>
        </div>
        <CardDescription>
          Pedidos de acesso de suporte à sua organização aguardando decisão.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <ShieldAlert className="h-10 w-10 opacity-40" />
            <p className="text-sm">Sem pedidos de acesso pendentes.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Duração pedida</TableHead>
                  <TableHead className="text-right">Acções</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {format(parseISO(req.requested_at), "dd/MM/yyyy HH:mm", { locale: pt })}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-sm truncate">
                      {req.reason}
                    </TableCell>
                    <TableCell className="text-sm">{req.duration_hours}h</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => actionMutation.mutate({ accessId: req.id, action: "rejected" })}
                          disabled={actionMutation.isPending}
                        >
                          <X className="mr-1.5 h-3.5 w-3.5" />
                          Rejeitar
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => actionMutation.mutate({ accessId: req.id, action: "approved" })}
                          disabled={actionMutation.isPending}
                        >
                          <Check className="mr-1.5 h-3.5 w-3.5" />
                          Aprovar
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function SupportAccessRequests() {
  const { isSystemAdmin } = usePermissions();

  if (isSystemAdmin) {
    return <SysadminRequestsTable />;
  }

  return <SuperAdminRequestsTable />;
}
