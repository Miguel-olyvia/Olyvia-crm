import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, Loader2, Mail, RefreshCw, Send, UserCheck, Unplug, UserX } from "lucide-react";
import {
  callRpc,
  describeAccessError,
  formatDateTime,
  invokePortalAccess,
  type PortalUser,
  type SupplierPortalStatus,
} from "./types";

interface SupplierPortalTabProps {
  supplierId: string;
  supplierName: string;
  /** Organização do fornecedor (vai no pedido à edge function). */
  organizationId: string | null;
  /** Sugestões para o diálogo de convite (o operador pode editar). */
  defaultEmail?: string | null;
  defaultName?: string | null;
}

/** dd/mm/aaaa hh:mm */
const formatDataHora = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", "");
};

const emailSchema = z.string().trim().email("Email inválido.").max(255);

type Overall = { label: string; variant: "default" | "secondary" | "outline" | "destructive"; hint: string };

function overallStatus(s: SupplierPortalStatus): Overall {
  if (s.portal_status === "not_invited") {
    return { label: "Sem acesso", variant: "outline", hint: "Este fornecedor ainda não foi convidado para o portal." };
  }
  if (s.portal_status === "revoked") {
    return { label: "Acesso revogado", variant: "destructive", hint: "O portal foi desligado. Para reativar, volta a enviar o acesso." };
  }
  const active = s.users.filter((u) => u.access_status === "active");
  if (active.some((u) => u.password_set)) {
    return { label: "Ativo", variant: "default", hint: "O fornecedor já entrou no portal e gere o seu catálogo." };
  }
  return { label: "Convidado", variant: "secondary", hint: "Convite enviado; o fornecedor ainda não definiu a password." };
}

// Separador "Portal" da ficha do fornecedor (F3.1): estado, utilizadores
// convidados por esta empresa, convidar / reenviar / revogar / desligar.
// O envio passa pela edge function create-supplier-portal-access; a resposta
// nunca traz password nem link (o acesso só chega ao fornecedor por email).
export default function SupplierPortalTab({
  supplierId,
  supplierName,
  organizationId,
  defaultEmail,
  defaultName,
}: SupplierPortalTabProps) {
  const { toast } = useToast();
  const [status, setStatus] = useState<SupplierPortalStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteEmailError, setInviteEmailError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const [resendingId, setResendingId] = useState<string | null>(null);
  const [revokeUser, setRevokeUser] = useState<PortalUser | null>(null);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const load = useCallback(async (): Promise<SupplierPortalStatus | null> => {
    setLoading(true);
    const { data, error } = await callRpc<SupplierPortalStatus>("rpc_supplier_portal_status", { p_supplier_id: supplierId });
    setLoading(false);
    if (error) {
      setLoadError(error.message || "Não foi possível carregar o estado do portal.");
      return null;
    }
    setLoadError(null);
    setStatus(data);
    return data;
  }, [supplierId]);

  useEffect(() => {
    load();
  }, [load]);

  // Quando o fornecedor atualizou os dados no portal (supplier_account_links.
  // supplier_data_updated_at). select('*') de propósito: se a coluna ainda não
  // existir na BD o pedido não rebenta, simplesmente não vem.
  const linkId = status?.link_id ?? null;
  const [supplierDataUpdatedAt, setSupplierDataUpdatedAt] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setSupplierDataUpdatedAt(null);
    if (!linkId) return;
    void supabase
      .from("supplier_account_links")
      .select("*")
      .eq("id", linkId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        const value = (data as Record<string, unknown>).supplier_data_updated_at;
        setSupplierDataUpdatedAt(typeof value === "string" && value ? value : null);
      });
    return () => {
      cancelled = true;
    };
  }, [linkId, status]);

  const canManage = !!status?.can_manage;
  const nifValid = !!status?.nif_valid;

  const openInvite = () => {
    setInviteEmail(status?.supplier_email || defaultEmail || "");
    setInviteName(defaultName || "");
    setInviteEmailError(null);
    setInviteOpen(true);
  };

  // Com smtp_warning o acesso ficou registado mas o email não saiu: propõe-se
  // reenviar. Não há entrega manual, de propósito.
  const notifyResult = (
    message: string,
    smtpWarning: boolean | undefined,
    smtpErrorSafe: string | undefined,
    retryUserId: string | null,
  ) => {
    if (smtpWarning) {
      sonnerToast.warning("Email não enviado", {
        description: `${message}${smtpErrorSafe ? ` Motivo: ${smtpErrorSafe}.` : ""}`,
        duration: 12000,
        ...(retryUserId
          ? { action: { label: "Reenviar", onClick: () => { void handleResend(retryUserId); } } }
          : {}),
      });
    } else {
      sonnerToast.success(message, {
        description: `O fornecedor ${supplierName} recebe por email o link para entrar no portal.`,
        duration: 6000,
      });
    }
  };

  const handleInvite = async () => {
    const parsed = emailSchema.safeParse(inviteEmail);
    if (!parsed.success) {
      setInviteEmailError(parsed.error.errors[0]?.message || "Email inválido.");
      return;
    }
    if (!organizationId) {
      toast({ title: "Erro", description: "O fornecedor não tem empresa definida.", variant: "destructive" });
      return;
    }
    setSending(true);
    const email = parsed.data.toLowerCase();
    const { data, error } = await invokePortalAccess({
      action: "invite",
      organization_id: organizationId,
      supplier_id: supplierId,
      email,
      name: inviteName.trim() || undefined,
    });
    setSending(false);
    if (error || !data) {
      const description = error ? describeAccessError(error) : "Não foi possível enviar o acesso ao portal.";
      if (error?.error === "email_not_allowed") setInviteEmailError(description);
      toast({ title: "Acesso não enviado", description, variant: "destructive" });
      if (error?.error === "invalid_nif") {
        setInviteOpen(false);
        await load();
      }
      return;
    }
    setInviteOpen(false);
    const fresh = await load();
    const user = fresh?.users.find((u) => u.email.toLowerCase() === email && u.access_status === "active");
    notifyResult(data.message || "Convite enviado", data.smtp_warning, data.smtp_error_safe, user?.portal_user_id ?? null);
  };

  async function handleResend(portalUserId: string) {
    if (!organizationId) {
      toast({ title: "Erro", description: "O fornecedor não tem empresa definida.", variant: "destructive" });
      return;
    }
    setResendingId(portalUserId);
    const { data, error } = await invokePortalAccess({
      action: "resend",
      organization_id: organizationId,
      supplier_id: supplierId,
      portal_user_id: portalUserId,
    });
    setResendingId(null);
    if (error || !data) {
      toast({
        title: "Link não reenviado",
        description: error ? describeAccessError(error) : "Não foi possível reenviar o link.",
        variant: "destructive",
      });
      return;
    }
    notifyResult(data.message || "Link reenviado", data.smtp_warning, data.smtp_error_safe, portalUserId);
    await load();
  }

  const handleRevoke = async (portalUserId: string | null) => {
    setRevoking(true);
    const { data, error } = await callRpc<{ revoked_users: number; link_revoked: boolean }>(
      "rpc_supplier_portal_revoke_access",
      { p_supplier_id: supplierId, p_portal_user_id: portalUserId },
    );
    setRevoking(false);
    if (error) {
      toast({ title: "Não foi possível revogar", description: error.message, variant: "destructive" });
      return;
    }
    setRevokeUser(null);
    setDisconnectOpen(false);
    toast({
      title: data?.link_revoked ? "Portal desligado" : "Acesso revogado",
      description: data?.link_revoked
        ? `${data.revoked_users} acesso(s) revogado(s). O catálogo do fornecedor deixa de aparecer no CRM.`
        : "O utilizador deixa de entrar no portal em nome desta empresa.",
    });
    await load();
  };

  if (loading && !status) {
    return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  if (!status) {
    return (
      <div className="py-6 text-center space-y-3">
        <p className="text-sm text-destructive">{loadError || "Não foi possível carregar o estado do portal."}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => load()}>
          <RefreshCw className="w-4 h-4 mr-1" /> Tentar de novo
        </Button>
      </div>
    );
  }

  const overall = overallStatus(status);
  const activeUsers = status.users.filter((u) => u.access_status === "active");
  const lastLogin = status.users.reduce<string | null>(
    (acc, u) => (u.last_login_at && (!acc || Date.parse(u.last_login_at) > Date.parse(acc)) ? u.last_login_at : acc),
    null,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold">Portal do Fornecedor</h3>
            <Badge variant={overall.variant}>{overall.label}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{overall.hint}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => load()} disabled={loading} aria-label="Atualizar estado">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          {canManage && (
            <Button
              type="button"
              size="sm"
              onClick={openInvite}
              disabled={!nifValid}
              title={nifValid ? undefined : "Preenche um NIF válido no fornecedor antes de enviar o acesso"}
            >
              <Send className="w-4 h-4 mr-1" /> Enviar acesso ao portal
            </Button>
          )}
          {canManage && status.portal_status === "active" && (
            <Button type="button" variant="outline" size="sm" onClick={() => setDisconnectOpen(true)}>
              <Unplug className="w-4 h-4 mr-1" /> Revogar acesso
            </Button>
          )}
        </div>
      </div>

      {supplierDataUpdatedAt && (
        <p className="text-sm text-muted-foreground flex items-center gap-1.5">
          <UserCheck className="w-4 h-4 text-primary" aria-hidden="true" />
          Dados atualizados pelo fornecedor em {formatDataHora(supplierDataUpdatedAt)}
        </p>
      )}

      {!nifValid && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Preenche um NIF válido no fornecedor antes de enviar o acesso (separador Dados). Para fornecedores
            estrangeiros usa o prefixo do país (ex.: ESB12345678).
            {status.nif ? ` NIF atual: ${status.nif}.` : " O fornecedor não tem NIF."}
          </AlertDescription>
        </Alert>
      )}

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div className="rounded-md border p-3">
          <dt className="text-muted-foreground">NIF</dt>
          <dd className="font-mono">{status.nif_key || status.nif || "-"}</dd>
        </div>
        <div className="rounded-md border p-3">
          <dt className="text-muted-foreground">Utilizadores ativos</dt>
          <dd className="font-medium">{activeUsers.length}</dd>
        </div>
        <div className="rounded-md border p-3">
          <dt className="text-muted-foreground">Último acesso</dt>
          <dd>{formatDateTime(lastLogin)}</dd>
        </div>
        <div className="rounded-md border p-3">
          <dt className="text-muted-foreground">Artigos no catálogo</dt>
          <dd className="font-medium">{status.catalog_active_items ?? "-"}</dd>
        </div>
      </dl>

      {status.users.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">Nenhum utilizador convidado por esta empresa.</p>
      ) : (
        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Utilizador</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Convidado em</TableHead>
                <TableHead>Password</TableHead>
                <TableHead>Último acesso</TableHead>
                {canManage && <TableHead className="text-right"><span className="sr-only">Ações</span></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {status.users.map((u) => {
                const isActive = u.access_status === "active";
                return (
                  <TableRow key={u.portal_user_id} className={isActive ? "" : "opacity-60"}>
                    <TableCell>
                      <div className="font-medium">{u.name || "-"}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Mail className="w-3 h-3" /> {u.email}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={isActive ? "default" : "secondary"}>{isActive ? "Ativo" : "Revogado"}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDateTime(u.granted_at)}</TableCell>
                    <TableCell>
                      {u.password_set ? "Definida" : <span className="text-muted-foreground">Convite pendente</span>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDateTime(u.last_login_at)}</TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        {isActive && (
                          <div className="flex justify-end gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleResend(u.portal_user_id)}
                              disabled={resendingId !== null}
                            >
                              {resendingId === u.portal_user_id
                                ? <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                : <RefreshCw className="w-4 h-4 mr-1" />}
                              Reenviar
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setRevokeUser(u)}
                              aria-label={`Revogar acesso de ${u.email}`}
                            >
                              <UserX className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Convite */}
      <Dialog open={inviteOpen} onOpenChange={(v) => { if (!sending) setInviteOpen(v); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Enviar acesso ao portal</DialogTitle>
            <DialogDescription>
              {supplierName} recebe um email com um link para definir a password e gerir o seu catálogo no Portal do
              Fornecedor.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void handleInvite();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="supplier-portal-invite-email">Email *</Label>
              <Input
                id="supplier-portal-invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => { setInviteEmail(e.target.value); setInviteEmailError(null); }}
                placeholder="compras@fornecedor.pt"
                autoComplete="off"
                aria-invalid={!!inviteEmailError}
                className={inviteEmailError ? "border-destructive" : ""}
                required
              />
              {inviteEmailError && <p className="text-sm text-destructive">{inviteEmailError}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="supplier-portal-invite-name">Nome do contacto</Label>
              <Input
                id="supplier-portal-invite-name"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="Opcional"
                maxLength={200}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setInviteOpen(false)} disabled={sending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={sending || !inviteEmail.trim()}>
                {sending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
                Enviar convite
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Revogar um utilizador */}
      <AlertDialog open={!!revokeUser} onOpenChange={(v) => { if (!v && !revoking) setRevokeUser(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revogar o acesso de {revokeUser?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              Este utilizador deixa de entrar no portal em nome desta empresa. Os restantes acessos mantêm-se. Para
              reativar, volta a enviar o acesso.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); if (revokeUser) void handleRevoke(revokeUser.portal_user_id); }}
              disabled={revoking}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {revoking && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Revogar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Desligar o portal deste fornecedor */}
      <AlertDialog open={disconnectOpen} onOpenChange={(v) => { if (!revoking) setDisconnectOpen(v); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revogar o acesso de {supplierName} ao portal?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os utilizadores convidados por esta empresa perdem o acesso e o catálogo do fornecedor deixa de
              aparecer no CRM. As ligações já feitas aos produtos ficam. Depois disto já é possível mudar o NIF. Para
              reativar, volta a enviar o acesso.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoking}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void handleRevoke(null); }}
              disabled={revoking}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {revoking && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Revogar acesso
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
