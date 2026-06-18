import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ClientPortalLayout } from "@/components/portal/ClientPortalLayout";
import { useClientPortalData } from "@/hooks/useClientPortalData";
import { formatCurrency } from "@/lib/utils";
import {
  FileText, ScrollText, FolderOpen, Phone, Mail, MessageCircle,
  ArrowRight, Clock, AlertCircle, CheckCircle2, Send, UserPlus,
  PenLine, HelpCircle, Building2, Globe,
} from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

function getInitials(name?: string | null): string {
  if (!name) return "?";
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return initials || "?";
}

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  sent: { label: "A aguardar", color: "#7C3AED", bg: "#F3E8FF" },
  pending: { label: "A aguardar", color: "#7C3AED", bg: "#F3E8FF" },
  draft: { label: "Rascunho", color: "#6B7280", bg: "#F3F4F6" },
  accepted: { label: "Aceite", color: "#059669", bg: "#D1FAE5" },
  rejected: { label: "Rejeitada", color: "#DC2626", bg: "#FEE2E2" },
  expired: { label: "Expirada", color: "#DC2626", bg: "#FEE2E2" },
  active: { label: "Ativo", color: "#059669", bg: "#D1FAE5" },
  signed: { label: "Assinado", color: "#059669", bg: "#D1FAE5" },
};

const ClientPortal = () => {
  const navigate = useNavigate();
  const [userName, setUserName] = useState("");
  const [orgInfo, setOrgInfo] = useState<{ name: string; email?: string; phone?: string; website?: string } | null>(null);
  const [proposals, setProposals] = useState<any[]>([]);
  const [proposalsLoading, setProposalsLoading] = useState(true);
  const [portalCreatedAt, setPortalCreatedAt] = useState<string | null>(null);
  const portal = useClientPortalData();

  useEffect(() => {
    let cancelled = false;

    async function load(user: { id: string; email?: string | null; user_metadata?: any }) {
      if (cancelled) return;
      setUserName(user.user_metadata?.full_name || user.email || "");

      const { data: portalUserOrg } = await supabase
        .from("client_portal_users")
        .select("organization_id")
        .eq("auth_user_id", user.id)
        .limit(1);
      if (cancelled) return;

      if (portalUserOrg && portalUserOrg.length > 0) {
        const { data: org } = await supabase
          .from("anew_organizations")
          .select("name, metadata")
          .eq("id", portalUserOrg[0].organization_id)
          .maybeSingle();
        if (cancelled) return;
        if (org) {
          const meta = org.metadata as any;
          setOrgInfo({
            name: org.name || "",
            email: meta?.email || meta?.contact_email || null,
            phone: meta?.phone || meta?.contact_phone || null,
            website: meta?.website || null,
          });
        }
      }

      const { data: portalUserFull } = await supabase
        .from("client_portal_users")
        .select("proposal_id, entity_id, organization_id, created_at")
        .eq("auth_user_id", user.id)
        .limit(1);
      if (cancelled) return;

      const pu = portalUserFull?.[0];
      if (pu) {
        setPortalCreatedAt(pu.created_at);

        if (!pu.entity_id && !pu.organization_id && !pu.proposal_id) {
          setProposals([]);
          setProposalsLoading(false);
          return;
        }

        let query = supabase
          .from("proposals")
          .select("id, title, proposal_number, value, created_at, valid_until, status")
          .order("created_at", { ascending: false });

        if (pu.entity_id && pu.organization_id) {
          query = query.eq("organization_id", pu.organization_id).eq("entity_id", pu.entity_id);
        } else if (pu.proposal_id) {
          query = query.eq("id", pu.proposal_id);
        }

        const { data } = await query;
        if (cancelled) return;
        setProposals(data || []);
      }
      setProposalsLoading(false);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      if (!session?.user) { navigate("/auth"); return; }
      void load(session.user);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (!session?.user) { navigate("/auth"); return; }
      void load(session.user);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [navigate]);

  const firstName = userName.split(" ")[0] || "Cliente";
  const today = format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: pt });

  // M2: formatCurrency now imported from @/lib/utils


  const pendingProposals = proposals.filter(p => p.status === "sent" || p.status === "pending");
  const pendingContracts = portal.pendingActions.filter(a => a.type === "contract");
  const totalPending = pendingProposals.length + pendingContracts.length;

  // Build activity timeline from available data
  const activityItems = [
    ...proposals.filter(p => p.status === "accepted").map(p => ({
      icon: CheckCircle2,
      color: "#059669",
      text: `Proposta "${p.title}" aceite`,
      date: p.created_at,
    })),
    ...(portal.contractCount > 0 ? [{
      icon: PenLine,
      color: "#3B82F6",
      text: `Contrato gerado a partir da proposta`,
      date: proposals.find(p => p.status === "accepted")?.created_at || portal.pendingActions.find(a => a.type === "contract")?.date || new Date().toISOString(),
    }] : []),
    ...(portal.documentCount > 0 ? [{
      icon: FolderOpen,
      color: "#059669",
      text: `${portal.documentCount} documento${portal.documentCount !== 1 ? "s" : ""} disponível${portal.documentCount !== 1 ? "eis" : ""}`,
      date: proposals[0]?.created_at || new Date().toISOString(),
    }] : []),
    ...proposals.map(p => ({
      icon: Send,
      color: "#3B82F6",
      text: `Proposta "${p.title}" disponibilizada`,
      date: p.created_at,
    })),
    {
      icon: UserPlus,
      color: "#7C3AED",
      text: "Conta de acesso ao portal criada",
      date: portalCreatedAt || proposals[proposals.length - 1]?.created_at || new Date().toISOString(),
    },
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 8);

  return (
    <ClientPortalLayout>
      <div className="space-y-6">
        {/* Greeting */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Olá, {firstName} 👋</h1>
          <p className="text-muted-foreground capitalize text-sm mt-0.5">{today}</p>
        </div>

        {/* Pending Action Banner */}
        {totalPending > 0 && (
          <div
            className="rounded-xl p-5 text-white relative overflow-hidden"
            style={{ background: "linear-gradient(135deg, #7C3AED 0%, #3B82F6 100%)" }}
          >
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10 bg-white -mr-10 -mt-10" />
            <div className="relative flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="p-3 rounded-xl bg-white/20 backdrop-blur-sm shrink-0">
                <AlertCircle className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold">
                  Tem {totalPending} {totalPending === 1 ? "ação pendente" : "ações pendentes"}
                </h3>
                {pendingProposals.length > 0 && (
                  <p className="text-sm text-white/80 mt-1">
                    {pendingProposals[0].title} · {formatCurrency(pendingProposals[0].value)}
                    {pendingProposals[0].valid_until && (
                      <> · Válida até {format(new Date(pendingProposals[0].valid_until), "d MMM yyyy", { locale: pt })}</>
                    )}
                  </p>
                )}
              </div>
              <Button
                className="shrink-0 gap-1.5 bg-white hover:bg-white/90 font-semibold"
                style={{ color: "#7C3AED" }}
                onClick={() => {
                  if (pendingProposals.length > 0) {
                    navigate(`/client-portal/proposals/${pendingProposals[0].id}`);
                  } else if (pendingContracts.length > 0) {
                    navigate(`/client-portal/contracts/${pendingContracts[0].id}`);
                  }
                }}
              >
                Ver {pendingProposals.length > 0 ? "proposta" : "contrato"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Propostas */}
          <Card
            className="cursor-pointer hover:shadow-md transition-all group"
            style={{
              borderRadius: 12,
              borderLeft: portal.pendingProposals > 0 ? "3px solid #7C3AED" : undefined,
            }}
            onClick={() => navigate("/client-portal/proposals")}
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-muted-foreground">Propostas</p>
                <div className="p-2 rounded-lg" style={{ backgroundColor: "#F3E8FF" }}>
                  <FileText className="h-5 w-5" style={{ color: "#7C3AED" }} />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-foreground">
                  {portal.loading ? <Skeleton className="h-9 w-10 inline-block" /> : portal.proposalCount}
                </span>
              </div>
              {!portal.loading && portal.pendingProposals > 0 && (
                <p className="text-xs font-medium mt-1.5" style={{ color: "#7C3AED" }}>
                  {portal.pendingProposals} a aguardar decisão
                </p>
              )}
            </CardContent>
          </Card>

          {/* Contratos */}
          <Card
            className="cursor-pointer hover:shadow-md transition-all group"
            style={{
              borderRadius: 12,
              borderLeft: portal.activeContracts > 0 ? "3px solid #3B82F6" : undefined,
            }}
            onClick={() => navigate("/client-portal/contracts")}
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-muted-foreground">Contratos</p>
                <div className="p-2 rounded-lg" style={{ backgroundColor: "#DBEAFE" }}>
                  <ScrollText className="h-5 w-5" style={{ color: "#3B82F6" }} />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-foreground">
                  {portal.loading ? <Skeleton className="h-9 w-10 inline-block" /> : portal.contractCount}
                </span>
              </div>
              {!portal.loading && portal.activeContracts > 0 && (
                <p className="text-xs font-medium mt-1.5" style={{ color: "#3B82F6" }}>
                  {portal.activeContracts} ativo{portal.activeContracts !== 1 ? "s" : ""}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Documentos */}
          <Card
            className="cursor-pointer hover:shadow-md transition-all group"
            style={{ borderRadius: 12 }}
            onClick={() => navigate("/client-portal/documents")}
          >
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-muted-foreground">Documentos</p>
                <div className="p-2 rounded-lg" style={{ backgroundColor: "#D1FAE5" }}>
                  <FolderOpen className="h-5 w-5" style={{ color: "#059669" }} />
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-foreground">
                  {portal.loading ? <Skeleton className="h-9 w-10 inline-block" /> : portal.documentCount}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-5">
            {/* Pending Actions */}
            <Card style={{ borderRadius: 12 }}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Ações Pendentes
                </CardTitle>
              </CardHeader>
              <CardContent>
                {portal.loading ? (
                  <div className="space-y-3">
                    {[1, 2].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                  </div>
                ) : portal.pendingActions.length === 0 ? (
                  <div className="text-center py-6">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2" style={{ color: "#059669" }} />
                    <p className="text-sm text-muted-foreground">Não tem ações pendentes de momento.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {portal.pendingActions.map((action) => (
                      <div
                        key={action.id}
                        className="flex items-center justify-between p-3.5 rounded-xl border bg-white hover:shadow-sm transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="p-2 rounded-lg shrink-0"
                            style={{
                              backgroundColor: action.type === "proposal" ? "#F3E8FF" : "#DBEAFE",
                            }}
                          >
                            {action.type === "proposal" ? (
                              <FileText className="h-4 w-4" style={{ color: "#7C3AED" }} />
                            ) : (
                              <ScrollText className="h-4 w-4" style={{ color: "#3B82F6" }} />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{action.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {action.type === "proposal" ? "Proposta" : "Contrato"} ·{" "}
                              {format(new Date(action.date), "d MMM yyyy", { locale: pt })}
                            </p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          className="gap-1 shrink-0 text-white text-xs"
                          style={{ backgroundColor: "#7C3AED" }}
                          onClick={() => navigate(
                            action.type === "proposal"
                              ? `/client-portal/proposals/${action.id}`
                              : `/client-portal/contracts/${action.id}`
                          )}
                        >
                          Ver e decidir
                          <ArrowRight className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Proposals List */}
            <Card style={{ borderRadius: 12 }}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    As suas Propostas
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs gap-1"
                    style={{ color: "#7C3AED" }}
                    onClick={() => navigate("/client-portal/proposals")}
                  >
                    Ver todas <ArrowRight className="h-3 w-3" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {proposalsLoading ? (
                  <div className="space-y-3">
                    {[1, 2].map(i => <Skeleton key={i} className="h-14 w-full" />)}
                  </div>
                ) : proposals.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Sem propostas disponíveis.</p>
                ) : (
                  <div className="space-y-2">
                    {proposals.slice(0, 5).map(p => {
                      return (
                        <div
                          key={p.id}
                          className="flex items-center justify-between p-3 rounded-xl border bg-white hover:shadow-sm transition-all cursor-pointer"
                          onClick={() => navigate(`/client-portal/proposals/${p.id}`)}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="p-2 rounded-lg shrink-0" style={{ backgroundColor: "#F3F4F6" }}>
                              <FileText className="h-4 w-4" style={{ color: "#6B7280" }} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{p.title}</p>
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                {p.proposal_number && <span>{p.proposal_number} ·</span>}
                                <span>{formatCurrency(p.value)}</span>
                                <span>· {format(new Date(p.created_at), "d MMM yyyy", { locale: pt })}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Activity Timeline */}
            <Card style={{ borderRadius: 12 }}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Atividade Recente
                </CardTitle>
              </CardHeader>
              <CardContent>
                {portal.loading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                  </div>
                ) : activityItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Sem atividade recente.</p>
                ) : (
                  <div className="relative">
                    <div className="absolute left-[19px] top-3 bottom-3 w-px bg-border" />
                    <div className="space-y-4">
                      {activityItems.map((item, idx) => (
                        <div key={idx} className="flex items-start gap-3 relative">
                          <div
                            className="p-1.5 rounded-full shrink-0 z-10 bg-white border-2"
                            style={{ borderColor: item.color }}
                          >
                            <item.icon className="h-3.5 w-3.5" style={{ color: item.color }} />
                          </div>
                          <div className="pt-0.5">
                            <p className="text-sm text-foreground">{item.text}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {format(new Date(item.date), "d MMM yyyy", { locale: pt })}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column */}
          <div className="space-y-5">
            {/* Commercial Card */}
            <Card style={{ borderRadius: 12 }}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">O seu Comercial</CardTitle>
              </CardHeader>
              <CardContent>
                {portal.loading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-12 w-12 rounded-full mx-auto" />
                    <Skeleton className="h-5 w-32 mx-auto" />
                    <Skeleton className="h-4 w-40 mx-auto" />
                  </div>
                ) : portal.commercial ? (
                  <div className="text-center space-y-4">
                    <div
                      className="h-14 w-14 rounded-full flex items-center justify-center text-white text-lg font-bold mx-auto"
                      style={{ backgroundColor: "#7C3AED" }}
                    >
                      {getInitials(portal.commercial.name)}
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">{portal.commercial.name}</p>
                      <p className="text-xs text-muted-foreground">Gestor Comercial</p>
                    </div>

                    <div className="space-y-2 text-left">
                      {portal.commercial.email && (
                        <a
                          href={`mailto:${portal.commercial.email}`}
                          className="flex items-center gap-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors p-2 rounded-lg hover:bg-muted/50"
                        >
                          <Mail className="h-4 w-4 shrink-0" style={{ color: "#3B82F6" }} />
                          <span className="truncate">{portal.commercial.email}</span>
                        </a>
                      )}
                      {portal.commercial.phone && (
                        <a
                          href={`tel:${portal.commercial.phone}`}
                          className="flex items-center gap-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors p-2 rounded-lg hover:bg-muted/50"
                        >
                          <Phone className="h-4 w-4 shrink-0" style={{ color: "#059669" }} />
                          {portal.commercial.phone}
                        </a>
                      )}
                    </div>

                    <div className="flex gap-2 pt-1">
                      {portal.commercial.phone && (
                        <a href={`tel:${portal.commercial.phone}`} className="flex-1">
                          <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs">
                            <Phone className="h-3.5 w-3.5" /> Ligar
                          </Button>
                        </a>
                      )}
                      {portal.commercial.email && (
                        <a href={`mailto:${portal.commercial.email}`} className="flex-1">
                          <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs">
                            <Mail className="h-3.5 w-3.5" /> Email
                          </Button>
                        </a>
                      )}
                    </div>
                    {portal.commercial.phone && (
                      <a
                        href={`https://wa.me/${portal.commercial.phone.replace(/[^0-9+]/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block"
                      >
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full gap-1.5 text-xs"
                          style={{ borderColor: "#25D366", color: "#25D366" }}
                        >
                          <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                        </Button>
                      </a>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Informação do comercial indisponível.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Info / FAQ */}
            <Card style={{ borderRadius: 12 }}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <HelpCircle className="h-4 w-4 text-muted-foreground" />
                  Informação
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">Como funciona o portal?</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Aqui pode consultar as suas propostas, aceitar ou rejeitar, ver contratos e documentos associados.
                    </p>
                  </div>
                  <div className="border-t pt-3">
                    <p className="text-sm font-medium text-foreground">Tem dúvidas?</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Contacte o seu comercial diretamente ou envie uma dúvida a partir de qualquer proposta ou contrato.
                    </p>
                  </div>
                  <div className="border-t pt-3">
                    <p className="text-sm font-medium text-foreground">As propostas expiram?</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Sim, cada proposta tem uma data de validade. Após essa data, a proposta expira automaticamente.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Company Info */}
            <Card style={{ borderRadius: 12 }}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  Empresa
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2.5">
                  {orgInfo?.name && (
                    <p className="text-sm font-semibold text-foreground">{orgInfo.name}</p>
                  )}
                  {orgInfo?.email && (
                    <a
                      href={`mailto:${orgInfo.email}`}
                      className="flex items-center gap-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Mail className="h-4 w-4 shrink-0" />
                      <span className="truncate">{orgInfo.email}</span>
                    </a>
                  )}
                  {orgInfo?.phone && (
                    <a
                      href={`tel:${orgInfo.phone}`}
                      className="flex items-center gap-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Phone className="h-4 w-4 shrink-0" />
                      {orgInfo.phone}
                    </a>
                  )}
                  {orgInfo?.website && (
                    <a
                      href={orgInfo.website.startsWith("http") ? orgInfo.website : `https://${orgInfo.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Globe className="h-4 w-4 shrink-0" />
                      <span className="truncate">{orgInfo.website}</span>
                    </a>
                  )}
                  {!orgInfo?.email && !orgInfo?.phone && !orgInfo?.website && orgInfo?.name && (
                    <p className="text-xs text-muted-foreground">Contacte o seu comercial para mais informações.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ClientPortalLayout>
  );
};

export default ClientPortal;
