import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { FileDown, ShieldAlert } from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

interface ExportAuditEntry {
  id: string;
  auth_user_id: string;
  business_user_id: string | null;
  module: string;
  effective_columns: string[];
  sensitive_columns: string[];
  status: string;
  row_count: number | null;
  created_at: string;
  scope: string;
}

const PAGE_SIZE = 50;

const MODULE_OPTIONS = [
  { value: "all", label: "Todos os módulos" },
  { value: "leads", label: "Leads" },
  { value: "clients", label: "Clientes" },
  { value: "contacts", label: "Contactos" },
  { value: "quotes", label: "Orçamentos" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "Todos os resultados" },
  { value: "completed", label: "Concluído" },
  { value: "denied", label: "Negado" },
  { value: "failed", label: "Falha" },
  { value: "started", label: "Em curso" },
];

function statusBadge(status: string) {
  switch (status) {
    case "completed":
      return <Badge variant="default" className="bg-green-600 text-white">Concluído</Badge>;
    case "denied":
      return <Badge variant="destructive">Negado</Badge>;
    case "failed":
      return <Badge variant="destructive" className="bg-orange-600">Falha</Badge>;
    case "started":
      return <Badge variant="secondary">Em curso</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function moduleLabel(module: string) {
  const map: Record<string, string> = {
    leads: "Leads",
    clients: "Clientes",
    contacts: "Contactos",
    quotes: "Orçamentos",
  };
  return map[module] ?? module;
}

export function ExportAuditLog() {
  const { activeCompany } = useCompany();
  const [moduleFilter, setModuleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: entries = [], isLoading } = useQuery<ExportAuditEntry[]>({
    queryKey: ["data_export_audit", activeCompany?.id, moduleFilter, statusFilter],
    queryFn: async () => {
      if (!activeCompany?.id) return [];

      let query = (supabase as any)
        .from("data_export_audit")
        .select(
          "id, auth_user_id, business_user_id, module, effective_columns, sensitive_columns, status, row_count, created_at, scope"
        )
        .eq("organization_id", activeCompany.id)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      if (moduleFilter !== "all") {
        query = query.eq("module", moduleFilter);
      }
      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as ExportAuditEntry[];
    },
    enabled: !!activeCompany?.id,
  });

  const businessUserIds = useMemo(
    () => [...new Set(entries.map((e) => e.business_user_id).filter((id): id is string => id !== null))],
    [entries]
  );
  const orphanAuthUserIds = useMemo(
    () => [...new Set(entries.filter((e) => !e.business_user_id).map((e) => e.auth_user_id))],
    [entries]
  );

  const { data: usersByBizId = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["anew_users_biz", businessUserIds],
    queryFn: async () => {
      const { data } = await supabase.from("anew_users").select("id, name").in("id", businessUserIds);
      return (data ?? []) as { id: string; name: string }[];
    },
    enabled: businessUserIds.length > 0,
  });

  const { data: usersByAuthId = [] } = useQuery<{ auth_user_id: string; name: string }[]>({
    queryKey: ["anew_users_auth", orphanAuthUserIds],
    queryFn: async () => {
      const { data } = await supabase
        .from("anew_users")
        .select("auth_user_id, name")
        .in("auth_user_id", orphanAuthUserIds);
      return (data ?? []) as { auth_user_id: string; name: string }[];
    },
    enabled: orphanAuthUserIds.length > 0,
  });

  const userNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of usersByBizId) map.set(u.id, u.name);
    for (const u of usersByAuthId) map.set(u.auth_user_id, u.name);
    return map;
  }, [usersByBizId, usersByAuthId]);

  const resolveUserName = (entry: ExportAuditEntry): string => {
    const key = entry.business_user_id ?? entry.auth_user_id;
    return userNameMap.get(key) ?? (key.slice(0, 8) + "…");
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <FileDown className="h-5 w-5 text-muted-foreground" />
          <CardTitle>Histórico de Exportações</CardTitle>
        </div>
        <CardDescription>
          Registo de todas as exportações de dados sensíveis efetuadas na organização.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <Select value={moduleFilter} onValueChange={setModuleFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filtrar por módulo" />
            </SelectTrigger>
            <SelectContent>
              {MODULE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filtrar por resultado" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <ShieldAlert className="h-10 w-10 opacity-40" />
            <p className="text-sm">Nenhuma exportação encontrada para os filtros selecionados.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data / Hora</TableHead>
                  <TableHead>Utilizador</TableHead>
                  <TableHead>Módulo</TableHead>
                  <TableHead>Colunas exportadas</TableHead>
                  <TableHead>Dados sensíveis</TableHead>
                  <TableHead>Resultado</TableHead>
                  <TableHead className="text-right">Nº linhas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {format(new Date(entry.created_at), "dd/MM/yyyy HH:mm", { locale: pt })}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {resolveUserName(entry)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{moduleLabel(entry.module)}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                      {entry.effective_columns.join(", ") || "—"}
                    </TableCell>
                    <TableCell>
                      {entry.sensitive_columns.length > 0 ? (
                        <Badge variant="destructive" className="gap-1">
                          <ShieldAlert className="h-3 w-3" />
                          Sim
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Não</Badge>
                      )}
                    </TableCell>
                    <TableCell>{statusBadge(entry.status)}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {entry.row_count ?? "—"}
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
