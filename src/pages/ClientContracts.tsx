import { useState, useMemo, useEffect } from "react";
import { formatCurrency } from "@/lib/utils";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { useClientPortalAccess } from "@/hooks/useClientPortalAccess";
import { usePermissions } from "@/hooks/usePermissions";
import { usePermissionScope, canActOnEntity, type ScopeLevel } from "@/hooks/usePermissionScope";
import { useTranslation } from "@/hooks/useTranslation";
import Layout from "@/components/Layout";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Eye, Loader2, FileText, ShieldAlert, Send, Download, FileSignature, Settings, CheckCheck, Phone, Mail, RotateCcw, User, MoreHorizontal, Search, Sparkles, Filter, ListChecks, BarChart3, RefreshCw, PenTool, ExternalLink, CalendarIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, startOfDay, endOfDay } from "date-fns";
import { pt } from "date-fns/locale";
import { PipelineBreadcrumb } from "@/components/pipeline/PipelineBreadcrumb";
import { usePipelineAutomation } from "@/hooks/usePipelineAutomation";
import { useNavigate } from "react-router-dom";
import { PermissionGate } from "@/components/PermissionGate";
import { useModuleAlerts } from "@/hooks/useModuleAlerts";
import { ModuleAlertsBanner } from "@/components/ModuleAlertsBanner";
import DashboardCard from "@/components/dashboard/DashboardCard";
import { ContractsWorkflowBar } from "@/components/contracts/ContractsWorkflowBar";
import { ContractsAlertBars } from "@/components/contracts/ContractsAlertBars";
import { useAlertSettings } from "@/hooks/useAlertSettings";
import { ContractsPipelineMini } from "@/components/contracts/ContractsPipelineMini";
import { ContractsDashboardView } from "@/components/contracts/ContractsDashboardView";
import { ContractsRenewalsView } from "@/components/contracts/ContractsRenewalsView";
import { ContractsSignaturesView } from "@/components/contracts/ContractsSignaturesView";
import { ContractDetailDialog } from "@/components/contracts/ContractDetailDialog";
import { ContractsDocumentsView } from "@/components/contracts/ContractsDocumentsView";
import { SendChannelDialog } from "@/components/contracts/SendChannelDialog";
import { WhatsAppSendDialog } from "@/components/whatsapp/WhatsAppSendDialog";
import { PortalStatusBadge } from "@/components/portal/PortalStatusBadge";
import { SendEntityEmailDialog } from "@/components/email/SendEntityEmailDialog";
import { type WhatsAppContext } from "@/hooks/useWhatsApp";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { buildContractPrintHtml, resolveContractDocument, gatherContractData, injectSignatoryIntoSignatureBlock } from "@/components/contracts/contractDocument";
import { substituteVariables } from "@/utils/contractVariables";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface ClientContract {
  id: string;
  status: string;
  created_at: string;
  created_by?: string | null;
  proposal_id?: string;
  [key: string]: any;
}

interface Proposal {
  id: string;
  [key: string]: any;
}

interface Template {
  id: string;
  name: string;
  body_html?: string | null;
}

const statusColors: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  pending_signature: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  signed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  expired: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  cancelled: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400",
};

const statusEmojis: Record<string, string> = {
  draft: "📝", pending_signature: "📨", signed: "✅", active: "✅", expired: "❌", cancelled: "🚫",
};

/** Devolve o valor efectivo do contrato: prefere `quote.total` (inclui desconto global)
 *  em vez de `contract.total_value` que pode ter sido guardado sem desconto aplicado. */
function getEffectiveContractValue(contract: any): number {
  if (contract.quote_id) {
    const proposalQuotes: any[] = (contract.proposals as any)?.quotes ?? [];
    const linked = proposalQuotes.find((q: any) => q.id === contract.quote_id);
    if (linked?.total != null) return Number(linked.total);
  }
  return Number(contract.total_value) || 0;
}

const ClientContracts = () => {
  const { t, language } = useTranslation();
  const { activeCompany, isLoading: companyLoading } = useCompany();
  const alertSettings = useAlertSettings();
  const { hasPermission, loading: permissionsLoading, isSystemAdmin } = usePermissions();
  const {
    getPermissionScope,
    anewUserId: scopeAnewUserId,
    teamMemberIds,
    loading: scopeLoading,
  } = usePermissionScope();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<ClientContract | null>(null);
  const { finalizeContract } = usePipelineAutomation();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"lista" | "dashboard" | "renovacoes" | "assinaturas" | "documentos" | "minutas">("lista");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [onlyMine, setOnlyMine] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSignConfirmOpen, setIsSignConfirmOpen] = useState(false);
  const [signingContractId, setSigningContractId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ proposal_id: "", template_id: "", start_date: "", end_date: "", notes: "", payment_terms: "" });
  const { alerts: contractAlerts, dismissAlert: dismissContractAlert } = useModuleAlerts('contract', activeCompany?.id);
  const [sendChannelOpen, setSendChannelOpen] = useState(false);
  const [sendingContract, setSendingContract] = useState<any>(null);
  const [showWhatsAppDialog, setShowWhatsAppDialog] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [whatsAppContext, setWhatsAppContext] = useState<WhatsAppContext | null>(null);
  const [contractPortalStatuses, setContractPortalStatuses] = useState<Record<string, string>>({});

  const { generatePortalAccess, loading: portalAccessLoading } = useClientPortalAccess({ onSuccess: () => queryClient.invalidateQueries({ queryKey: ["client-contracts"] }) });

  const handleOpenSendChannel = (contract: any) => {
    setSendingContract(contract);
    setSendChannelOpen(true);
  };

  const handleSendEmail = () => {
    if (sendingContract) {
      setShowEmailDialog(true);
    }
  };

  const handleSendWhatsApp = () => {
    if (sendingContract) {
      const phone = sendingContract._clientPhone || "";
      setWhatsAppContext({
        module: "contracts" as any,
        recipientName: sendingContract._clientName || "",
        recipientPhone: phone,
        recipientPhoneCountryCode: sendingContract._clientPhoneCountryCode || undefined,
        entityId: sendingContract.entity_id || "",
        organizationId: sendingContract.organization_id || undefined,
        contractId: sendingContract.id,
        contractNumber: sendingContract.contract_number || undefined,
        hasActiveDeal: false,
      });
      setShowWhatsAppDialog(true);
    }
  };

  const handleDownloadPdf = async (contract: any) => {
    if (!activeCompany?.id) {
      toast.error("Sem organização ativa");
      return;
    }

    const loadingToast = toast.loading("A gerar PDF do contrato...");
    let iframe: HTMLIFrameElement | null = null;

    try {
      const resolved = await resolveContractDocument(contract, activeCompany.id, activeCompany.name);
      if (!resolved) {
        toast.error("Este contrato não tem conteúdo para gerar PDF");
        return;
      }

      const html2pdfModule = await import("html2pdf.js");
      const html2pdf = (html2pdfModule.default || html2pdfModule) as any;
      const html = buildContractPrintHtml(resolved, contract.contract_number || "Contrato");

      const parser = new DOMParser();
      const parsed = parser.parseFromString(html, "text/html");
      parsed.querySelectorAll("script").forEach((script) => script.remove());

      iframe = document.createElement("iframe");
      iframe.setAttribute("aria-hidden", "true");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      // Dar dimensões reais ao iframe (CSS mm depende de DPI/viewport).
      // Sem isto, html2canvas captura o `.page` com tamanhos inconsistentes
      // e as margens/larguras do PDF saem distorcidas.
      iframe.style.width = resolved.pageWidth;
      iframe.style.height = resolved.pageHeight;
      iframe.style.border = "0";
      iframe.style.opacity = "0";
      iframe.style.pointerEvents = "none";
      document.body.appendChild(iframe);

      const preparedHtml = `<!doctype html>${parsed.documentElement.outerHTML}`;

      await new Promise<void>((resolve, reject) => {
        iframe!.onload = () => resolve();
        iframe!.onerror = () => reject(new Error("Falha ao preparar o documento para PDF"));
        iframe!.srcdoc = preparedHtml;
      });

      const iframeDocument = iframe.contentDocument;
      if (!iframeDocument) {
        throw new Error("Não foi possível carregar o documento do contrato");
      }

      if (iframeDocument.fonts?.ready) {
        await iframeDocument.fonts.ready;
      }

      const images = Array.from(iframeDocument.images || []);
      await Promise.all(
        images.map((image) => {
          if (image.complete) return Promise.resolve();
          return new Promise<void>((resolve) => {
            image.onload = () => resolve();
            image.onerror = () => resolve();
          });
        })
      );

      const pageElement = iframeDocument.querySelector(".page") as HTMLElement | null;
      if (!pageElement) {
        throw new Error("Não foi possível encontrar o conteúdo do contrato");
      }

      const safeFileName = `${contract.contract_number || contract.title || "contrato"}`
        .trim()
        .replace(/[^a-zA-Z0-9-_]+/g, "_")
        .replace(/^_+|_+$/g, "") || "contrato";

      const s = resolved.settings;
      const marginTop = Number(s.margin_top ?? 20) || 20;
      const marginRight = Number(s.margin_right ?? 20) || 20;
      const marginBottomBase = Number(s.margin_bottom ?? 20) || 20;
      const marginLeft = Number(s.margin_left ?? 20) || 20;
      // Reserva extra para evitar que o rodapé (renderizado como conteúdo
      // pelo html2pdf) encavalite o último parágrafo da página.
      const marginBottom = s.footer_text ? marginBottomBase + 4 : marginBottomBase;

      await html2pdf()
        .set({
          margin: [marginTop, marginRight, marginBottom, marginLeft],

          filename: `${safeFileName}.pdf`,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            backgroundColor: "#ffffff",
          },
          jsPDF: {
            unit: "mm",
            format: resolved.settings.page_size === "LETTER" ? "letter" : "a4",
            orientation: resolved.settings.page_orientation === "landscape" ? "landscape" : "portrait",
          },
          pagebreak: {
            mode: ["css", "legacy"],
            avoid: [
              ".content p",
              ".content li",
              ".content h1", ".content h2", ".content h3",
              ".content h4", ".content h5", ".content h6",
              ".content tr",
              ".content img",
              ".content blockquote",
              ".content div",
              ".content font",
              "[data-pdf-section='header']",
            ],
          },
        })
        .from(pageElement)
        .save();

      toast.success("PDF descarregado com sucesso");
    } catch (error: any) {
      toast.error("Erro ao gerar PDF: " + (error?.message || "erro desconhecido"));
    } finally {
      toast.dismiss(loadingToast);
      iframe?.remove();
    }
  };

  const getTranslatedStatus = (status: string) => {
    const statusMap: Record<string, string> = {
      draft: "Draft", pending_signature: "Enviado", signed: "Assinado",
      active: "Activo", expired: "Expirado", cancelled: "Cancelado",
    };
    return statusMap[status] || status;
  };

  const getLocale = () => {
    const localeMap: Record<string, string> = { en: 'en-GB', pt: 'pt-PT', es: 'es-ES', fr: 'fr-FR', de: 'de-DE' };
    return localeMap[language] || 'en-GB';
  };

  const canView = isSystemAdmin || hasPermission("client_contracts.view");
  const canCreate = isSystemAdmin || hasPermission("client_contracts.create");
  const canEdit = isSystemAdmin || hasPermission("client_contracts.edit");
  const canDelete = isSystemAdmin || hasPermission("client_contracts.delete");
  const canSendSignature = isSystemAdmin || hasPermission("client_contracts.send_signature");

  const { data: currentUserId } = useQuery({
    queryKey: ["current-business-user-id"],
    queryFn: async () => {
      return resolveCurrentBusinessUserId();
    },
  });

  const viewScope: ScopeLevel = isSystemAdmin ? "ORG" : getPermissionScope("client_contracts.view");
  const teamMemberIdsKey = teamMemberIds.join(",");

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ["client-contracts", activeCompany?.id, viewScope, scopeAnewUserId, teamMemberIdsKey],
    queryFn: async () => {
      if (!activeCompany?.id) return [];
      if (viewScope === "NONE") return [];

      // Build subtree: activeCompany + all descendants
      const subtreeIds = [activeCompany.id];
      try {
        const { data: allHierarchy } = await supabase
          .from("anew_hierarchy")
          .select("parent_org_id, child_org_id")
          .in("relationship_type", ["PARENT_OF", "parent_of", "parent_child"]);
        const childrenMap = new Map<string, string[]>();
        (allHierarchy || []).forEach((h: any) => {
          if (!childrenMap.has(h.parent_org_id)) childrenMap.set(h.parent_org_id, []);
          childrenMap.get(h.parent_org_id)!.push(h.child_org_id);
        });
        const queue = [activeCompany.id];
        while (queue.length > 0) {
          const current = queue.shift()!;
          const children = childrenMap.get(current) || [];
          for (const child of children) {
            if (!subtreeIds.includes(child)) {
              subtreeIds.push(child);
              queue.push(child);
            }
          }
        }
      } catch { /* fallback to just activeCompany */ }

      // Resolve allowed creator IDs by scope. OWNED → self; TEAM → self + subordinates.
      let creatorBatches: string[][] | null = null;
      if (viewScope === "OWNED") {
        if (!scopeAnewUserId) return [];
        creatorBatches = [[scopeAnewUserId]];
      } else if (viewScope === "TEAM") {
        const allowed = new Set<string>();
        if (scopeAnewUserId) allowed.add(scopeAnewUserId);
        teamMemberIds.forEach(id => allowed.add(id));
        if (allowed.size === 0) return [];
        const all = Array.from(allowed);
        const BATCH = 200;
        creatorBatches = [];
        for (let i = 0; i < all.length; i += BATCH) creatorBatches.push(all.slice(i, i + BATCH));
      }

      const runBaseQuery = (creatorBatch: string[] | null) => {
        let q: any = (supabase as any)
          .from("client_contracts")
          .select(`*, proposals!client_contracts_proposal_id_fkey ( id, title, quotes(id, total) )`)
          .in("organization_id", subtreeIds)
          .is("deleted_at", null)
          .order("created_at", { ascending: false });
        if (creatorBatch) q = q.in("created_by", creatorBatch);
        return q;
      };

      let data: any[] = [];
      if (creatorBatches === null) {
        const { data: rows, error } = await runBaseQuery(null);
        if (error) throw error;
        data = rows || [];
      } else {
        const dedup = new Map<string, any>();
        for (const batch of creatorBatches) {
          const { data: rows, error } = await runBaseQuery(batch);
          if (error) throw error;
          (rows || []).forEach((r: any) => { if (!dedup.has(r.id)) dedup.set(r.id, r); });
        }
        data = Array.from(dedup.values()).sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      }

      const entityIds = data.map((c: any) => c.entity_id).filter(Boolean);
      if (entityIds.length > 0) {
        const [{ data: entities }, { data: phones }, { data: emails }] = await Promise.all([
          supabase.from("anew_entities").select("id, display_name").in("id", entityIds),
          supabase.from("anew_entity_phones").select("entity_id, phone_number, country_code, is_primary").in("entity_id", entityIds),
          supabase.from("anew_entity_emails").select("entity_id, email, is_primary").in("entity_id", entityIds),
        ]);
        const nameMap = new Map((entities || []).map(e => [e.id, e.display_name]));
        const phoneMap = new Map<string, { phone: string; countryCode?: string }>();
        (phones || []).forEach(p => {
          if (!phoneMap.has(p.entity_id) || p.is_primary) {
            phoneMap.set(p.entity_id, { phone: p.phone_number, countryCode: p.country_code || undefined });
          }
        });
        const emailMap = new Map<string, string>();
        (emails || []).forEach(e => {
          if (!emailMap.has(e.entity_id) || e.is_primary) {
            emailMap.set(e.entity_id, e.email);
          }
        });
        data.forEach((c: any) => {
          c._clientName = nameMap.get(c.entity_id) || null;
          const ph = phoneMap.get(c.entity_id);
          c._clientPhone = ph?.phone || null;
          c._clientPhoneCountryCode = ph?.countryCode || null;
          c._clientEmail = emailMap.get(c.entity_id) || null;
        });
      }

      // Resolve assigned user names (created_by is anew_users.id per identity boundary)
      const userIds = [...new Set(data.map((c: any) => c.created_by).filter(Boolean))];
      if (userIds.length > 0) {
        const { data: users } = await (supabase as any)
          .from("anew_users")
          .select("id, name")
          .in("id", userIds);
        const userMap = new Map((users || []).map((u: any) => [u.id, u.name]));
        data.forEach((c: any) => { c.assigned_to_name = userMap.get(c.created_by) || null; });
      }

      return data as ClientContract[];
    },
    enabled: !!activeCompany?.id && canView && !scopeLoading,
  });

  // Load portal statuses for contracts.
  // Uses a cancelled flag to prevent a stale async call (triggered by the previous
  // activeCompany) from overwriting state that was already set by the new one.
  useEffect(() => {
    if (!activeCompany?.id || !contracts || contracts.length === 0) return;
    let cancelled = false;
    const loadPortalStatuses = async () => {
      const contractIds = contracts.map((c: any) => c.id);
      const { data: portalUsers } = await (supabase as any)
        .from("client_portal_users")
        .select("contract_id, portal_status")
        .eq("organization_id", activeCompany.id)
        .in("contract_id", contractIds);
      if (cancelled) return;
      const statusMap: Record<string, string> = {};
      (portalUsers || []).forEach((pu: any) => {
        if (pu.contract_id) statusMap[pu.contract_id] = pu.portal_status;
      });
      setContractPortalStatuses(statusMap);
    };
    void loadPortalStatuses();
    return () => { cancelled = true; };
  }, [contracts, activeCompany?.id]);

  const { data: proposals = [] } = useQuery({
    queryKey: ["proposals-for-contracts", activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany?.id) return [];
      const { data, error } = await (supabase as any)
        .from("proposals")
        .select(`id, title, entity_id, deal_id, quotes(total)`)
        .eq("organization_id", activeCompany.id)
        .in("status", ["approved", "accepted", "sent", "draft"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      
      const entityIds: string[] = [];
      const dealIds: string[] = [];
      (data || []).forEach((p: any) => {
        if (p.entity_id) entityIds.push(p.entity_id);
        else if (p.deal_id) dealIds.push(p.deal_id);
      });

      const dealEntityMap = new Map<string, string>();
      if (dealIds.length > 0) {
        const { data: deals } = await (supabase as any).from("deals").select("id, entity_id").in("id", dealIds);
        (deals || []).forEach((d: any) => {
          if (d.entity_id) { dealEntityMap.set(d.id, d.entity_id); entityIds.push(d.entity_id); }
        });
      }

      if (entityIds.length > 0) {
        const { data: entities } = await supabase.from("anew_entities").select("id, display_name").in("id", [...new Set(entityIds)]);
        const nameMap = new Map((entities || []).map(e => [e.id, e.display_name]));
        data?.forEach((p: any) => {
          const entityId = p.entity_id || dealEntityMap.get(p.deal_id);
          p._clientName = nameMap.get(entityId) || null;
          p._resolvedEntityId = entityId || null;
        });
      }

      const allEntityIds = [...new Set([...entityIds, ...dealEntityMap.values()])].filter(Boolean);
      if (allEntityIds.length > 0) {
        const { data: anewClients } = await (supabase as any).from("anew_clients").select("id, entity_id").in("entity_id", allEntityIds);
        const entityToClientMap = new Map((anewClients || []).map((c: any) => [c.entity_id, c.id]));
        data?.forEach((p: any) => {
          const eid = p.entity_id || dealEntityMap.get(p.deal_id);
          if (eid && entityToClientMap.has(eid)) p._resolvedClientId = entityToClientMap.get(eid);
        });
      }
      
      return data as Proposal[];
    },
    enabled: !!activeCompany?.id,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["contract-templates-active", activeCompany?.id],
    queryFn: async () => {
      if (!activeCompany?.id) return [];
      const { data, error } = await (supabase as any)
        .from("client_contract_templates")
        .select("id, name, body_html")
        .eq("organization_id", activeCompany.id)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as Template[];
    },
    enabled: !!activeCompany?.id,
  });

  // Computed KPIs
  // `now` is declared at the component body so that helper functions rendered
  // during the same render pass (getRowColor, getSubtitle, etc.) share the same
  // reference without being deps of a memo.  The memos below each capture their
  // own snapshot so stale comparisons cannot occur when the page is open for long
  // periods without a re-render.
  const now = new Date();
  const kpis = useMemo(() => {
    const now = new Date();
    const total = contracts.length;
    const totalValue = contracts.reduce((s, c) => s + getEffectiveContractValue(c), 0);
    const drafts = contracts.filter(c => c.status === "draft");
    const sent = contracts.filter(c => c.status === "pending_signature");
    const signed = contracts.filter(c => c.status === "signed" || c.status === "active");
    const expired = contracts.filter(c => c.status === "expired" || (c.end_date && new Date(c.end_date) < now && c.status !== "cancelled"));
    const activeContracts = signed.filter(c => !c.end_date || new Date(c.end_date) >= now);
    const activeValue = activeContracts.reduce((s, c) => s + getEffectiveContractValue(c), 0);
    const avgValue = total > 0 ? totalValue / total : 0;
    const signRate = sent.length + signed.length > 0 ? Math.round((signed.length / (sent.length + signed.length)) * 100) : 0;
    const expiring90 = contracts.filter(c => {
      if (!c.end_date || c.status === "expired" || c.status === "cancelled") return false;
      const d = Math.ceil((new Date(c.end_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return d > 0 && d <= 90;
    });
    // Avg sign time
    let avgSignDays = 0;
    const signedWithDates = signed.filter(c => c.updated_at && c.created_at);
    if (signedWithDates.length > 0) {
      const totalDays = signedWithDates.reduce((s, c) => {
        return s + Math.max(1, Math.ceil((new Date(c.updated_at).getTime() - new Date(c.created_at).getTime()) / (1000 * 60 * 60 * 24)));
      }, 0);
      avgSignDays = Math.round(totalDays / signedWithDates.length);
    }
    return {
      total, totalValue, drafts, sent, signed, expired, activeValue, avgValue, signRate, expiring90, avgSignDays,
      draftValue: drafts.reduce((s, c) => s + getEffectiveContractValue(c), 0),
      sentValue: sent.reduce((s, c) => s + getEffectiveContractValue(c), 0),
      signedValue: signed.reduce((s, c) => s + getEffectiveContractValue(c), 0),
      expiredValue: expired.reduce((s, c) => s + getEffectiveContractValue(c), 0),
    };
  }, [contracts]);

  // Filtered contracts
  const filteredContracts = useMemo(() => {
    const now = new Date();
    let result = [...contracts];
    if (onlyMine && currentUserId) {
      result = result.filter(c => c.created_by === currentUserId);
    }
    if (statusFilter !== "all") {
      if (statusFilter === "expiring") {
        result = result.filter(c => {
          if (!c.end_date) return false;
          const d = Math.ceil((new Date(c.end_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          return d > 0 && d <= 90;
        });
      } else {
        result = result.filter(c => c.status === statusFilter);
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c =>
        (c.contract_number || "").toLowerCase().includes(q) ||
        (c._clientName || "").toLowerCase().includes(q) ||
        (c.proposals?.title || "").toLowerCase().includes(q)
      );
    }
    if (dateFrom || dateTo) {
      result = result.filter(c => {
        const d = new Date(c.created_at);
        if (dateFrom && d < startOfDay(dateFrom)) return false;
        if (dateTo && d > endOfDay(dateTo)) return false;
        return true;
      });
    }
    return result;
  }, [contracts, statusFilter, searchQuery, onlyMine, currentUserId, dateFrom, dateTo]);

  

  // Smart suggestion
  const smartSuggestion = useMemo(() => {
    const now = new Date();
    const parts: string[] = [];
    const actions: { label: string; action: string; contract?: any }[] = [];

    const drafts = contracts.filter(c => c.status === "draft");
    if (drafts.length > 0) {
      const d = drafts[0];
      parts.push(`O contrato de ${d._clientName || "?"} (${formatCurrency(getEffectiveContractValue(d))}) foi criado automaticamente pelo workflow mas está em Draft. Contratos não enviados em 48h têm 25% menos probabilidade de serem assinados. Sugerimos enviar para assinatura agora.`);
      actions.push({ label: `Enviar ${(d._clientName || "").split(" ")[0]}`, action: "send_signature", contract: d });
    }
    const sentOld = contracts.filter(c => {
      if (c.status !== "pending_signature") return false;
      const days = Math.ceil((now.getTime() - new Date(c.updated_at || c.created_at).getTime()) / (1000 * 60 * 60 * 24));
      return days >= 5;
    });
    if (sentOld.length > 0) {
      const d = sentOld[0];
      const days = Math.ceil((now.getTime() - new Date(d.updated_at || d.created_at).getTime()) / (1000 * 60 * 60 * 24));
      parts.push(`O contrato de ${d._clientName || "?"} (${formatCurrency(getEffectiveContractValue(d))}) foi enviado há ${days} dias sem assinatura — considere um follow-up.`);
      actions.push({ label: `Follow-up ${(d._clientName || "").split(" ")[0]}`, action: "followup", contract: d });
    }
    const signedRecent = contracts.filter(c => (c.status === "signed" || c.status === "active") && (now.getTime() - new Date(c.updated_at || c.created_at).getTime()) < 7 * 24 * 60 * 60 * 1000);
    if (signedRecent.length > 0) {
      parts.push(`O contrato do ${signedRecent[0]._clientName} já está assinado e o cliente foi criado automaticamente.`);
    }

    return { text: parts.join(" "), actions };
  }, [contracts]);

  const applyPromptValues = (html: string, promptValues?: Record<string, string>): string => {
    if (!promptValues) return html;
    let out = html;
    for (const [k, v] of Object.entries(promptValues)) {
      const safe = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      out = out.replace(new RegExp(`\\{\\{\\s*${safe}\\s*\\}\\}`, "g"), v);
    }
    return out;
  };

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData & { prompt_values?: Record<string, string> }) => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Not authenticated");
      if (!activeCompany?.id) throw new Error("No company selected");
      const businessUserId = await resolveCurrentBusinessUserId();
      if (!businessUserId) throw new Error("Business user not resolved");
      const selectedProposal = proposals.find(p => p.id === data.proposal_id);
      if (!selectedProposal) throw new Error("Proposal not found");
      const resolvedEntityId = selectedProposal.entity_id || selectedProposal._resolvedEntityId;
      const clientId = selectedProposal._resolvedClientId;
      if (!clientId) throw new Error("Client not found.");
      const totalValue = selectedProposal.quotes?.reduce((sum: number, q: any) => sum + (q.total || 0), 0) || 0;
      let rootOrgId = activeCompany.id;
      try {
        const { data: allHierarchy } = await supabase.from("anew_hierarchy").select("parent_org_id, child_org_id").in("relationship_type", ["PARENT_OF", "parent_of", "parent_child"]);
        const parentMap = new Map<string, string>();
        (allHierarchy || []).forEach((h: any) => { parentMap.set(h.child_org_id, h.parent_org_id); });
        let current = activeCompany.id;
        while (parentMap.has(current)) { current = parentMap.get(current)!; }
        rootOrgId = current;
      } catch { /* fallback */ }
      // Auto-generate contract body from template if selected
      let contractBodyHtml: string | null = null;
      if (data.template_id) {
        const { data: tpl } = await (supabase as any)
          .from("client_contract_templates")
          .select("body_html")
          .eq("id", data.template_id)
          .single();
        if (tpl?.body_html) {
          contractBodyHtml = tpl.body_html;
        }
      }

      await supabase.rpc('set_audit_context', { p_user_id: businessUserId, p_source: 'ui' });
      const { data: inserted, error } = await (supabase as any).from("client_contracts").insert({
        client_id: clientId, entity_id: resolvedEntityId || null, organization_id: activeCompany.id,
        root_organization_id: rootOrgId, proposal_id: data.proposal_id, contract_template_id: data.template_id || null,
        total_value: totalValue, currency: "EUR", start_date: data.start_date || null, end_date: data.end_date || null,
        notes: data.notes || null, payment_terms: data.payment_terms || null,
        contract_body_html: contractBodyHtml,
        prompt_values: data.prompt_values && Object.keys(data.prompt_values).length > 0 ? data.prompt_values : null,
        status: "draft", created_by: businessUserId,
      }).select("*").single();
      if (error) throw error;

      // Bake prompt answers + signatário no markup, mas DEIXA os tokens {{…}} intactos.
      // A substituição final (proposta_numero, cliente_nome, etc.) acontece em runtime
      // (contractDocument.ts) para reflectir sempre o estado actual da BD.
      if (contractBodyHtml && inserted) {
        const variableData = await gatherContractData(inserted, activeCompany.id);
        const withPrompts = applyPromptValues(contractBodyHtml, data.prompt_values);
        const finalHtml = injectSignatoryIntoSignatureBlock(
          withPrompts,
          (variableData as any).signatario_nome,
          (variableData as any).signatario_cargo,
        );
        await supabase.rpc('set_audit_context', { p_user_id: businessUserId, p_source: 'ui' });
        await (supabase as any).from("client_contracts").update({ contract_body_html: finalHtml }).eq("id", inserted.id);
      }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["client-contracts"] }); toast.success("Contrato criado com sucesso"); handleCloseDialog(); },
    onError: (error) => { toast.error("Erro ao criar contrato: " + error.message); },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { proposal_id: string; template_id: string; start_date: string; end_date: string; notes: string; payment_terms: string; id: string; prompt_values?: Record<string, string> }) => {
      const currentContract = contracts.find(c => c.id === data.id) as any;
      const existingPromptValues = currentContract?.prompt_values && typeof currentContract.prompt_values === "object"
        ? currentContract.prompt_values
        : {};
      const mergedPromptValues = data.prompt_values && Object.keys(data.prompt_values).length > 0
        ? { ...existingPromptValues, ...data.prompt_values }
        : existingPromptValues;

      const updatePayload: any = {
        contract_template_id: data.template_id || null, start_date: data.start_date || null, end_date: data.end_date || null,
        notes: data.notes || null, payment_terms: data.payment_terms || null,
        prompt_values: Object.keys(mergedPromptValues).length > 0 ? mergedPromptValues : null,
      };

      const businessUserId = await resolveCurrentBusinessUserId();
      if (businessUserId) {
        await supabase.rpc('set_audit_context', { p_user_id: businessUserId, p_source: 'ui' });
      }
      const { error } = await supabase.from("client_contracts").update(updatePayload).eq("id", data.id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["client-contracts"] }); toast.success("Contrato atualizado"); handleCloseDialog(); },
    onError: (error) => { toast.error("Erro: " + error.message); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).rpc("soft_delete_business_entity", { p_kind: "contract", p_id: id });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["client-contracts"] }); toast.success("Contrato movido para o lixo"); setIsDeleteOpen(false); setDeleteId(null); },
    onError: (error) => { toast.error("Erro: " + error.message); },
  });

  const handleCloseDialog = () => { setIsDialogOpen(false); setEditingContract(null); setFormData({ proposal_id: "", template_id: "", start_date: "", end_date: "", notes: "", payment_terms: "" }); };

  // Scope-aware guards. Returns true if the user can edit/delete the given contract.
  const editScope: ScopeLevel = isSystemAdmin ? "ORG" : getPermissionScope("client_contracts.edit");
  const deleteScope: ScopeLevel = isSystemAdmin ? "ORG" : getPermissionScope("client_contracts.delete");
  const canEditContract = (c: { created_by?: string | null }) =>
    isSystemAdmin || canActOnEntity(editScope, c, scopeAnewUserId, null, teamMemberIds);
  const canDeleteContract = (c: { created_by?: string | null }) =>
    isSystemAdmin || canActOnEntity(deleteScope, c, scopeAnewUserId, null, teamMemberIds);

  const handleFinalize = async (contractId: string) => {
    const contract = contracts.find(c => c.id === contractId) as any;
    if (contract && !canEditContract(contract)) {
      toast.error("Acesso negado");
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await finalizeContract({ contract_id: contractId, user_id: user.id });
      queryClient.invalidateQueries({ queryKey: ["client-contracts"] });
    }
  };

  const handleSignConfirm = async () => {
    if (signingContractId) {
      await handleFinalize(signingContractId);
      setIsSignConfirmOpen(false);
      setSigningContractId(null);
    }
  };

  const handleEdit = (contract: ClientContract) => {
    if (!canEditContract(contract)) {
      toast.error("Acesso negado");
      return;
    }
    setEditingContract(contract);
    setIsDialogOpen(true);
  };

  const handleDialogSave = (data: { proposal_id: string; template_id: string; start_date: string; end_date: string; notes: string; payment_terms: string; prompt_values?: Record<string, string>; id?: string }) => {
    if (data.start_date && data.end_date && new Date(data.end_date) <= new Date(data.start_date)) {
      toast.error("A data de fim deve ser posterior à data de início.");
      return;
    }
    if (data.id) {
      const target = contracts.find(c => c.id === data.id) as any;
      if (target && !canEditContract(target)) {
        toast.error("Acesso negado");
        return;
      }
      updateMutation.mutate(data as any);
    } else {
      createMutation.mutate(data);
    }
  };

  const handleStatusChange = async (contractId: string, newStatus: string) => {
    const contract = contracts.find(c => c.id === contractId) as any;
    if (contract && !canEditContract(contract)) {
      toast.error("Acesso negado");
      return;
    }
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const businessUserId = await resolveCurrentBusinessUserId();
    if (businessUserId) {
      await supabase.rpc('set_audit_context', { p_user_id: businessUserId, p_source: 'ui' });
    }
    const { error } = await (supabase as any).from("client_contracts").update({
      status: newStatus,
      status_changed_by: businessUserId || authUser?.id || null,
      status_changed_at: new Date().toISOString(),
    }).eq("id", contractId);
    if (error) { toast.error("Erro ao mudar estado"); return; }
    queryClient.invalidateQueries({ queryKey: ["client-contracts"] });
    toast.success(`Estado alterado para ${getTranslatedStatus(newStatus)}`);
  };

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };

  const getClientName = (contract: ClientContract) => contract._clientName || "N/A";
  const getProposalName = (proposal: Proposal) => `${proposal.title || "Sem título"} - ${proposal._clientName || "N/A"}`;
  const getProposalTotal = (proposal: Proposal) => proposal.quotes?.reduce((sum: number, q: any) => sum + (q.total || 0), 0) || 0;

  const formatContractCurrency = (value: number | null, currency: string | null) => {
    if (!value) return "-";
    const fixed = Math.abs(value).toFixed(2);
    const [int, dec] = fixed.split('.');
    return '€' + int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dec;
  };

  const getRowColor = (contract: ClientContract) => {
    if (contract.status === "draft") return "bg-yellow-50/60 dark:bg-yellow-950/10";
    if (contract.status === "signed" || contract.status === "active") return "bg-green-50/40 dark:bg-green-950/10";
    if (contract.status === "expired") return "bg-red-50/40 dark:bg-red-950/10 opacity-75";
    if (contract.end_date) {
      const daysLeft = Math.ceil((new Date(contract.end_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysLeft > 0 && daysLeft <= 90) return "bg-orange-50/40 dark:bg-orange-950/10";
    }
    return "";
  };

  const getSubtitle = (contract: ClientContract) => {
    const daysSince = Math.ceil((now.getTime() - new Date(contract.created_at).getTime()) / (1000 * 60 * 60 * 24));
    if (contract.status === "draft") return `📝 Draft — enviar para assinatura`;
    if (contract.status === "pending_signature") {
      const d = Math.ceil((now.getTime() - new Date(contract.updated_at || contract.created_at).getTime()) / (1000 * 60 * 60 * 24));
      return `📨 Enviado há ${d} dias — a aguardar assinatura`;
    }
    if (contract.status === "signed" || contract.status === "active") return "✅ Assinado — cliente criado automaticamente";
    if (contract.status === "expired") {
      if (contract.end_date) {
        const d = Math.ceil((now.getTime() - new Date(contract.end_date).getTime()) / (1000 * 60 * 60 * 24));
        return `❌ Expirado há ${d} dias — não renovado`;
      }
      return "❌ Expirado — não renovado";
    }
    if (contract.end_date) {
      const daysLeft = Math.ceil((new Date(contract.end_date).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysLeft > 0 && daysLeft <= 90) return `⏰ Expira em ${daysLeft} dias — preparar renovação`;
    }
    return "";
  };

  const getProgressBar = (contract: ClientContract) => {
    if (!contract.start_date || !contract.end_date) return null;
    const start = new Date(contract.start_date).getTime();
    const end = new Date(contract.end_date).getTime();
    const total = end - start;
    if (total <= 0) return null;
    const elapsed = now.getTime() - start;
    const pct = Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
    const daysLeft = Math.ceil((end - now.getTime()) / (1000 * 60 * 60 * 24));
    const totalDays = Math.ceil(total / (1000 * 60 * 60 * 24));
    let barColor = "bg-green-500";
    if (daysLeft <= 0) barColor = "bg-red-500";
    else if (daysLeft <= 30) barColor = "bg-red-400";
    else if (daysLeft <= 90) barColor = "bg-orange-400";
    else if (daysLeft <= 180) barColor = "bg-yellow-400";

    return (
      <div className="flex flex-col gap-0.5">
        <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
          <div className={`h-full ${barColor} rounded-full`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[10px] text-muted-foreground">
          {pct}% · {daysLeft > 0 ? `${daysLeft} dias` : "Expirado"}
        </span>
      </div>
    );
  };

  const getRenewalBadge = (contract: ClientContract) => {
    if (!contract.end_date) return <span className="text-xs text-muted-foreground">—</span>;
    const end = new Date(contract.end_date);
    const daysLeft = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    let color = "text-green-600";
    if (daysLeft <= 0) color = "text-red-600";
    else if (daysLeft <= 90) color = "text-orange-600";
    return (
      <div className="text-center">
        <span className={`text-xl font-black ${color}`}>{daysLeft}d</span>
        <p className="text-[9px] uppercase text-muted-foreground tracking-wider">
          {daysLeft <= 0 ? "EXPIRADO" : "ATÉ EXPIRAR"}
        </p>
      </div>
    );
  };

  const getSignatureBadge = (contract: ClientContract) => {
    if (contract.status === "signed" || contract.status === "active") {
      const date = contract.updated_at ? new Date(contract.updated_at).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" }) : "";
      return <span className="text-xs text-green-600 font-medium">✍️ Assinado {date}</span>;
    }
    if (contract.status === "pending_signature") return <span className="text-xs text-yellow-600 font-medium">✍️ A aguardar assinatura</span>;
    return <span className="text-xs text-muted-foreground">✍️ Não enviado</span>;
  };

  // Redirect when user lacks view permission. Must be in an effect — calling
  // navigate() during render is a side effect and causes undefined behaviour.
  useEffect(() => {
    if (!permissionsLoading && !canView && !isSystemAdmin && activeCompany) {
      navigate("/dashboard");
    }
  }, [permissionsLoading, canView, isSystemAdmin, activeCompany, navigate]);

  if (permissionsLoading) {
    return <Layout><div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></Layout>;
  }

  // Show loader while the redirect effect is about to fire.
  if (!canView && !isSystemAdmin && activeCompany) {
    return <Layout><div className="flex items-center justify-center h-64"><OlyviaLoader size={40} /></div></Layout>;
  }

  if (companyLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <OlyviaLoader size={40} />
        </div>
      </Layout>
    );
  }

  if (!activeCompany) {
    return (
      <Layout>
        <div className="space-y-6 p-6">
          <div><h1 className="text-2xl sm:text-3xl font-bold">{t('contracts.title')}</h1><p className="text-muted-foreground">{t('contracts.subtitle')}</p></div>
          <NoOrganizationState inline />
        </div>
      </Layout>
    );
  }

  const viewButtons = [
    { key: "lista" as const, icon: "📋", label: "Lista" },
    { key: "dashboard" as const, icon: "📊", label: "Dashboard" },
    { key: "renovacoes" as const, icon: "🔄", label: "Renovações" },
    { key: "assinaturas" as const, icon: "✍️", label: "Assinaturas" },
    { key: "documentos" as const, icon: "📎", label: "Documentos" },
    { key: "minutas" as const, icon: "📄", label: "Minutas" },
  ];

  return (
    <Layout fullWidth>
      <div className="flex flex-col h-full">
        <ModuleAlertsBanner alerts={contractAlerts} onDismiss={dismissContractAlert} onAction={() => {}} onAlertClick={(alert) => {
          const entityIds = alert.action_config?.entity_ids as string[] | undefined;
          const contractId = entityIds?.[0] || alert.entity_id;
          if (contractId) navigate(`/client-contracts?open=${contractId}`);
        }} />

        {/* Header */}
        <div className="flex-shrink-0 p-4 md:p-6 border-b bg-background">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">Contratos</h1>
              <p className="text-muted-foreground text-sm">Gestão de contratos, assinaturas digitais e renovações</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate("/contract-templates")}>
                <Settings className="h-4 w-4 mr-2" /> Templates
              </Button>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" /> Exportar
              </Button>
              <PermissionGate permission="client_contracts.create">
                <Button size="sm" onClick={() => setIsDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" /> Novo Contrato
                </Button>
              </PermissionGate>
            </div>
          </div>
        </div>

        {/* Workflow Bar */}
        <ContractsWorkflowBar />

        {/* Alert Bars */}
        <ContractsAlertBars
          contracts={contracts}
          expiringDays={alertSettings.get("contract_expiring", 30).days_threshold}
          expiringUrgentDays={alertSettings.get("contract_expiring_urgent", 7).days_threshold}
          expiringEnabled={alertSettings.get("contract_expiring", 30).is_active}
          expiringUrgentEnabled={alertSettings.get("contract_expiring_urgent", 7).is_active}
          draftStaleEnabled={alertSettings.get("contract_draft_stale", 3).is_active}
          draftStaleDays={alertSettings.get("contract_draft_stale", 3).days_threshold}
          expiredEnabled={alertSettings.get("contract_expired").is_active}
          sentNoSignEnabled={alertSettings.get("contract_sent_no_sign", 5).is_active}
          sentNoSignDays={alertSettings.get("contract_sent_no_sign", 5).days_threshold}
          onAction={(action, c) => {
            if (action === "send_signature" && c) handleOpenSendChannel(c);
            if (action === "view_client" && c) navigate("/clients");
            if (action === "followup" && c) toast.info(`Follow-up ${c._clientName}`);
          }}
        />

        {/* View Toggle + Summary */}
        <div className="flex-shrink-0 px-4 md:px-6 pt-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            {viewButtons.map(v => (
              <Button
                key={v.key}
                variant={viewMode === v.key ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode(v.key)}
                className="text-xs"
              >
                {v.icon} {v.label}
              </Button>
            ))}
          </div>
          <div className="text-sm text-muted-foreground">
            Total: <strong>{kpis.total}</strong> · Valor: <strong className="text-primary">{formatCurrency(kpis.totalValue)}</strong> · Activos: <strong className="text-green-600">{formatCurrency(kpis.activeValue)}</strong>
          </div>
        </div>

        {/* KPIs */}
        <div className="flex-shrink-0 p-4 md:px-6">
          <div className="flex flex-wrap gap-3">
          <Card className={`min-w-[120px] flex-1 cursor-pointer transition-all hover:shadow-md ${statusFilter === "all" ? "ring-2 ring-primary" : ""}`} onClick={() => setStatusFilter("all")}>
            <CardContent className="p-3">
              <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">TOTAL CONTRATOS</p>
              <p className="text-2xl font-black">{kpis.total}</p>
              <p className="text-[10px] text-muted-foreground">{formatCurrency(kpis.totalValue)}</p>
            </CardContent>
          </Card>
          <Card className={`min-w-[120px] flex-1 cursor-pointer transition-all hover:shadow-md ${statusFilter === "draft" ? "ring-2 ring-yellow-400" : ""}`} onClick={() => setStatusFilter(statusFilter === "draft" ? "all" : "draft")}>
            <CardContent className="p-3">
              <p className="text-[10px] uppercase font-semibold text-yellow-600 tracking-wider">DRAFT</p>
              <p className="text-2xl font-black text-yellow-600">{kpis.drafts.length}</p>
              <p className="text-[10px] text-muted-foreground">{formatCurrency(kpis.draftValue)}</p>
            </CardContent>
          </Card>
          <Card className={`min-w-[120px] flex-1 cursor-pointer transition-all hover:shadow-md ${statusFilter === "sent" ? "ring-2 ring-blue-400" : ""}`} onClick={() => setStatusFilter(statusFilter === "sent" ? "all" : "sent")}>
            <CardContent className="p-3">
              <p className="text-[10px] uppercase font-semibold text-blue-600 tracking-wider">ENVIADO</p>
              <p className="text-2xl font-black text-blue-600">{kpis.sent.length}</p>
              <p className="text-[10px] text-muted-foreground">{formatCurrency(kpis.sentValue)}</p>
            </CardContent>
          </Card>
          <Card className={`min-w-[120px] flex-1 cursor-pointer transition-all hover:shadow-md ${statusFilter === "signed" ? "ring-2 ring-green-400" : ""}`} onClick={() => setStatusFilter(statusFilter === "signed" ? "all" : "signed")}>
            <CardContent className="p-3">
              <p className="text-[10px] uppercase font-semibold text-green-600 tracking-wider">ASSINADO</p>
              <p className="text-2xl font-black text-green-600">{kpis.signed.length}</p>
              <p className="text-[10px] text-muted-foreground">{formatCurrency(kpis.signedValue)}</p>
            </CardContent>
          </Card>
          <Card className={`min-w-[120px] flex-1 cursor-pointer transition-all hover:shadow-md ${statusFilter === "expired" ? "ring-2 ring-red-400" : ""}`} onClick={() => setStatusFilter(statusFilter === "expired" ? "all" : "expired")}>
            <CardContent className="p-3">
              <p className="text-[10px] uppercase font-semibold text-red-600 tracking-wider">EXPIRADO</p>
              <p className="text-2xl font-black text-red-600">{kpis.expired.length}</p>
              <p className="text-[10px] text-muted-foreground">{formatCurrency(kpis.expiredValue)}</p>
            </CardContent>
          </Card>
          <Card className="min-w-[120px] flex-1">
            <CardContent className="p-3">
              <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">VALOR ACTIVO</p>
              <p className="text-xl font-black text-green-600">{formatCurrency(kpis.activeValue)}</p>
              
            </CardContent>
          </Card>
          <Card className="min-w-[120px] flex-1">
            <CardContent className="p-3">
              <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">VALOR MÉDIO</p>
              <p className="text-xl font-black">{formatCurrency(kpis.avgValue)}</p>
            </CardContent>
          </Card>
          <Card className="min-w-[120px] flex-1">
            <CardContent className="p-3">
              <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">TAXA ASSINATURA</p>
              <p className="text-2xl font-black text-primary">{kpis.signRate}%</p>
              <p className="text-[10px] text-muted-foreground">{kpis.signed.length}/{kpis.sent.length + kpis.signed.length} assinados</p>
            </CardContent>
          </Card>
          <Card className={`min-w-[120px] flex-1 cursor-pointer transition-all hover:shadow-md ${statusFilter === "expiring" ? "ring-2 ring-orange-400" : ""}`} onClick={() => setStatusFilter(statusFilter === "expiring" ? "all" : "expiring")}>
            <CardContent className="p-3">
              <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">A EXPIRAR (90D)</p>
              <p className={`text-2xl font-black ${kpis.expiring90.length > 0 ? "text-orange-600" : ""}`}>{kpis.expiring90.length}</p>
              <p className="text-[10px] text-muted-foreground">{kpis.expiring90.length === 0 ? "Sem urgentes" : "Renovações urgentes"}</p>
            </CardContent>
          </Card>
          <Card className="min-w-[120px] flex-1">
            <CardContent className="p-3">
              <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">TEMPO MÉDIO</p>
              <p className="text-2xl font-black">{kpis.avgSignDays}d</p>
              <p className="text-[10px] text-muted-foreground">Envio → Assinatura</p>
            </CardContent>
          </Card>

          </div>
        </div>

        {/* Smart Suggestion */}
        {smartSuggestion.text && (
          <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
            <CardContent className="p-4 flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm">{smartSuggestion.text}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {smartSuggestion.actions.map((a, i) => (
                  <Button key={i} size="sm" variant={i === 0 ? "default" : "outline"} onClick={() => toast.info(a.label)}>
                    {a.label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters (only for lista view) */}
        {viewMode === "lista" && (
          <div className="flex-shrink-0 px-4 md:px-6 pb-3 space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[250px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Procurar por número, cliente, NIF, proposta..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button
                variant={onlyMine ? "default" : "outline"}
                size="sm"
                onClick={() => setOnlyMine(!onlyMine)}
              >
                👤 Só os meus
              </Button>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32 h-9">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="pending_signature">Enviado</SelectItem>
                  <SelectItem value="signed">Assinado</SelectItem>
                  <SelectItem value="expired">Expirado</SelectItem>
                  <SelectItem value="expiring">A expirar</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline" size="sm"
                className="border-yellow-300 text-yellow-700"
                onClick={() => setStatusFilter("draft")}
              >
                📝 Drafts pendentes
              </Button>
              <Button
                variant="outline" size="sm"
                className="border-orange-300 text-orange-700"
                onClick={() => setStatusFilter("expiring")}
              >
                📦 A expirar
              </Button>
              <Button
                variant="outline" size="sm"
                className="border-red-300 text-red-700"
                onClick={() => setStatusFilter("expired")}
              >
                ⚙️ Expirados
              </Button>
              <Button
                variant="outline" size="sm"
                className="border-blue-300 text-blue-700"
                onClick={() => setStatusFilter("pending_signature")}
              >
                ✍️ A aguardar assinatura
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 gap-1.5 font-normal">
                    <CalendarIcon className="h-4 w-4" />
                    {dateFrom && dateTo
                      ? `${format(dateFrom, 'dd/MM/yy')} - ${format(dateTo, 'dd/MM/yy')}`
                      : dateFrom
                      ? `Desde ${format(dateFrom, 'dd/MM/yy')}`
                      : dateTo
                      ? `Até ${format(dateTo, 'dd/MM/yy')}`
                      : 'Data'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    selected={{ from: dateFrom, to: dateTo }}
                    onSelect={(range: any) => {
                      setDateFrom(range?.from);
                      setDateTo(range?.to);
                    }}
                    numberOfMonths={2}
                    locale={pt}
                  />
                  {(dateFrom || dateTo) && (
                    <div className="p-2 border-t flex justify-end">
                      <Button variant="ghost" size="sm" onClick={() => { setDateFrom(undefined); setDateTo(undefined); }}>
                        Limpar datas
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>

            {/* Bulk Actions */}
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg border border-primary/20">
                <span className="text-sm font-medium">{selectedIds.size} seleccionado{selectedIds.size > 1 ? "s" : ""}</span>
                <Button size="sm" variant="outline" onClick={() => {
                  const first = contracts.find(c => selectedIds.has(c.id));
                  if (first) handleOpenSendChannel(first);
                }}><Send className="h-3 w-3 mr-1" /> Enviar</Button>
                <Button size="sm" variant="outline" onClick={() => toast.info("Exportar")}><Download className="h-3 w-3 mr-1" /> Exportar</Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Limpar</Button>
              </div>
            )}
          </div>
        )}

        {/* Views */}
        <div className="flex-1 overflow-auto px-4 md:px-6 pb-4 min-h-[340px]">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : viewMode === "dashboard" ? (
          <ContractsDashboardView contracts={contracts} />
        ) : viewMode === "renovacoes" ? (
          <ContractsRenewalsView contracts={contracts} onAction={(action, c) => {
            if (action === "sign_first" && c) { setSigningContractId(c.id); setIsSignConfirmOpen(true); }
            else toast.info(`${action} - ${c?.contract_number}`);
          }} />
        ) : viewMode === "assinaturas" ? (
          <ContractsSignaturesView contracts={contracts} onAction={(action, c) => {
            if (action === "mark_signed" && c) { setSigningContractId(c.id); setIsSignConfirmOpen(true); }
            else if ((action === "send_signature" || action === "resend") && c) handleOpenSendChannel(c);
            else toast.info(`${action} - ${c?.contract_number}`);
          }} />
        ) : viewMode === "documentos" ? (
          <ContractsDocumentsView contracts={contracts} />
        ) : viewMode === "minutas" ? (
          <div className="text-center py-8">
            <Button onClick={() => navigate("/contract-templates")} className="gap-1.5">
              <Settings className="h-4 w-4" /> Gerir Minutas / Templates
            </Button>
          </div>
        ) : (
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"><Checkbox onCheckedChange={(checked) => {
                    if (checked) setSelectedIds(new Set(filteredContracts.map(c => c.id)));
                    else setSelectedIds(new Set());
                  }} /></TableHead>
                  <TableHead>NÚMERO</TableHead>
                  <TableHead>CLIENTE</TableHead>
                  <TableHead>PROPOSTA</TableHead>
                  <TableHead>VALOR</TableHead>
                  <TableHead>PERÍODO</TableHead>
                  <TableHead>PROGRESSO</TableHead>
                  <TableHead>RENOVAÇÃO</TableHead>
                  <TableHead>ESTADO</TableHead>
                  <TableHead>ASSINATURA</TableHead>
                  <TableHead>EMAIL</TableHead>
                  <TableHead>PIPELINE</TableHead>
                  <TableHead>PORTAL</TableHead>
                  <TableHead>COMERCIAL</TableHead>
                  <TableHead className="text-right">ACÇÕES</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContracts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={15} className="text-center py-12 text-muted-foreground">
                      <FileSignature className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>Nenhum contrato encontrado</p>
                    </TableCell>
                  </TableRow>
                ) : filteredContracts.map(contract => {
                  const subtitle = getSubtitle(contract);
                  const initials = (contract._clientName || "?").split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
                  return (
                    <TableRow key={contract.id} className={getRowColor(contract)}>
                      <TableCell><Checkbox checked={selectedIds.has(contract.id)} onCheckedChange={() => toggleSelection(contract.id)} /></TableCell>
                      <TableCell>
                        <div>
                          <button
                            className="font-mono font-semibold text-primary hover:underline cursor-pointer text-left"
                            onClick={() => handleEdit(contract)}
                          >
                            {contract.contract_number || "-"}
                          </button>
                          {subtitle && <p className="text-[10px] text-muted-foreground mt-0.5 max-w-[140px]">{subtitle}</p>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                            {initials}
                          </div>
                          <div>
                            <p className="text-sm font-medium">{getClientName(contract)}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {contract.proposals ? (
                          <Badge variant="outline" className="text-xs cursor-pointer hover:bg-primary/10" onClick={() => navigate("/proposals")}>
                            {contract.proposals.title || "Proposta"}
                          </Badge>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <span className={`font-semibold ${contract.status === "expired" ? "line-through text-muted-foreground" : "text-primary"}`}>
                          {formatContractCurrency(getEffectiveContractValue(contract), contract.currency)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs">
                          {contract.start_date ? new Date(contract.start_date).toLocaleDateString("pt-PT") : "—"}
                          <br />
                          {contract.end_date ? new Date(contract.end_date).toLocaleDateString("pt-PT") : "Indeterminado"}
                        </div>
                      </TableCell>
                      <TableCell>{getProgressBar(contract)}</TableCell>
                      <TableCell>{getRenewalBadge(contract)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={statusColors[contract.status] || ""}>
                          {statusEmojis[contract.status]} {getTranslatedStatus(contract.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>{getSignatureBadge(contract)}</TableCell>
                      <TableCell>
                        {contract._clientEmail ? (
                          <span className="text-xs">{contract._clientEmail}</span>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell><ContractsPipelineMini contract={contract} /></TableCell>
                      <TableCell>
                        <PortalStatusBadge status={contractPortalStatuses[contract.id] || null} />
                      </TableCell>
                      <TableCell>
                        {contract.assigned_to_name ? (
                          <div className="flex items-center gap-1.5">
                            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-[9px] font-bold text-primary">
                              {contract.assigned_to_name.split(" ").map((w: string) => w[0]).join("").slice(0, 2)}
                            </div>
                            <span className="text-xs">{contract.assigned_to_name.split(" ")[0]}</span>
                          </div>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Quick actions by status */}
                          {contract.status === "draft" && (
                            <>
                              <Button variant="ghost" size="icon" className="text-blue-600" title="Enviar para assinatura" onClick={() => handleOpenSendChannel(contract)}>
                                <Send className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleEdit(contract)} title="Editar">
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="text-green-600" title="Marcar como assinado" onClick={() => { setSigningContractId(contract.id); setIsSignConfirmOpen(true); }}>
                                <CheckCheck className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {contract.status === "pending_signature" && (
                            <>
                              <Button variant="ghost" size="icon" className="text-yellow-600" title="Follow-up" onClick={() => toast.info("Follow-up")}>
                                <Phone className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" title="Reenviar" onClick={() => handleOpenSendChannel(contract)}>
                                <Send className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="text-green-600" title="Marcar como assinado" onClick={() => { setSigningContractId(contract.id); setIsSignConfirmOpen(true); }}>
                                <CheckCheck className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {(contract.status === "signed" || contract.status === "active") && (
                            <>
                              <Button variant="ghost" size="icon" title="Ver contrato" onClick={() => handleEdit(contract)}><Eye className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" title="PDF"><Download className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" className="text-green-600" title="Ver cliente" onClick={() => navigate("/clients")}>
                                <User className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {contract.status === "expired" && (
                            <>
                              <Button variant="ghost" size="icon" className="text-red-600 animate-pulse" title="Contactar" onClick={() => toast.info("Contactar")}>
                                <Phone className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" title="Renovar" onClick={() => toast.info("Renovar")}>
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            </>
                          )}

                          {/* Dropdown */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                              {contract.status === "draft" && (
                                <>
                                  <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase">✈️ Envio</DropdownMenuLabel>
                                  <DropdownMenuItem onClick={() => handleOpenSendChannel(contract)}>✈️ Enviar para assinatura</DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase">📊 Avançar</DropdownMenuLabel>
                                  <DropdownMenuItem onClick={() => handleStatusChange(contract.id, "pending_signature")}>📨 Marcar como Enviado</DropdownMenuItem>
                                  <DropdownMenuItem className="text-green-600 font-medium" onClick={() => { setSigningContractId(contract.id); setIsSignConfirmOpen(true); }}>
                                    ✅ Marcar como Assinado
                                    <span className="text-[10px] text-muted-foreground ml-1">⚡ Converte contacto em cliente</span>
                                  </DropdownMenuItem>
                                   <DropdownMenuSeparator />
                                   <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase">🔗 Portal</DropdownMenuLabel>
                                   <DropdownMenuItem disabled={portalAccessLoading} onClick={(e) => { e.preventDefault(); generatePortalAccess("contract", contract.id); }}>
                                     <Send className="w-3.5 h-3.5 mr-2 text-purple-600" /> Enviar para Portal Cliente
                                   </DropdownMenuItem>
                                   <DropdownMenuItem onClick={async (e) => { e.preventDefault(); await navigator.clipboard.writeText(`${window.location.origin}/auth`); toast.success("Link do portal copiado!"); }}>
                                     🔗 Copiar link do portal
                                   </DropdownMenuItem>
                                   <DropdownMenuSeparator />
                                   <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase">📋 Acções</DropdownMenuLabel>
                                   <DropdownMenuItem onClick={() => handleEdit(contract)}>✏️ Editar contrato</DropdownMenuItem>
                                   <DropdownMenuItem onClick={() => handleDownloadPdf(contract)}>📥 Download PDF</DropdownMenuItem>
                                   <DropdownMenuItem>📄 Duplicar contrato</DropdownMenuItem>
                                   <DropdownMenuItem>👤 Reatribuir comercial</DropdownMenuItem>
                                   <DropdownMenuSeparator />
                                   <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase">🔗 Relacionados</DropdownMenuLabel>
                                  <DropdownMenuItem onClick={() => navigate("/proposals")}>📑 Ver proposta</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => navigate("/quotes")}>📊 Ver orçamentos</DropdownMenuItem>
                                  <DropdownMenuItem className="text-muted-foreground">👤 Ver cliente (não criado)</DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem className="text-destructive" onClick={() => { setDeleteId(contract.id); setIsDeleteOpen(true); }}>
                                    🗑 Eliminar
                                  </DropdownMenuItem>
                                </>
                              )}
                              {(contract.status === "signed" || contract.status === "active") && (
                                <>
                                  <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase">👤 Cliente</DropdownMenuLabel>
                                  <DropdownMenuItem className="text-green-600 font-medium" onClick={() => navigate("/clients")}>👤 Ver ficha do cliente (workflow)</DropdownMenuItem>
                                  <DropdownMenuItem>📧 Enviar email ao cliente</DropdownMenuItem>
                                  <DropdownMenuItem>📱 WhatsApp</DropdownMenuItem>
                                   <DropdownMenuSeparator />
                                   <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase">🔗 Portal</DropdownMenuLabel>
                                   <DropdownMenuItem disabled={portalAccessLoading} onClick={(e) => { e.preventDefault(); generatePortalAccess("contract", contract.id); }}>
                                     <Send className="w-3.5 h-3.5 mr-2 text-purple-600" /> Enviar para Portal Cliente
                                   </DropdownMenuItem>
                                   <DropdownMenuItem onClick={async (e) => { e.preventDefault(); await navigator.clipboard.writeText(`${window.location.origin}/auth`); toast.success("Link do portal copiado!"); }}>
                                     🔗 Copiar link do portal
                                   </DropdownMenuItem>
                                   <DropdownMenuSeparator />
                                   <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase">📋 Acções</DropdownMenuLabel>
                                  <DropdownMenuItem onClick={() => handleDownloadPdf(contract)}>📥 Download PDF</DropdownMenuItem>
                                  <DropdownMenuItem>📄 Duplicar (novo baseado neste)</DropdownMenuItem>
                                  <DropdownMenuItem>🔄 Renovar contrato (novas datas)</DropdownMenuItem>
                                  <DropdownMenuItem>📊 Novo Pedido de Proposta (upselling)</DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase">🔗 Relacionados</DropdownMenuLabel>
                                  <DropdownMenuItem onClick={() => navigate("/proposals")}>📑 Ver proposta</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => navigate("/quotes")}>📊 Ver orçamentos</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => navigate("/clients")}>👤 Ver cliente</DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem className="text-muted-foreground" disabled>🗑 Eliminar (assinado não pode ser eliminado)</DropdownMenuItem>
                                </>
                              )}
                              {contract.status === "pending_signature" && (
                                <>
                                  <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase">📊 Avançar</DropdownMenuLabel>
                                  <DropdownMenuItem className="text-green-600 font-medium" onClick={() => { setSigningContractId(contract.id); setIsSignConfirmOpen(true); }}>
                                    ✅ Marcar como Assinado
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleOpenSendChannel(contract)}>📧 Reenviar</DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                   <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase">🔗 Portal</DropdownMenuLabel>
                                   <DropdownMenuItem disabled={portalAccessLoading} onClick={(e) => { e.preventDefault(); generatePortalAccess("contract", contract.id); }}>
                                     <Send className="w-3.5 h-3.5 mr-2 text-purple-600" /> Enviar para Portal Cliente
                                   </DropdownMenuItem>
                                   <DropdownMenuItem onClick={async (e) => { e.preventDefault(); await navigator.clipboard.writeText(`${window.location.origin}/auth`); toast.success("Link do portal copiado!"); }}>
                                     🔗 Copiar link do portal
                                   </DropdownMenuItem>
                                   <DropdownMenuSeparator />
                                   <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase">📋 Acções</DropdownMenuLabel>
                                  <DropdownMenuItem onClick={() => handleDownloadPdf(contract)}>📥 Download PDF</DropdownMenuItem>
                                  <DropdownMenuItem>📄 Duplicar</DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase">🔗 Relacionados</DropdownMenuLabel>
                                  <DropdownMenuItem onClick={() => navigate("/proposals")}>📑 Ver proposta</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => navigate("/quotes")}>📊 Ver orçamentos</DropdownMenuItem>
                                </>
                              )}
                              {contract.status === "expired" && (
                                <>
                                  <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase">🔄 Renovação</DropdownMenuLabel>
                                  <DropdownMenuItem>🔄 Renovar contrato (novas datas)</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleOpenSendChannel(contract)}>📧 Enviar renovação</DropdownMenuItem>
                                  <DropdownMenuItem>📞 Contactar cliente</DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase">📋 Acções</DropdownMenuLabel>
                                  <DropdownMenuItem onClick={() => handleDownloadPdf(contract)}>📥 Download PDF</DropdownMenuItem>
                                  <DropdownMenuItem>📄 Duplicar</DropdownMenuItem>
                                  <DropdownMenuItem>📜 Ver histórico completo</DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase">🔗 Relacionados</DropdownMenuLabel>
                                  <DropdownMenuItem onClick={() => navigate("/proposals")}>📑 Ver proposta</DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => navigate("/clients")}>👤 Ver cliente</DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem className="text-muted-foreground" disabled>🗑 Eliminar (expirado mantém histórico)</DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        </div>



        {/* Sign Confirmation Dialog */}
        <AlertDialog open={isSignConfirmOpen} onOpenChange={setIsSignConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>⚡ Marcar contrato como assinado</AlertDialogTitle>
              <AlertDialogDescription>
                Ao marcar este contrato como assinado, o sistema irá automaticamente converter o contacto associado em cliente.
                Esta ação não pode ser desfeita. Continuar?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleSignConfirm} className="bg-green-600 hover:bg-green-700 text-white">
                ✅ Confirmar assinatura
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <ContractDetailDialog
          open={isDialogOpen}
          onOpenChange={(open) => { if (!open) handleCloseDialog(); else setIsDialogOpen(true); }}
          contract={editingContract}
          proposals={proposals}
          templates={templates}
          onSave={handleDialogSave}
          saving={createMutation.isPending || updateMutation.isPending}
          isNew={!editingContract}
          getProposalName={getProposalName}
          getProposalTotal={getProposalTotal}
          formatCurrency={formatContractCurrency}
          getTranslatedStatus={getTranslatedStatus}
        />

        {/* Delete Confirmation */}
        <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar contrato</AlertDialogTitle>
              <AlertDialogDescription>Esta ação não pode ser desfeita. Tem a certeza?</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Send Channel Dialog */}
        <SendChannelDialog
          open={sendChannelOpen}
          onOpenChange={setSendChannelOpen}
          title={`Enviar ${sendingContract?.contract_number || "contrato"}`}
          description={sendingContract?._clientName ? `Para: ${sendingContract._clientName}` : undefined}
          onSelectEmail={handleSendEmail}
          onSelectWhatsApp={handleSendWhatsApp}
        />

        {/* WhatsApp Dialog */}
        <WhatsAppSendDialog
          open={showWhatsAppDialog}
          onOpenChange={setShowWhatsAppDialog}
          context={whatsAppContext}
        />

        {/* Email Dialog */}
        <SendEntityEmailDialog
          open={showEmailDialog}
          onOpenChange={setShowEmailDialog}
          module="contracts"
          entityId={sendingContract?.entity_id || ""}
          entityName={sendingContract?._clientName || ""}
          entityEmail={sendingContract?._clientEmail || ""}
          organizationId={activeCompany?.id}
          contractId={sendingContract?.id}
        />
      </div>
    </Layout>
  );
};

export default ClientContracts;
