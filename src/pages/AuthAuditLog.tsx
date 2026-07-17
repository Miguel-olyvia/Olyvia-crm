import { useCallback, useEffect, useState } from "react";
import { ShieldAlert, Search, ChevronLeft, ChevronRight, LogOut } from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { toast } from "sonner";

const PAGE_SIZE = 50;
const USER_AGENT_TRUNCATE_LENGTH = 60;

interface AuthAuditLogRow {
  id: string;
  identifier: string;
  auth_user_id: string | null;
  user_display_name: string | null;
  success: boolean;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

interface AccountChangeLogRow {
  id: string;
  auth_user_id: string;
  user_display_name: string | null;
  change_type: "email" | "password";
  old_email: string | null;
  created_at: string;
}

type SuccessFilter = "all" | "success" | "failure";
type AuditTab = "login_attempts" | "account_changes";

export default function AuthAuditLog() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<AuditTab>("login_attempts");

  const [rows, setRows] = useState<AuthAuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [identifierInput, setIdentifierInput] = useState("");
  const [identifierFilter, setIdentifierFilter] = useState("");
  const [successFilter, setSuccessFilter] = useState<SuccessFilter>("all");

  const [changeRows, setChangeRows] = useState<AccountChangeLogRow[]>([]);
  const [changeLoading, setChangeLoading] = useState(true);
  const [changePage, setChangePage] = useState(0);
  const [changeHasMore, setChangeHasMore] = useState(false);

  const [revokeTarget, setRevokeTarget] = useState<{ authUserId: string; identifier: string } | null>(null);
  const [revoking, setRevoking] = useState(false);

  const fetchLog = useCallback(async (targetPage: number) => {
    setLoading(true);
    try {
      const { data, error } = await (supabase.rpc as any)("get_login_attempts_audit_log", {
        p_limit: PAGE_SIZE,
        p_offset: targetPage * PAGE_SIZE,
        p_identifier: identifierFilter || null,
        p_success: successFilter === "all" ? null : successFilter === "success",
      });
      if (error) throw error;
      const result = (data || []) as AuthAuditLogRow[];
      setRows(result);
      setHasMore(result.length === PAGE_SIZE);
    } catch (error: unknown) {
      console.error("Error fetching auth audit log:", error);
      toast.error(t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [identifierFilter, successFilter, t]);

  const fetchAccountChanges = useCallback(async (targetPage: number) => {
    setChangeLoading(true);
    try {
      const { data, error } = await (supabase.rpc as any)("get_account_changes_audit_log", {
        p_limit: PAGE_SIZE,
        p_offset: targetPage * PAGE_SIZE,
        p_auth_user_id: null,
      });
      if (error) throw error;
      const result = (data || []) as AccountChangeLogRow[];
      setChangeRows(result);
      setChangeHasMore(result.length === PAGE_SIZE);
    } catch (error: unknown) {
      console.error("Error fetching account changes audit log:", error);
      toast.error(t("common.error"));
    } finally {
      setChangeLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchLog(page); }, [fetchLog, page]);
  useEffect(() => { if (tab === "account_changes") fetchAccountChanges(changePage); }, [fetchAccountChanges, changePage, tab]);

  const handleSearchSubmit = () => {
    setPage(0);
    setIdentifierFilter(identifierInput.trim());
  };

  const truncateUserAgent = (userAgent: string | null): string => {
    if (!userAgent) return "—";
    return userAgent.length > USER_AGENT_TRUNCATE_LENGTH
      ? `${userAgent.slice(0, USER_AGENT_TRUNCATE_LENGTH)}…`
      : userAgent;
  };

  const handleRevokeSessions = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      const { error } = await supabase.functions.invoke("revoke-user-sessions", {
        body: { target_auth_user_id: revokeTarget.authUserId },
      });
      if (error) {
        // supabase.functions.invoke devolve um FunctionsHttpError genérico em status não-2xx.
        // A mensagem real do backend está no body da resposta (error.context).
        let backendMessage: string | undefined;
        try {
          const ctx: any = (error as any).context;
          if (ctx && typeof ctx.json === "function") {
            const body = await ctx.json();
            backendMessage = body?.error || body?.message;
          } else if (ctx && typeof ctx.text === "function") {
            const text = await ctx.text();
            try {
              const parsed = JSON.parse(text);
              backendMessage = parsed?.error || parsed?.message || text;
            } catch {
              backendMessage = text;
            }
          }
        } catch {
          // ignore parse errors
        }
        throw new Error(backendMessage || error.message || t("common.error"));
      }
      toast.success(`Sessões de ${revokeTarget.identifier} terminadas com sucesso.`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t("common.error");
      toast.error(message);
    } finally {
      setRevoking(false);
      setRevokeTarget(null);
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center gap-3">
        <ShieldAlert className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold">{t("sidebar.authAuditLog")}</h1>
          <p className="text-sm text-muted-foreground">
            Registo de tentativas de autenticação (login) e alterações de conta, para fins de auditoria e conformidade RGPD (Art. 32).
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as AuditTab)}>
        <TabsList>
          <TabsTrigger value="login_attempts">Tentativas de autenticação</TabsTrigger>
          <TabsTrigger value="account_changes">Alterações de conta</TabsTrigger>
        </TabsList>

        <TabsContent value="login_attempts" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tentativas de autenticação</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-4 items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="Filtrar por identificador (email)"
                    value={identifierInput}
                    onChange={(e) => setIdentifierInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSearchSubmit(); }}
                    className="pl-10"
                  />
                </div>
                <Button variant="outline" onClick={handleSearchSubmit}>Filtrar</Button>
                <Select
                  value={successFilter}
                  onValueChange={(v) => { setSuccessFilter(v as SuccessFilter); setPage(0); }}
                >
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("common.all")}</SelectItem>
                    <SelectItem value="success">Sucesso</SelectItem>
                    <SelectItem value="failure">Falha</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <OlyviaLoader size={32} />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data/Hora</TableHead>
                        <TableHead>Identificador</TableHead>
                        <TableHead>Utilizador</TableHead>
                        <TableHead>Estado</TableHead>
                        <TableHead>IP</TableHead>
                        <TableHead>User Agent</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                            {t("common.noResults")}
                          </TableCell>
                        </TableRow>
                      ) : (
                        rows.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell className="whitespace-nowrap">
                              {format(new Date(row.created_at), "dd/MM/yyyy HH:mm:ss", { locale: pt })}
                            </TableCell>
                            <TableCell className="font-medium">{row.identifier}</TableCell>
                            <TableCell className="text-muted-foreground">{row.user_display_name || "—"}</TableCell>
                            <TableCell>
                              <Badge variant={row.success ? "default" : "destructive"}>
                                {row.success ? "Sucesso" : "Falha"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground whitespace-nowrap">{row.ip_address || "—"}</TableCell>
                            <TableCell className="text-muted-foreground max-w-xs">
                              <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="truncate block cursor-default">{truncateUserAgent(row.user_agent)}</span>
                                  </TooltipTrigger>
                                  <TooltipContent side="bottom" className="max-w-sm text-xs break-words">
                                    {row.user_agent || "—"}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </TableCell>
                            <TableCell className="text-right">
                              {row.auth_user_id ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => setRevokeTarget({ authUserId: row.auth_user_id as string, identifier: row.identifier })}
                                >
                                  <LogOut className="h-3.5 w-3.5 mr-1" />
                                  Terminar sessões
                                </Button>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <span className="text-sm text-muted-foreground">Página {page + 1}</span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page === 0 || loading}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!hasMore || loading}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Seguinte <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="account_changes" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Alterações de conta</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {changeLoading ? (
                <div className="flex items-center justify-center py-16">
                  <OlyviaLoader size={32} />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data/Hora</TableHead>
                        <TableHead>Utilizador</TableHead>
                        <TableHead>Tipo de alteração</TableHead>
                        <TableHead>Email anterior</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {changeRows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                            {t("common.noResults")}
                          </TableCell>
                        </TableRow>
                      ) : (
                        changeRows.map((row) => (
                          <TableRow key={row.id}>
                            <TableCell className="whitespace-nowrap">
                              {format(new Date(row.created_at), "dd/MM/yyyy HH:mm:ss", { locale: pt })}
                            </TableCell>
                            <TableCell className="text-muted-foreground">{row.user_display_name || "—"}</TableCell>
                            <TableCell>
                              <Badge variant="secondary">
                                {row.change_type === "email" ? "Email" : "Palavra-passe"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {row.change_type === "email" ? (row.old_email || "—") : "—"}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <span className="text-sm text-muted-foreground">Página {changePage + 1}</span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={changePage === 0 || changeLoading}
                    onClick={() => setChangePage((p) => Math.max(0, p - 1))}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!changeHasMore || changeLoading}
                    onClick={() => setChangePage((p) => p + 1)}
                  >
                    Seguinte <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!revokeTarget} onOpenChange={(open) => { if (!open) setRevokeTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Terminar todas as sessões?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação termina imediatamente todas as sessões ativas de <strong>{revokeTarget?.identifier}</strong>.
              O utilizador terá de iniciar sessão novamente em todos os dispositivos. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevokeSessions} disabled={revoking}>
              {revoking ? "A terminar…" : "Terminar sessões"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
