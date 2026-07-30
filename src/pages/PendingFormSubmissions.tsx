import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, FileText, Link2, UserPlus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { sanitizeFieldValue } from "@/utils/sanitize";
import { humanizeFormFieldKey } from "@/lib/leads/fieldLabels";
import {
  resolveLeadDialogFieldDefinitions,
  createSupabaseLeadDialogFieldDefinitionResolverClient,
  type LeadDialogFieldDefinition,
} from "@/lib/leads/fieldDefinitions";

const fieldDefinitionResolverClient = createSupabaseLeadDialogFieldDefinitionResolverClient(supabase);

interface PendingSubmissionRow {
  id: string;
  organization_id: string;
  entity_id: string;
  target_type: "contact" | "client";
  target_id: string;
  campaign_id: string | null;
  form_id: string | null;
  field_values: Record<string, unknown> | null;
  status: string;
  created_at: string;
  targetName: string;
  campaignName: string | null;
  formName: string | null;
  fieldLabels: Record<string, string>;
}

type PendingAction = { submission: PendingSubmissionRow; action: "merge" | "new_lead" } | null;

/**
 * Review queue for public-form resubmissions that create-lead / update-lead
 * classified as belonging to an ALREADY ACTIVE contact/client in this org
 * (see supabase/functions/_shared/entityScopedLookup.ts classifyEntityInOrg).
 * Those submissions never became a new lead automatically; they accumulate
 * here (public.form_submissions) until a reviewer confirms the match or
 * decides a fresh lead should be created instead.
 */
export default function PendingFormSubmissions() {
  const navigate = useNavigate();
  const { activeCompany, isLoading: companyLoading } = useCompany();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const canResolve = hasPermission("leads.create") || hasPermission("leads.edit");

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PendingSubmissionRow[]>([]);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [resolving, setResolving] = useState(false);

  const orgId = activeCompany?.id;

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("form_submissions")
        .select(
          "id, organization_id, entity_id, target_type, target_id, campaign_id, form_id, field_values, status, created_at",
        )
        .eq("organization_id", orgId)
        .is("resolved_at", null)
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      const submissions = data || [];

      const contactIds = submissions.filter((s) => s.target_type === "contact").map((s) => s.target_id);
      const clientIds = submissions.filter((s) => s.target_type === "client").map((s) => s.target_id);
      const campaignIds = Array.from(new Set(submissions.map((s) => s.campaign_id).filter(Boolean))) as string[];
      const formIds = Array.from(new Set(submissions.map((s) => s.form_id).filter(Boolean))) as string[];

      const [contactNames, clientNames, campaignNames, formNames] = await Promise.all([
        contactIds.length
          ? supabase
              .from("anew_contacts")
              .select("id, entity_id, anew_entities(display_name)")
              .in("id", contactIds)
          : Promise.resolve({ data: [] as any[] }),
        clientIds.length
          ? supabase
              .from("anew_clients")
              .select("id, entity_id, anew_entities(display_name)")
              .in("id", clientIds)
          : Promise.resolve({ data: [] as any[] }),
        campaignIds.length
          ? supabase.from("campaigns").select("id, name").in("id", campaignIds)
          : Promise.resolve({ data: [] as any[] }),
        formIds.length
          ? supabase.from("forms").select("id, name").in("id", formIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const contactNameById = Object.fromEntries(
        (contactNames.data || []).map((c: any) => [c.id, c.anew_entities?.display_name || "Contacto sem nome"]),
      );
      const clientNameById = Object.fromEntries(
        (clientNames.data || []).map((c: any) => [c.id, c.anew_entities?.display_name || "Cliente sem nome"]),
      );
      const campaignNameById = Object.fromEntries((campaignNames.data || []).map((c: any) => [c.id, c.name]));
      const formNameById = Object.fromEntries((formNames.data || []).map((f: any) => [f.id, f.name]));

      // Field-label resolution — same mechanism as AnewLeads.tsx's "Formulários" tab.
      const definitionsByCampaign: Record<string, LeadDialogFieldDefinition[]> = {};
      const hasNoCampaignSubmission = submissions.some((s) => !s.campaign_id);
      await Promise.all([
        ...campaignIds.map(async (campaignId) => {
          definitionsByCampaign[campaignId] = await resolveLeadDialogFieldDefinitions(
            { campaignId, organizationId: orgId },
            fieldDefinitionResolverClient,
          );
        }),
        hasNoCampaignSubmission
          ? (async () => {
              definitionsByCampaign["__org__"] = await resolveLeadDialogFieldDefinitions(
                { organizationId: orgId },
                fieldDefinitionResolverClient,
              );
            })()
          : Promise.resolve(),
      ]);

      const mapped: PendingSubmissionRow[] = submissions.map((s: any) => {
        const definitions = s.campaign_id
          ? definitionsByCampaign[s.campaign_id] || []
          : definitionsByCampaign["__org__"] || [];
        const fieldLabels = Object.fromEntries(definitions.map((d) => [d.field_key, d.field_label]));
        const targetName =
          s.target_type === "contact"
            ? contactNameById[s.target_id] || "Contacto"
            : clientNameById[s.target_id] || "Cliente";

        return {
          ...s,
          targetName,
          campaignName: s.campaign_id ? campaignNameById[s.campaign_id] || null : null,
          formName: s.form_id ? formNameById[s.form_id] || null : null,
          fieldLabels,
        };
      });

      setRows(mapped);
    } catch (err) {
      console.error("[PendingFormSubmissions] load failed:", err);
      toast({ variant: "destructive", title: "Erro ao carregar submissões pendentes" });
    } finally {
      setLoading(false);
    }
  }, [orgId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const confirmResolve = async () => {
    if (!pendingAction) return;
    setResolving(true);
    try {
      const { error } = await supabase.rpc("rpc_resolve_form_submission", {
        p_submission_id: pendingAction.submission.id,
        p_action: pendingAction.action,
      });
      if (error) throw error;

      toast({
        title:
          pendingAction.action === "merge"
            ? "Submissão associada ao registo existente"
            : "Nova lead criada a partir da submissão",
      });
      setRows((prev) => prev.filter((r) => r.id !== pendingAction.submission.id));
    } catch (err: any) {
      console.error("[PendingFormSubmissions] resolve failed:", err);
      toast({ variant: "destructive", title: "Erro ao resolver submissão", description: err?.message });
    } finally {
      setResolving(false);
      setPendingAction(null);
    }
  };

  if (companyLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <OlyviaLoader size={32} />
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="container mx-auto py-6">
        <NoOrganizationState inline />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="-ml-2">
        <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
      </Button>

      <div className="flex items-center gap-3">
        <FileText className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-bold">Submissões de formulário pendentes</h1>
          <p className="text-sm text-muted-foreground">
            Pessoas que voltaram a preencher um formulário público mas já são contactos/clientes ativos nesta
            organização. Confirme a associação ou crie uma nova lead se o registo estiver errado.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Pendentes <Badge variant="secondary" className="ml-2">{rows.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex justify-center py-8">
              <OlyviaLoader size={24} inline />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Sem submissões pendentes de revisão.
            </p>
          ) : (
            rows.map((row) => {
              const entries = Object.entries(row.field_values || {}).filter(([key]) => key !== "_meta");
              return (
                <Card key={row.id}>
                  <CardContent className="py-3 px-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="capitalize">
                          {row.target_type === "contact" ? "Contacto" : "Cliente"}
                        </Badge>
                        <p className="text-sm font-medium">{row.targetName}</p>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        {row.campaignName && <span>{row.campaignName}</span>}
                        {row.formName && <span>· {row.formName}</span>}
                        <span>{new Date(row.created_at).toLocaleString("pt-PT")}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                      {entries.length === 0 ? (
                        <p className="text-xs text-muted-foreground col-span-2">Sem valores submetidos.</p>
                      ) : (
                        entries.map(([key, value]) => (
                          <div
                            key={key}
                            className="flex items-baseline justify-between gap-2 text-xs border-b border-dashed py-1"
                          >
                            <span className="text-muted-foreground">
                              {row.fieldLabels[key] || humanizeFormFieldKey(key)}
                            </span>
                            <span className="font-medium text-right">{sanitizeFieldValue(value)}</span>
                          </div>
                        ))
                      )}
                    </div>

                    {canResolve && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPendingAction({ submission: row, action: "merge" })}
                        >
                          <Link2 className="h-3.5 w-3.5 mr-1" />
                          Associar ao {row.target_type === "contact" ? "contacto" : "cliente"} existente
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPendingAction({ submission: row, action: "new_lead" })}
                        >
                          <UserPlus className="h-3.5 w-3.5 mr-1" />
                          Criar como lead nova
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!pendingAction} onOpenChange={(open) => !open && setPendingAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingAction?.action === "merge" ? "Associar ao registo existente" : "Criar como lead nova"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction?.action === "merge"
                ? `Os valores submetidos serão registados como uma nota no registo de ${pendingAction?.submission.targetName}. A submissão deixa de aparecer nesta lista.`
                : `Será criada uma nova lead com os valores submetidos, independente do ${pendingAction?.submission.target_type === "contact" ? "contacto" : "cliente"} existente. A submissão deixa de aparecer nesta lista.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resolving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmResolve} disabled={resolving}>
              {resolving ? "A processar…" : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
