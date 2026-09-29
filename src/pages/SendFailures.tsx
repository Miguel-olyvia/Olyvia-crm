import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Mail, MessageSquare, RotateCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { useToast } from "@/hooks/use-toast";
import { usePermissionScope, applyScopeFilter } from "@/hooks/usePermissionScope";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

// Regra 11: as duas fontes tem a mesma forma essencial (para/quando/erro),
// unificadas aqui num so tipo para a lista mostrar as duas juntas ordenadas
// por data.
interface FailureRow {
  id: string;
  kind: "email" | "sms";
  to: string;
  errorMessage: string | null;
  createdAt: string;
  entityId: string | null;
  createdBy: string | null; // mapeado para o campo que applyScopeFilter espera
}

export default function SendFailures() {
  const { activeCompany } = useCompany();
  const { toast } = useToast();
  const { getPermissionScope, anewUserId, teamMemberIds, loading: scopeLoading } = usePermissionScope();
  const [rows, setRows] = useState<FailureRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeCompany) return;
    setLoading(true);
    try {
      const [{ data: emailRows }, { data: smsRows }] = await Promise.all([
        supabase
          .from("email_logs")
          .select("id, to_email, error_message, created_at, entity_id, user_id")
          .eq("organization_id", activeCompany.id)
          .eq("status", "failed")
          .order("created_at", { ascending: false })
          .limit(200),
        supabase
          .from("sms_logs")
          .select("id, to_phone, error_message, created_at, entity_id, created_by")
          .eq("organization_id", activeCompany.id)
          .eq("status", "failed")
          .order("created_at", { ascending: false })
          .limit(200),
      ]);

      const merged: FailureRow[] = [
        ...(emailRows || []).map((r): FailureRow => ({
          id: r.id, kind: "email", to: r.to_email || "-", errorMessage: r.error_message,
          createdAt: r.created_at, entityId: r.entity_id, createdBy: r.user_id,
        })),
        ...(smsRows || []).map((r): FailureRow => ({
          id: r.id, kind: "sms", to: r.to_phone || "-", errorMessage: r.error_message,
          createdAt: r.created_at, entityId: r.entity_id, createdBy: r.created_by,
        })),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      setRows(merged);
    } catch (err) {
      console.error("[SendFailures] load failed:", err);
      toast({ title: "Não foi possível carregar as falhas de envio", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [activeCompany, toast]);

  useEffect(() => { load(); }, [load]);

  const scope = getPermissionScope("scheduling.items.view");
  const scopedRows = applyScopeFilter(
    rows.map(r => ({ ...r, created_by: r.createdBy })),
    scope, anewUserId, null, teamMemberIds,
  );

  const handleResend = async (row: FailureRow) => {
    setResendingId(row.id);
    try {
      const { data, error } = await supabase.functions.invoke("resend-failed-send", {
        body: { type: row.kind, log_id: row.id },
      });
      if (error || data?.error) {
        toast({ title: "Não foi possível reenviar", description: data?.error || error?.message, variant: "destructive" });
        return;
      }
      toast({ title: row.kind === "email" ? "Email reenviado" : "SMS reenviado" });
      await load();
    } catch (err) {
      toast({ title: "Não foi possível reenviar", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    } finally {
      setResendingId(null);
    }
  };

  if (scopeLoading || loading) {
    return <div className="p-6 text-sm text-muted-foreground">A carregar...</div>;
  }

  return (
    <div className="p-6 space-y-4 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          Falhas de envio
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          SMS e emails que não chegaram — confirmações, lembretes e avisos de agendamento.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {scopedRows.length} {scopedRows.length === 1 ? "falha" : "falhas"}
          </CardTitle>
          <CardDescription>
            {scope === "OWNED" && "A mostrar só as falhas das tuas próprias leads/visitas."}
            {scope === "TEAM" && "A mostrar as falhas da tua equipa."}
            {scope === "ORG" && "A mostrar todas as falhas da organização."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {scopedRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Sem falhas de envio.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Destinatário</TableHead>
                  <TableHead>Erro</TableHead>
                  <TableHead>Quando</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scopedRows.map((row) => (
                  <TableRow key={`${row.kind}-${row.id}`}>
                    <TableCell>
                      <Badge variant="outline" className="gap-1">
                        {row.kind === "email" ? <Mail className="h-3 w-3" /> : <MessageSquare className="h-3 w-3" />}
                        {row.kind === "email" ? "Email" : "SMS"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{row.to}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate" title={row.errorMessage || ""}>
                      {row.errorMessage || "-"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(row.createdAt), "dd MMM, HH:mm", { locale: pt })}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={resendingId === row.id}
                        onClick={() => handleResend(row)}
                      >
                        <RotateCw className={`h-3.5 w-3.5 mr-1.5 ${resendingId === row.id ? "animate-spin" : ""}`} />
                        Reenviar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
