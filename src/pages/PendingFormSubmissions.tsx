import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, FileText, Link2, Lock, Mail, Phone } from "lucide-react";
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
import { captureFlowError } from "@/lib/observability/captureFlowError";

const fieldDefinitionResolverClient = createSupabaseLeadDialogFieldDefinitionResolverClient(supabase);

const PENDING_SUBMISSION_COLUMNS =
  "id, organization_id, entity_id, target_type, target_id, campaign_id, form_id, field_values, status, created_at";

const TARGET_TYPE_LABELS: Record<string, string> = {
  lead: "Lead",
  contact: "Contacto",
  client: "Cliente",
};

/** Identidade candidata mostrada num conflito: nome + os contactos que a tornaram candidata. */
interface ConflictCandidate {
  id: string;
  name: string;
  emails: string[];
  phones: string[];
}

interface PendingSubmissionRow {
  id: string;
  organization_id: string;
  entity_id: string;
  target_type: "lead" | "contact" | "client";
  /** O que coincidiu com a ficha existente: "email", "telefone", "ambos" ou "conflito". */
  matchedBy: "email" | "telefone" | "ambos" | "conflito" | null;
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
  /** Entidade a que a submissão está ligada (a do email, no caso 06). */
  conflictingEntityId: string | null;
  /** [entidade do email, entidade do telefone] — só preenchido em conflito. */
  candidates: ConflictCandidate[] | null;
}

/**
 * Só há uma acção: registar na ficha. NÃO se oferece "criar lead nova".
 *
 * A invariante do produto é que uma entidade não tem mais do que UMA lead. A
 * acção `new_lead` da RPC insere uma lead apontada à MESMA entidade — não
 * separa a pessoa em duas, cria-lhe uma segunda lead, que é exactamente o que
 * se quer evitar. Quando uma submissão bate com quem já existe, o que acontece
 * é avisar o comercial; não nasce lead nenhuma.
 *
 * A RPC mantém o ramo `new_lead` (é dela, e outros caminhos podem precisar);
 * o que se retira é o botão que o chamava daqui.
 */
type PendingAction = { submission: PendingSubmissionRow; action: "merge" } | null;

/**
 * A fila mostra TODAS as submissões por resolver, não só as duvidosas.
 *
 * É essa a utilidade dela para quem vende: ver quais das suas leads e dos seus
 * clientes voltaram a preencher o formulário. Quem vê o quê é decidido pela
 * política de leitura de `form_submissions`, que segue o âmbito do utilizador
 * — as suas fichas, as da equipa, ou as da organização.
 *
 * As duvidosas — email a apontar a uma pessoa, telefone a outra — distinguem-se
 * dentro da lista, com as duas candidatas lado a lado, e sobem ao topo. Não são
 * um filtro; são um caso à parte dentro do mesmo sítio.
 *
 * `conflicting_entity_id` só existe a partir da migration 20261116050000.
 * Enquanto ela não estiver aplicada o PostgREST recusa a coluna, e a fila tem
 * de continuar a funcionar sem a marca de conflito em vez de ficar vazia.
 */
async function fetchPendingSubmissions(organizationId: string): Promise<any[]> {
  // Cast deliberado: a coluna ainda não existe nos tipos gerados.
  const withConflict = await (supabase as any)
    .from("form_submissions")
    .select(`${PENDING_SUBMISSION_COLUMNS}, conflicting_entity_id`)
    .eq("organization_id", organizationId)
    .is("resolved_at", null)
    .order("created_at", { ascending: false })
    .limit(200);

  if (!withConflict.error) return withConflict.data || [];

  const missingColumn =
    withConflict.error.code === "42703" ||
    withConflict.error.code === "PGRST204" ||
    /conflicting_entity_id/.test(withConflict.error.message || "");
  if (!missingColumn) throw withConflict.error;

  const { data, error } = await supabase
    .from("form_submissions")
    .select(PENDING_SUBMISSION_COLUMNS)
    .eq("organization_id", organizationId)
    .is("resolved_at", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data || [];
}

/** Nome, emails e telefones de cada entidade candidata, para quem lê perceber a dúvida. */
async function fetchConflictCandidates(entityIds: string[]): Promise<Record<string, ConflictCandidate>> {
  if (entityIds.length === 0) return {};

  const [entities, emails, phones] = await Promise.all([
    supabase.from("anew_entities").select("id, display_name").in("id", entityIds),
    supabase.from("anew_entity_emails").select("entity_id, email, is_primary").in("entity_id", entityIds),
    supabase.from("anew_entity_phones").select("entity_id, phone_number, is_primary").in("entity_id", entityIds),
  ]);

  const byId: Record<string, ConflictCandidate> = Object.fromEntries(
    entityIds.map((id) => [id, { id, name: "Entidade sem nome", emails: [], phones: [] }]),
  );
  for (const entity of entities.data || []) {
    const candidate = byId[entity.id];
    if (candidate) candidate.name = entity.display_name || "Entidade sem nome";
  }
  for (const row of (emails.data || []) as any[]) {
    const candidate = byId[row.entity_id];
    if (candidate && row.email) candidate.emails = [...candidate.emails, row.email];
  }
  for (const row of (phones.data || []) as any[]) {
    const candidate = byId[row.entity_id];
    if (candidate && row.phone_number) candidate.phones = [...candidate.phones, row.phone_number];
  }
  return byId;
}

interface ConflictCandidatesProps {
  candidates: ConflictCandidate[];
  linkedEntityId: string;
  canResolve: boolean;
  onMergeLinked: () => void;
}

/**
 * CONFLITO (06): o email apontou para uma entidade e o telefone para outra.
 * Mostram-se as duas lado a lado — nome, email e telefone de cada — para quem
 * revê perceber a dúvida antes de decidir.
 *
 * LIMITE CONHECIDO: rpc_resolve_form_submission (20261111240000) escreve
 * sempre em v_sub.entity_id; não aceita nenhum parâmetro de entidade. Associar
 * à SEGUNDA candidata exige alterar a RPC, ou seja uma migration — fica para
 * outra fase. Até lá o botão dessa candidata está desativado e diz porquê, em
 * vez de fingir uma escolha que a base de dados não executa.
 */
function ConflictCandidates({ candidates, linkedEntityId, canResolve, onMergeLinked }: ConflictCandidatesProps) {
  return (
    <div className="rounded-md border border-dashed border-amber-500/60 bg-amber-500/5 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <p className="text-xs font-medium text-amber-700 dark:text-amber-500">
          O email e o telefone submetidos apontam para pessoas diferentes.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {candidates.map((candidate) => {
          const isLinked = candidate.id === linkedEntityId;
          return (
            <div
              key={candidate.id}
              className={`rounded-md border bg-background p-3 space-y-2 ${
                isLinked ? "border-amber-500/70" : "border-border"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium leading-tight">{candidate.name}</p>
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {isLinked ? "Pelo email" : "Pelo telefone"}
                </Badge>
              </div>

              <div className="space-y-1">
                {candidate.emails.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sem email registado</p>
                ) : (
                  candidate.emails.slice(0, 3).map((email) => (
                    <p key={email} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Mail className="h-3 w-3 shrink-0" />
                      <span className="truncate">{email}</span>
                    </p>
                  ))
                )}
                {candidate.phones.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sem telefone registado</p>
                ) : (
                  candidate.phones.slice(0, 3).map((phone) => (
                    <p key={phone} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3 shrink-0" />
                      <span className="truncate">{phone}</span>
                    </p>
                  ))
                )}
              </div>

              {canResolve &&
                (isLinked ? (
                  <Button size="sm" variant="outline" className="w-full" onClick={onMergeLinked}>
                    <Link2 className="h-3.5 w-3.5 mr-1" />
                    Associar a este registo
                  </Button>
                ) : (
                  <>
                    <Button size="sm" variant="outline" className="w-full" disabled>
                      <Lock className="h-3.5 w-3.5 mr-1" />
                      Associar a este registo
                    </Button>
                    <p className="text-[10px] text-muted-foreground leading-snug">
                      Ainda não disponível: a resolução só sabe associar ao registo encontrado pelo email. Associar a
                      este exige alterar a base de dados.
                    </p>
                  </>
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
      const submissions = await fetchPendingSubmissions(orgId);

      const contactIds = submissions.filter((s: any) => s.target_type === "contact").map((s: any) => s.target_id);
      const clientIds = submissions.filter((s: any) => s.target_type === "client").map((s: any) => s.target_id);
      const leadIds = submissions.filter((s: any) => s.target_type === "lead").map((s: any) => s.target_id);
      const campaignIds = Array.from(new Set(submissions.map((s: any) => s.campaign_id).filter(Boolean))) as string[];
      const formIds = Array.from(new Set(submissions.map((s: any) => s.form_id).filter(Boolean))) as string[];

      // CONFLITO (06): a submissão está ligada à entidade do email e guarda a
      // do telefone em conflicting_entity_id. Carregam-se AS DUAS.
      const candidateIds = Array.from(
        new Set(
          submissions
            .filter((s: any) => s.conflicting_entity_id)
            .flatMap((s: any) => [s.entity_id, s.conflicting_entity_id])
            .filter(Boolean),
        ),
      ) as string[];

      const [contactNames, clientNames, leadNames, campaignNames, formNames, candidateById] = await Promise.all([
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
        leadIds.length
          ? supabase
              .from("anew_leads")
              .select("id, entity_id, anew_entities(display_name)")
              .in("id", leadIds)
          : Promise.resolve({ data: [] as any[] }),
        campaignIds.length
          ? supabase.from("campaigns").select("id, name").in("id", campaignIds)
          : Promise.resolve({ data: [] as any[] }),
        formIds.length
          ? supabase.from("forms").select("id, name").in("id", formIds)
          : Promise.resolve({ data: [] as any[] }),
        fetchConflictCandidates(candidateIds),
      ]);

      const contactNameById = Object.fromEntries(
        (contactNames.data || []).map((c: any) => [c.id, c.anew_entities?.display_name || "Contacto sem nome"]),
      );
      const clientNameById = Object.fromEntries(
        (clientNames.data || []).map((c: any) => [c.id, c.anew_entities?.display_name || "Cliente sem nome"]),
      );
      const leadNameById = Object.fromEntries(
        ((leadNames as any).data || []).map((l: any) => [l.id, l.anew_entities?.display_name || "Lead sem nome"]),
      );
      const campaignNameById = Object.fromEntries((campaignNames.data || []).map((c: any) => [c.id, c.name]));
      const formNameById = Object.fromEntries((formNames.data || []).map((f: any) => [f.id, f.name]));

      // Field-label resolution — same mechanism as AnewLeads.tsx's "Formulários" tab.
      const definitionsByCampaign: Record<string, LeadDialogFieldDefinition[]> = {};
      const hasNoCampaignSubmission = submissions.some((s: any) => !s.campaign_id);
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
            : s.target_type === "client"
              ? clientNameById[s.target_id] || "Cliente"
              : leadNameById[s.target_id] || "Lead";

        const conflictingEntityId = s.conflicting_entity_id || null;
        // A deteccao de duplicados grava aqui o que coincidiu, no momento em
        // que a submissao entrou. E o que aconteceu de facto, nao uma
        // reconstrucao posterior. Submissoes anteriores a isto vem sem nada,
        // e ficam sem explicacao em vez de inventarem uma.
        const matchedBy = (s.field_values as any)?._meta?.dedup?.por ?? null;

        return {
          ...s,
          targetName,
          matchedBy,
          campaignName: s.campaign_id ? campaignNameById[s.campaign_id] || null : null,
          formName: s.form_id ? formNameById[s.form_id] || null : null,
          fieldLabels,
          conflictingEntityId,
          candidates: conflictingEntityId
            ? [candidateById[s.entity_id], candidateById[conflictingEntityId]].filter(Boolean)
            : null,
        };
      });

      // Os conflitos primeiro: são o único caso que exige mesmo uma decisão
      // humana — o resto da fila é histórico anterior às regras novas.
      const sorted = [...mapped].sort((a, b) => Number(!!b.candidates) - Number(!!a.candidates));
      setRows(sorted);
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
      captureFlowError(err, "form-submission-intake");
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
            As suas leads e os seus clientes que voltaram a preencher um formulário público. Não geraram lead nova —
            a submissão ficou ligada à ficha que já existe. Quando há dúvida, o email aponta para uma pessoa e o
            telefone para outra: essas aparecem assinaladas, com as duas candidatas. Confirme a associação ou crie
            uma nova lead se o registo estiver errado.
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
              const isConflict = !!row.candidates && row.candidates.length > 0;
              return (
                <Card
                  key={row.id}
                  className={isConflict ? "border-l-4 border-l-amber-500" : "border-l-4 border-l-muted-foreground/30"}
                >
                  <CardContent className="py-3 px-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {isConflict && (
                          <Badge variant="destructive" className="text-[10px] gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            Conflito
                          </Badge>
                        )}
                        <Badge variant="outline">{TARGET_TYPE_LABELS[row.target_type] || row.target_type}</Badge>
                        <p className="text-sm font-medium">{row.targetName}</p>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        {row.campaignName && <span>{row.campaignName}</span>}
                        {row.formName && <span>· {row.formName}</span>}
                        <span>{new Date(row.created_at).toLocaleString("pt-PT")}</span>
                      </div>
                    </div>

                    {/* O que coincidiu. Sem isto o cartao mostra o que a pessoa
                        preencheu e nao diz com quem, nem porque. */}
                    {row.matchedBy && row.matchedBy !== "conflito" && (
                      <p className="text-xs text-muted-foreground">
                        Já existe {row.target_type === "client" ? "o cliente" : "a lead"}{" "}
                        <span className="font-medium text-foreground">{row.targetName}</span>
                        {row.matchedBy === "ambos"
                          ? " com o mesmo email e o mesmo telefone."
                          : row.matchedBy === "email"
                            ? " com o mesmo email."
                            : " com o mesmo telefone."}{" "}
                        A submissão já ficou ligada a essa ficha — não foi criada lead nova.
                      </p>
                    )}

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

                    {isConflict && row.candidates && (
                      <ConflictCandidates
                        candidates={row.candidates}
                        linkedEntityId={row.entity_id}
                        canResolve={canResolve}
                        onMergeLinked={() => setPendingAction({ submission: row, action: "merge" })}
                      />
                    )}

                    {canResolve && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {!isConflict && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setPendingAction({ submission: row, action: "merge" })}
                          >
                            <Link2 className="h-3.5 w-3.5 mr-1" />
                            Registar na ficha como nota
                          </Button>
                        )}
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
              Registar na ficha como nota
            </AlertDialogTitle>
            <AlertDialogDescription>
              {`Os valores submetidos ficam como nota na ficha de ${pendingAction?.submission.targetName}. Não são gravados nos campos da ficha — quem quiser alterar o email ou o telefone tem de o fazer à mão. A submissão deixa de aparecer nesta lista.`}
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
