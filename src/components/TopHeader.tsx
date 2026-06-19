import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Search, User, LogOut, Beaker, CheckCheck, CalendarClock, Phone, Send, RefreshCw, X, Settings, Mail, MessageCircle } from "lucide-react";
import { LanguageSelector } from "@/components/LanguageSelector";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNotifications, type Notification } from "@/hooks/useNotifications";
import { useCompany } from "@/contexts/CompanyContext";
import { appendTimestamp, getNotificationRoute, notificationPriorityDotColors, sortNotificationsByPriority } from "@/lib/notifications/notificationPresentation";

import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { pt, es, fr, de, enUS } from "date-fns/locale";
import olyviaMascot from "@/assets/olyvia-mascot.png";
import { CompanySwitcher } from "@/components/CompanySwitcher";
import { EditProfileDialog } from "@/components/EditProfileDialog";
import { SendProposalDialog } from "@/components/proposals/SendProposalDialog";
import { SendQuoteDialog } from "@/components/quotes/SendQuoteDialog";
import { SendEntityEmailDialog } from "@/components/email/SendEntityEmailDialog";
import { WhatsAppSendDialog } from "@/components/whatsapp/WhatsAppSendDialog";
import type { WhatsAppContext } from "@/hooks/useWhatsApp";

interface TopHeaderProps {
  userName: string;
  userRole: string;
}

const actionLabels: Record<string, { label: string; icon: typeof Send }> = {
  send_followup: { label: "Follow-up", icon: Send },
  renew_validity: { label: "Renovar", icon: RefreshCw },
  send_renewal: { label: "Renovação", icon: Send },
  call_now: { label: "Ligar", icon: Phone },
};

export function TopHeader({ userName, userRole }: TopHeaderProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t, language } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const { activeCompany } = useCompany();
  const { notifications, unreadCount, markAsRead, markAllAsRead, dismissNotification } = useNotifications(activeCompany?.id);

  const dateLocales = { pt, es, fr, de, en: enUS };
  const currentDateLocale = dateLocales[language as keyof typeof dateLocales] || enUS;

  type ReplyContact = {
    email: string | null;
    phone: string | null;
    phoneCountryCode: string | null;
    name: string | null;
    docRef: string | null;
    docType: "proposal" | "quote" | "contract" | null;
    docId: string | null;
    docTitle: string | null;
    docDealId: string | null;
    docClienteId: string | null;
    entityId: string | null;
    organizationId: string | null;
  };
  const [messageDialog, setMessageDialog] = useState<Notification | null>(null);
  const [replyContact, setReplyContact] = useState<ReplyContact | null>(null);
  const [emailReplyOpen, setEmailReplyOpen] = useState(false);
  const [whatsAppReplyOpen, setWhatsAppReplyOpen] = useState(false);

  useEffect(() => {
    if (!messageDialog) {
      // Não limpar replyContact aqui — os diálogos de resposta (Email/WhatsApp)
      // dependem dele e abrem logo após fechar o messageDialog.
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        let et = (messageDialog.entity_type as "proposal" | "quote" | "contract" | null) || null;
        let eid = messageDialog.entity_id as string | null;
        let entityId: string | null = null;
        let docRef: string | null = null;
        let docTitle: string | null = null;
        let docDealId: string | null = null;
        let docClienteId: string | null = null;

        if ((!et || !eid) && messageDialog.organization_id) {
          const around = new Date(new Date(messageDialog.created_at).getTime() - 60_000).toISOString();
          const { data: logs } = await supabase
            .from("client_portal_access_log")
            .select("document_type, document_id, portal_user_id, created_at, client_portal_users!inner(organization_id, entity_id, contact_id, client_id)")
            .eq("action", "question")
            .eq("client_portal_users.organization_id", messageDialog.organization_id)
            .gte("created_at", around)
            .order("created_at", { ascending: true })
            .limit(1);
          const row: any = logs && logs[0];
          if (row) {
            et = row.document_type;
            eid = row.document_id;
          }
        }

        if (et && eid) {
          if (et === "proposal") {
            const { data } = await supabase.from("proposals").select("entity_id, proposal_number, title, deal_id").eq("id", eid).maybeSingle();
            entityId = (data as any)?.entity_id || null;
            docRef = (data as any)?.proposal_number || (data as any)?.title || null;
            docTitle = (data as any)?.title || null;
            docDealId = (data as any)?.deal_id || null;
          } else if (et === "quote") {
            const { data } = await supabase.from("quotes").select("entity_id, quote_number, title, deal_id, cliente_id").eq("id", eid).maybeSingle();
            entityId = (data as any)?.entity_id || null;
            docRef = (data as any)?.quote_number || (data as any)?.title || null;
            docTitle = (data as any)?.title || null;
            docDealId = (data as any)?.deal_id || null;
            docClienteId = (data as any)?.cliente_id || null;
          } else if (et === "contract") {
            const { data } = await supabase.from("client_contracts").select("entity_id, contract_number, title").eq("id", eid).maybeSingle();
            entityId = (data as any)?.entity_id || null;
            docRef = (data as any)?.contract_number || (data as any)?.title || null;
            docTitle = (data as any)?.title || null;
          }
        }

        if (!entityId && messageDialog.organization_id) {
          const around = new Date(new Date(messageDialog.created_at).getTime() - 60_000).toISOString();
          const { data: logs } = await supabase
            .from("client_portal_access_log")
            .select("client_portal_users!inner(organization_id, entity_id)")
            .eq("action", "question")
            .eq("client_portal_users.organization_id", messageDialog.organization_id)
            .gte("created_at", around)
            .order("created_at", { ascending: true })
            .limit(1);
          const cpu: any = logs && (logs[0] as any)?.client_portal_users;
          if (cpu?.entity_id) entityId = cpu.entity_id;
        }

        let name: string | null = null;
        let email: string | null = null;
        let phone: string | null = null;
        let phoneCountryCode: string | null = null;
        if (entityId) {
          const [{ data: ent }, { data: emails }, { data: phones }] = await Promise.all([
            supabase.from("anew_entities").select("display_name, first_name, last_name").eq("id", entityId).maybeSingle(),
            supabase.from("anew_entity_emails").select("email, is_primary").eq("entity_id", entityId).order("is_primary", { ascending: false }).limit(1),
            supabase.from("anew_entity_phones").select("phone_number, country_code, is_primary").eq("entity_id", entityId).order("is_primary", { ascending: false }).limit(1),
          ]);
          name = (ent as any)?.display_name
            || [((ent as any)?.first_name), ((ent as any)?.last_name)].filter(Boolean).join(" ").trim()
            || null;
          email = (emails && emails[0]?.email) || null;
          const phoneRow: any = phones && phones[0];
          phone = phoneRow?.phone_number || null;
          phoneCountryCode = phoneRow?.country_code || null;
        }

        if (!cancelled) setReplyContact({
          email, phone, phoneCountryCode, name, docRef,
          docType: et, docId: eid, docTitle, docDealId, docClienteId,
          entityId, organizationId: messageDialog.organization_id || null,
        });
      } catch (e) {
        console.error("[TopHeader] reply contact resolution failed", e);
        if (!cancelled) setReplyContact(null);
      }
    })();
    return () => { cancelled = true; };
  }, [messageDialog?.id]);

  const extractOriginalQuestion = () => {
    if (!messageDialog) return "";
    return (messageDialog.message || "").replace(/^.*?:\s*"?/, "").replace(/"$/, "");
  };

  const buildReplySubject = () => {
    const docLabel = replyContact?.docType === "quote" ? "Orçamento"
      : replyContact?.docType === "contract" ? "Contrato"
      : "Proposta";
    return `Re: ${docLabel}${replyContact?.docRef ? ` ${replyContact.docRef}` : ""} — Resposta à sua dúvida`;
  };

  const buildReplyMessagePlain = () => {
    const greeting = replyContact?.name ? `Olá ${replyContact.name},` : "Olá,";
    const original = extractOriginalQuestion();
    const docPart = replyContact?.docRef ? ` sobre ${replyContact.docRef}` : "";
    return `${greeting}\n\nEm resposta à sua dúvida${docPart}:\n"${original}"\n\n`;
  };

  const buildReplyMessageHtml = () => {
    const greeting = replyContact?.name ? `Olá ${replyContact.name},` : "Olá,";
    const original = extractOriginalQuestion();
    const docPart = replyContact?.docRef ? ` sobre <strong>${replyContact.docRef}</strong>` : "";
    return `<p>${greeting}</p><p>Em resposta à sua dúvida${docPart}:</p><blockquote style="border-left:3px solid #ccc;padding-left:8px;color:#555;margin:8px 0;">${original}</blockquote><p></p>`;
  };

  const handleReplyEmail = () => {
    if (!replyContact?.email) return;
    setMessageDialog(null);
    setNotificationsOpen(false);
    setEmailReplyOpen(true);
  };

  const handleReplyWhatsApp = () => {
    if (!replyContact?.phone) return;
    setMessageDialog(null);
    setNotificationsOpen(false);
    setWhatsAppReplyOpen(true);
  };

  const unreadNotifications = [...notifications]
    .filter(n => !n.is_read)
    .sort(sortNotificationsByPriority);

  const readNotifications = [...notifications]
    .filter(n => n.is_read)
    .sort(sortNotificationsByPriority);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast({
      title: t('header.loggedOut'),
      description: t('header.loggedOutDesc'),
    });
    navigate("/auth");
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Searching for:", searchQuery);
  };

  const handleNotificationClick = async (notification: Notification) => {
    // For client-question notifications, open a dialog with the full message
    // instead of navigating away — the message itself is what the user needs to read.
    if (notification.type === "client_question") {
      setMessageDialog(notification);
      await markAsRead(notification.id);
      return;
    }
    await markAsRead(notification.id);
    setNotificationsOpen(false);
    const route = await getNotificationRoute(notification);
    if (route) {
      navigate(appendTimestamp(route), { replace: true });
    }
  };

  const handleNotificationAction = async (notification: Notification) => {
    await markAsRead(notification.id);
    setNotificationsOpen(false);
    const baseRoute = (notification.action_config as any)?.route || (await getNotificationRoute(notification));
    if (baseRoute) {
      const withAction = notification.action_type
        ? `${baseRoute}${baseRoute.includes("?") ? "&" : "?"}action=${notification.action_type}`
        : baseRoute;
      navigate(appendTimestamp(withAction), { replace: true });
    }
  };

  const handleDismiss = async (e: React.MouseEvent, notificationId: string) => {
    e.stopPropagation();
    await dismissNotification(notificationId);
  };

  const renderNotification = (notification: Notification, isRead: boolean) => {
    const action = notification.action_type ? actionLabels[notification.action_type] : null;
    const ActionIcon = action?.icon;
    const dotColor = notificationPriorityDotColors[notification.priority || 'low'] || notificationPriorityDotColors.low;

    return (
      <div
        key={notification.id}
        onClick={() => handleNotificationClick(notification)}
        className={cn(
          "p-3 cursor-pointer transition-colors hover:bg-accent group",
          !isRead && "bg-primary/5",
          isRead && "opacity-60"
        )}
      >
        <div className="flex items-start gap-2">
          {!isRead && <div className={cn("w-2.5 h-2.5 rounded-full mt-1.5 shrink-0", dotColor)} />}
          {isRead && <div className="w-2.5 h-2.5 rounded-full mt-1.5 shrink-0 bg-muted" />}
          <div className="flex-1 min-w-0">
            <p className={cn("text-sm truncate", !isRead && "font-medium")}>
              {notification.title}
            </p>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {notification.message}
            </p>
            <div className="flex items-center gap-2 mt-1">
              {notification.entity_type && (
                <Badge variant="outline" className="text-[9px] h-4 px-1">
                  {notification.entity_type}
                </Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(notification.created_at), {
                  addSuffix: true, locale: currentDateLocale
                })}
              </span>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(notification.id); }}
              className="text-[9px] text-muted-foreground/60 font-mono mt-0.5 hover:text-primary cursor-pointer truncate max-w-full text-left"
              title="Clique para copiar"
            >
              ID: {notification.id}
            </button>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {action && (
              <Button
                variant="outline" size="sm"
                className="shrink-0 h-6 text-[10px] px-2"
                onClick={(e) => { e.stopPropagation(); handleNotificationAction(notification); }}
              >
                {ActionIcon && <ActionIcon className="w-3 h-3 mr-1" />}
                {action.label}
              </Button>
            )}
            <button
              onClick={(e) => handleDismiss(e, notification.id)}
              className="shrink-0 p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Dispensar"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <header className="h-14 border-b border-sidebar-border bg-sidebar fixed top-0 right-0 left-0 md:left-16 z-[450] px-4 flex items-center justify-between gap-4">
        <CompanySwitcher />

        <form onSubmit={handleSearch} className="flex-1 max-w-xl">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sidebar-foreground/70" />
            <Input
              type="search"
              placeholder={t('header.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-sidebar-accent border-none focus-visible:ring-1 text-sidebar-foreground placeholder:text-sidebar-foreground/50"
            />
          </div>
        </form>

        <div className="flex items-center gap-2">
          <LanguageSelector />

          <Button
            variant="ghost" size="sm" onClick={() => navigate("/team-hub")}
            className="text-sidebar-foreground hover:bg-sidebar-accent gap-1.5"
          >
            <Beaker className="h-4 w-4" />
            <span className="font-medium">Beta</span>
            <span className="ml-1 px-1.5 py-0.5 text-[10px] font-semibold bg-primary text-primary-foreground rounded">HUB</span>
          </Button>

          <Button
            variant="ghost" size="icon" onClick={() => navigate("/scheduling")}
            className="text-sidebar-foreground hover:bg-sidebar-accent"
            title={t('sidebar.scheduling')}
          >
            <CalendarClock className="w-5 h-5" />
          </Button>

          {/* Notifications */}
          <Popover open={notificationsOpen} onOpenChange={setNotificationsOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="relative text-sidebar-foreground hover:bg-sidebar-accent">
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-destructive rounded-full text-[10px] text-destructive-foreground flex items-center justify-center font-bold">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-96 p-0" align="end">
              <div className="p-3 border-b flex items-center justify-between">
                <h4 className="font-semibold text-sm">{t('header.notifications')}</h4>
                <div className="flex items-center gap-1">
                  {unreadCount > 0 && (
                    <Button variant="ghost" size="sm" onClick={markAllAsRead} className="h-7 text-xs">
                      <CheckCheck className="w-3 h-3 mr-1" />
                      {t('header.markAllRead')}
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setNotificationsOpen(false); navigate("/alert-settings"); }} title="Definições de alertas">
                    <Settings className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setNotificationsOpen(false)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <ScrollArea className="h-[400px]">
                {unreadNotifications.length === 0 && readNotifications.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground text-sm">
                    {t('header.noNotifications')}
                  </div>
                ) : (
                  <div>
                    {/* Unread section */}
                    {unreadNotifications.length > 0 && (
                      <div className="divide-y">
                        {unreadNotifications.map(n => renderNotification(n, false))}
                      </div>
                    )}
                    {/* Read section */}
                    {readNotifications.length > 0 && (
                      <>
                        {unreadNotifications.length > 0 && (
                          <div className="px-3 py-2 bg-muted/50 border-y">
                            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Lidas</span>
                          </div>
                        )}
                        <div className="divide-y">
                          {readNotifications.map(n => renderNotification(n, true))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </ScrollArea>
              <div className="p-2 border-t text-center">
                <Button
                  variant="ghost" size="sm" className="w-full text-xs text-primary"
                  onClick={() => { setNotificationsOpen(false); navigate("/notifications"); }}
                >
                  Ver todas as notificações
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 rounded-full p-0 hover:bg-sidebar-accent">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                    {userName.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{userName}</p>
                  <p className="text-xs text-muted-foreground">{userRole}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setEditProfileOpen(true)}>
                <User className="mr-2 h-4 w-4" />
                <span>{t('header.editProfile')}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>{t('header.logout')}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <EditProfileDialog open={editProfileOpen} onOpenChange={setEditProfileOpen} />

      <Dialog open={!!messageDialog} onOpenChange={(open) => !open && setMessageDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{messageDialog?.title || "Mensagem do cliente"}</DialogTitle>
            <DialogDescription>
              {messageDialog && formatDistanceToNow(new Date(messageDialog.created_at), { addSuffix: true, locale: currentDateLocale })}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/30 p-4 text-sm whitespace-pre-wrap break-words max-h-[50vh] overflow-y-auto">
            {messageDialog?.message}
          </div>
          <DialogFooter className="gap-2 sm:gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setMessageDialog(null)}>Fechar</Button>
            <Button
              variant="outline"
              disabled={!replyContact?.email}
              onClick={handleReplyEmail}
              title={replyContact?.email || "Sem email disponível"}
            >
              <Mail className="w-4 h-4 mr-2" />
              Responder por Email
            </Button>
            <Button
              variant="outline"
              disabled={!replyContact?.phone}
              onClick={handleReplyWhatsApp}
              title={replyContact?.phone || "Sem telefone disponível"}
              className="bg-[#25D366]/10 hover:bg-[#25D366]/20 border-[#25D366]/30"
            >
              <MessageCircle className="w-4 h-4 mr-2 text-[#25D366]" />
              WhatsApp
            </Button>
            <Button
              onClick={async () => {
                if (!messageDialog) return;
                const route = await getNotificationRoute(messageDialog);
                const target = messageDialog.link || route;
                setMessageDialog(null);
                setNotificationsOpen(false);
                if (target) navigate(appendTimestamp(target), { replace: true });
              }}
            >
              Ver documento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reply via Email — uses the same dialogs as the document modules */}
      {replyContact?.docType === "proposal" && replyContact.docId && (
        <SendProposalDialog
          open={emailReplyOpen}
          onOpenChange={setEmailReplyOpen}
          proposal={{
            id: replyContact.docId,
            title: replyContact.docTitle || replyContact.docRef || "Proposta",
            deal_id: replyContact.docDealId,
            organization_id: replyContact.organizationId,
          }}
          initialSubject={buildReplySubject()}
          initialMessage={buildReplyMessagePlain()}
        />
      )}
      {replyContact?.docType === "quote" && replyContact.docId && (
        <SendQuoteDialog
          open={emailReplyOpen}
          onOpenChange={setEmailReplyOpen}
          quote={{
            id: replyContact.docId,
            quote_number: replyContact.docRef,
            cliente_id: replyContact.docClienteId,
            deal_id: replyContact.docDealId,
            organization_id: replyContact.organizationId,
          }}
          initialSubject={buildReplySubject()}
          initialMessage={buildReplyMessageHtml()}
        />
      )}
      {replyContact?.docType === "contract" && replyContact.entityId && (
        <SendEntityEmailDialog
          open={emailReplyOpen}
          onOpenChange={setEmailReplyOpen}
          module="contracts"
          entityId={replyContact.entityId}
          entityName={replyContact.name || ""}
          entityEmail={replyContact.email || ""}
          organizationId={replyContact.organizationId || undefined}
          contractId={replyContact.docId || undefined}
          initialSubject={buildReplySubject()}
          initialMessage={buildReplyMessageHtml()}
        />
      )}

      {/* Reply via WhatsApp — uses the same dialog as the document modules */}
      {replyContact && (
        <WhatsAppSendDialog
          open={whatsAppReplyOpen}
          onOpenChange={setWhatsAppReplyOpen}
          context={replyContact.phone ? ({
            module: replyContact.docType === "quote" ? "quotes"
              : replyContact.docType === "contract" ? "contracts"
              : "proposals",
            recipientName: replyContact.name || "Cliente",
            recipientPhone: replyContact.phone,
            recipientPhoneCountryCode: replyContact.phoneCountryCode || undefined,
            entityId: replyContact.entityId || undefined,
            organizationId: replyContact.organizationId || undefined,
            proposalId: replyContact.docType === "proposal" ? (replyContact.docId || undefined) : undefined,
            quoteId: replyContact.docType === "quote" ? (replyContact.docId || undefined) : undefined,
            contractId: replyContact.docType === "contract" ? (replyContact.docId || undefined) : undefined,
            proposalTitle: replyContact.docType === "proposal" ? (replyContact.docTitle || undefined) : undefined,
            quoteTitle: replyContact.docType === "quote" ? (replyContact.docTitle || undefined) : undefined,
            contractNumber: replyContact.docType === "contract" ? (replyContact.docRef || undefined) : undefined,
          } as WhatsAppContext) : null}
          initialMessage={buildReplyMessagePlain()}
        />
      )}
    </>
  );
}
