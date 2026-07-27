import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ShieldAlert, X } from "lucide-react";
import { differenceInMinutes, parseISO } from "date-fns";

interface ActiveAccessEntry {
  id: string;
  target_org_id: string;
  expires_at: string;
  organization_name: string | null;
}

function formatTimeRemaining(expiresAt: string): string {
  const now = new Date();
  const expiry = parseISO(expiresAt);
  const totalMinutes = differenceInMinutes(expiry, now);
  if (totalMinutes <= 0) return "expirado";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

export function SupportAccessBanner() {
  const { isSystemAdmin } = usePermissions();
  const queryClient = useQueryClient();

  const { data: activeAccess } = useQuery<ActiveAccessEntry | null>({
    queryKey: ["support_access_active"],
    queryFn: async () => {
      const now = new Date().toISOString();
      const { data, error } = await (supabase as any)
        .from("support_access_log")
        .select("id, target_org_id, expires_at, anew_organizations(name)")
        .eq("status", "approved")
        .gt("expires_at", now)
        .order("expires_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id,
        target_org_id: data.target_org_id,
        expires_at: data.expires_at,
        organization_name: data.anew_organizations?.name ?? null,
      } as ActiveAccessEntry;
    },
    enabled: isSystemAdmin,
    refetchInterval: 60_000,
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
      toast.success("Acesso de suporte revogado.");
      queryClient.invalidateQueries({ queryKey: ["support_access_active"] });
      queryClient.invalidateQueries({ queryKey: ["support_access_requests"] });
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Erro ao revogar acesso.";
      toast.error(message);
    },
  });

  if (!isSystemAdmin || !activeAccess) return null;

  const orgLabel = activeAccess.organization_name ?? activeAccess.target_org_id;
  const timeLabel = formatTimeRemaining(activeAccess.expires_at);

  return (
    <div
      role="alert"
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-between gap-4 bg-destructive px-4 py-2 text-destructive-foreground text-sm"
    >
      <div className="flex items-center gap-2 min-w-0">
        <ShieldAlert className="h-4 w-4 shrink-0" />
        <span className="truncate">
          Acesso de suporte activo &mdash; <strong>{orgLabel}</strong> &mdash; expira em{" "}
          <strong>{timeLabel}</strong>
        </span>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0 border-destructive-foreground/40 bg-transparent text-destructive-foreground hover:bg-destructive-foreground/10"
        onClick={() => revokeMutation.mutate(activeAccess.id)}
        disabled={revokeMutation.isPending}
      >
        <X className="mr-1.5 h-3.5 w-3.5" />
        Revogar
      </Button>
    </div>
  );
}
