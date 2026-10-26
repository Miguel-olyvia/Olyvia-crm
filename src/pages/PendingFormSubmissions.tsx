import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, CalendarClock, FileText, Link2, Mail, Phone, PlusCircle, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
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
import { chaveDoErroSubmissao, codigoDoErroSubmissao, interpretarRespostaSubmissao } from "./pendingFormSubmissionsErros";

const fieldDefinitionResolverClient = createSupabaseLeadDialogFieldDefinitionResolverClient(supabase);

const S = "pessoasPagina.submissoes.";

const PENDING_SUBMISSION_COLUMNS =
  "id, organization_id, entity_id, target_type, target_id, campaign_id, form_id, field_values, status, created_at";

/** Identidade candidata mostrada num conflito: nome + os contactos que a tornaram candidata. */
interface ConflictCandidate {
  id: string;
  name: string;
  emails: string[];
  phones: string[];
  /** Alguma das leituras (nome, emails, telefones) falhou: o que se mostra pode estar incompleto. */
  incomplete: boolean;
}

interface PendingSubmissionRow {
  id: string;
  organization_id: string;
  entity_id: string;
  /** Ainda vêm da base (a agenda usa-os para ligar a marcação a um cliente), mas já não decidem nada aqui. */
  target_type: string;
  target_id: string;
  /** O que coincidiu com a ficha existente: "email", "telefone", "ambos" ou "conflito". */
  matchedBy: "email" | "telefone" | "ambos" | "conflito" | null;
  /** OS VALORES que coincidiram — só os que bateram, para não obrigar a ir procurar. */
  matchedEmail: string | null;
  matchedPhone: string | null;
  campaign_id: string | null;
  form_id: string | null;
  field_values: Record<string, unknown> | null;
  status: string;
  created_at: string;
  /** O nome da pessoa, lido de anew_entities; vazio se a pessoa não se lê. */
  targetName: string;
  campaignName: string | null;
  formName: string | null;
  fieldLabels: Record<string, string>;
  /** Campos de distrito: guardam o id, e sem isto o ecrã mostrava o UUID. */
  districtFieldKeys: Set<string>;
  districtNameById: Record<string, string>;
  /** [entidade do email, entidade do telefone] — só preenchido em conflito. */
  candidates: ConflictCandidate[] | null;
  /** O envio tem uma segunda pessoa em conflito (conflicting_entity_id), tenha sido ou não possível lê-la. */
  isConflict: boolean;
  /** Em conflito, falta ler uma das pessoas (ou leu-se mal): Ligar e Criar negócio ficam desativados. */
  conflictUnreadable: boolean;
  /** A leitura do nome falhou: mostra-se um aviso em vez de «Pessoa sem nome». */
  nameUnread: boolean;
  /**
   * Hora que a pessoa pediu para a visita e que NÃO chegou a ser marcada: o book-slot só marca com o comercial de quem já é conhecido, e
   * se ele não estiver livre guarda o pedido aqui em vez de passar a visita a outro.
   */
  requestedVisitStart: string | null;
}

type AcaoEnvio = "ligar" | "criar_negocio" | "ignorar";

/** O diálogo aberto: confirmar ligar ou ignorar, ou o aviso de que a pessoa já tem um negócio aberto (volta a chamar a RPC com a confirmação). */
type Dialogo =
  | { tipo: "ligar" | "ignorar"; row: PendingSubmissionRow; entityId?: string; nome: string }
  | { tipo: "aberto"; row: PendingSubmissionRow; entityId?: string; nome: string }
  | null;

/**
 * A fila mostra TODAS as submissões por resolver, não só as duvidosas: é a utilidade dela para quem vende, ver quais das suas pessoas
 * voltaram a preencher o formulário. Quem vê o quê é decidido pela política de leitura de `form_submissions`, que segue o âmbito do
 * utilizador. As duvidosas (email a apontar a uma pessoa, telefone a outra) vêm ao topo, com as duas candidatas lado a lado.
 *
 * `conflicting_entity_id` só existe a partir da migration 20261116050000: sem ela o PostgREST recusa a coluna, e a fila tem de
 * continuar a funcionar sem a marca de conflito em vez de ficar vazia.
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

/** O nome de cada pessoa (anew_entities, desta organização): é a única fonte do nome, já não há ficha de lead, de cliente nem de contacto. */
async function fetchEntityNames(
  organizationId: string,
  entityIds: string[],
): Promise<{ names: Record<string, string>; failed: boolean }> {
  if (entityIds.length === 0) return { names: {}, failed: false };
  const { data, error } = await supabase
    .from("anew_entities")
    .select("id, display_name")
    .eq("organization_id", organizationId)
    .in("id", entityIds);
  if (error) {
    console.error("[PendingFormSubmissions] entity names read failed:", error);
    return { names: {}, failed: true };
  }
  return { names: Object.fromEntries((data || []).map((e: any) => [e.id, e.display_name || ""])), failed: false };
}

/**
 * O valor submetido e um dos que fez o match? Compara-se como a deteccao compara: email sem maiusculas, telefone pelos ultimos 9
 * digitos -- senao "+351 917 654 321" nunca bateria com "917654321".
 */
function isMatchedValue(value: unknown, row: { matchedEmail: string | null; matchedPhone: string | null }): boolean {
  if (typeof value !== "string" || !value.trim()) return false;
  const texto = value.trim();

  if (row.matchedEmail && texto.toLowerCase() === row.matchedEmail.trim().toLowerCase()) return true;

  if (row.matchedPhone) {
    const digitos = (s: string) => s.replace(/\D/g, "").slice(-9);
    const submetido = digitos(texto);
    if (submetido.length === 9 && submetido === digitos(row.matchedPhone)) return true;
  }
  return false;
}

/** Nome, emails e telefones de cada entidade candidata, para quem lê perceber a dúvida. */
async function fetchConflictCandidates(organizationId: string, entityIds: string[]): Promise<Record<string, ConflictCandidate>> {
  if (entityIds.length === 0) return {};

  const [namesRead, emails, phones] = await Promise.all([
    fetchEntityNames(organizationId, entityIds),
    supabase.from("anew_entity_emails").select("entity_id, email, is_primary").in("entity_id", entityIds),
    supabase.from("anew_entity_phones").select("entity_id, phone_number, is_primary").in("entity_id", entityIds),
  ]);

  if (emails.error || phones.error) console.error("[PendingFormSubmissions] candidate contacts read failed:", emails.error || phones.error);
  const incomplete = namesRead.failed || !!emails.error || !!phones.error;
  const byId: Record<string, ConflictCandidate> = Object.fromEntries(
    entityIds.map((id) => [id, { id, name: namesRead.names[id] || "", emails: [], phones: [], incomplete: incomplete || !(id in namesRead.names) }]),
  );
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

/** "9 de setembro, 10:00" — por extenso, que é como quem lê fala da hora. */
function formatRequestedVisit(iso: string, locale: string): string | null {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return null;
  const dia = data.toLocaleDateString(locale, { day: "numeric", month: "long" });
  const hora = data.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  return `${dia}, ${hora}`;
}

interface ConflictCandidatesProps {
  candidates: ConflictCandidate[];
  linkedEntityId: string;
  /** O nome da pessoa do envio: entra no nome acessível de cada botão. */
  submissionName: string;
  /** Falta ler uma das pessoas: avisa e mantém Ligar e Criar negócio desativados. */
  unreadable: boolean;
  disabled: boolean;
  onLink: (candidate: ConflictCandidate) => void;
  onCreateDeal: (candidate: ConflictCandidate) => void;
}

/**
 * CONFLITO: o email apontou para uma pessoa e o telefone para outra. Mostram-se as duas lado a lado — nome, email e telefone — e
 * escolhe-se a quem ligar o envio, ou para quem criar o negócio (a RPC aceita a segunda candidata em `p_entity_id`).
 */
function ConflictCandidates({ candidates, linkedEntityId, submissionName, unreadable, disabled, onLink, onCreateDeal }: ConflictCandidatesProps) {
  const { t } = useTranslation();
  const acoesDesativadas = disabled || unreadable;
  return (
    <div className="rounded-md border border-dashed border-amber-500/60 bg-amber-500/5 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
        <p className="text-xs font-medium text-amber-700 dark:text-amber-500">{t(`${S}conflict.title`)}</p>
      </div>

      {unreadable && (
        <p role="alert" className="text-xs font-medium text-destructive">{t(`${S}conflict.loadFailed`)}</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {candidates.map((candidate) => {
          const isLinked = candidate.id === linkedEntityId;
          const name = candidate.name || t(`${S}${candidate.incomplete ? "nameUnread.short" : "noName"}`);
          return (
            <div
              key={candidate.id}
              className={`rounded-md border bg-background p-3 space-y-2 ${isLinked ? "border-amber-500/70" : "border-border"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium leading-tight">{name}</p>
                <Badge variant="outline" className="text-xs shrink-0">
                  {isLinked ? t(`${S}conflict.byEmail`) : t(`${S}conflict.byPhone`)}
                </Badge>
              </div>

              <div className="space-y-1">
                {candidate.emails.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t(`${S}conflict.noEmail`)}</p>
                ) : (
                  candidate.emails.slice(0, 3).map((email) => (
                    <p key={email} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Mail className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span className="truncate">{email}</span>
                    </p>
                  ))
                )}
                {candidate.phones.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t(`${S}conflict.noPhone`)}</p>
                ) : (
                  candidate.phones.slice(0, 3).map((phone) => (
                    <p key={phone} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span className="truncate">{phone}</span>
                    </p>
                  ))
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  disabled={acoesDesativadas}
                  aria-label={t(`${S}a11y.action`, { label: t(`${S}conflict.link`, { name }), name: submissionName })}
                  onClick={() => onLink(candidate)}
                >
                  <Link2 className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                  {t(`${S}conflict.link`, { name })}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  disabled={acoesDesativadas}
                  aria-label={t(`${S}a11y.action`, { label: t(`${S}conflict.createDeal`, { name }), name: submissionName })}
                  onClick={() => onCreateDeal(candidate)}
                >
                  <PlusCircle className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                  {t(`${S}conflict.createDeal`, { name })}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * A fila de envios de formulário («negócio desde o início»). Uma pessoa nova que entra por formulário nasce já com negócio; um envio de
 * quem já conhecemos espera aqui por uma decisão humana: ligar à pessoa (fica como nota), criar um negócio ou ignorar como duplicado.
 * Os valores enviados nunca entram na ficha sozinhos e não estão verificados.
 */
export default function PendingFormSubmissions() {
  const navigate = useNavigate();
  const { t, language } = useTranslation();
  const { activeCompany, isLoading: companyLoading } = useCompany();
  const { toast } = useToast();
  // Sem segunda permissao: quem chega aqui ja passou por `platform.pending_submissions.view`, e o servidor so devolve os envios cuja
  // pessoa esta dentro do ambito. A base decide a permissao de cada acao (pessoas.view, pessoas.create) e responde com 42501.

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PendingSubmissionRow[]>([]);
  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [resolving, setResolving] = useState(false);
  // Depois de resolver um envio a linha desaparece (e com ela o botão que tinha o foco): o foco vai para o título da lista.
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const resolvidoRecente = useRef(false);

  const orgId = activeCompany?.id;
  const locale = language === "pt" ? "pt-PT" : "en-GB";

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const submissions = await fetchPendingSubmissions(orgId);

      const entityIds = Array.from(new Set(submissions.map((s: any) => s.entity_id).filter(Boolean))) as string[];
      const campaignIds = Array.from(new Set(submissions.map((s: any) => s.campaign_id).filter(Boolean))) as string[];
      const formIds = Array.from(new Set(submissions.map((s: any) => s.form_id).filter(Boolean))) as string[];

      // CONFLITO: a submissão está ligada à entidade do email e guarda a do telefone em conflicting_entity_id. Carregam-se AS DUAS.
      const candidateIds = Array.from(
        new Set(
          submissions
            .filter((s: any) => s.conflicting_entity_id)
            .flatMap((s: any) => [s.entity_id, s.conflicting_entity_id])
            .filter(Boolean),
        ),
      ) as string[];

      const [namesRead, campaignNames, formNames, candidateById] = await Promise.all([
        fetchEntityNames(orgId, entityIds),
        campaignIds.length
          ? supabase.from("campaigns").select("id, name").in("id", campaignIds)
          : Promise.resolve({ data: [] as any[] }),
        formIds.length
          ? supabase.from("forms").select("id, name").in("id", formIds)
          : Promise.resolve({ data: [] as any[] }),
        fetchConflictCandidates(orgId, candidateIds),
      ]);

      const nameById = namesRead.names;
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

      // Os campos de distrito guardam o id da divisao administrativa, nao o nome. Sem esta traducao o cartao mostrava um UUID.
      const todasDefinicoes = Object.values(definitionsByCampaign).flat();
      const districtFieldKeys = new Set(
        todasDefinicoes.filter((d: any) => d.field_type === "ref_district").map((d: any) => d.field_key),
      );
      let districtNameById: Record<string, string> = {};
      if (districtFieldKeys.size > 0) {
        const { data: districts } = await supabase
          .from("administrative_divisions")
          .select("id, name")
          .eq("admin_level", 1);
        districtNameById = Object.fromEntries((districts || []).map((d: any) => [d.id, d.name]));
      }

      const mapped: PendingSubmissionRow[] = submissions.map((s: any) => {
        const definitions = s.campaign_id
          ? definitionsByCampaign[s.campaign_id] || []
          : definitionsByCampaign["__org__"] || [];
        const fieldLabels = Object.fromEntries(definitions.map((d) => [d.field_key, d.field_label]));

        const conflictingEntityId = s.conflicting_entity_id || null;
        // A deteccao de duplicados grava aqui o que coincidiu, no momento em que a submissao entrou. Submissoes anteriores vem sem nada.
        const dedupMeta = (s.field_values as any)?._meta?.dedup ?? null;
        // O book-slot grava aqui a hora que ficou por marcar (só quando houve um pedido de visita sem agenda livre).
        const agendamentoPedido = (s.field_values as any)?._meta?.agendamento_pedido ?? null;

        return {
          ...s,
          targetName: nameById[s.entity_id] || "",
          matchedBy: dedupMeta?.por ?? null,
          matchedEmail: dedupMeta?.email_igual ?? null,
          matchedPhone: dedupMeta?.telefone_igual ?? null,
          campaignName: s.campaign_id ? campaignNameById[s.campaign_id] || null : null,
          formName: s.form_id ? formNameById[s.form_id] || null : null,
          fieldLabels,
          districtFieldKeys,
          districtNameById,
          candidates: conflictingEntityId
            ? [candidateById[s.entity_id], candidateById[conflictingEntityId]].filter(Boolean)
            : null,
          isConflict: !!conflictingEntityId,
          // Com a segunda pessoa definida e uma candidata por ler, nunca se mostram os botões normais.
          conflictUnreadable:
            !!conflictingEntityId &&
            (!candidateById[s.entity_id] ||
              !candidateById[conflictingEntityId] ||
              candidateById[s.entity_id].incomplete ||
              candidateById[conflictingEntityId].incomplete),
          nameUnread: namesRead.failed || (!!s.entity_id && !(s.entity_id in nameById)),
          requestedVisitStart: agendamentoPedido?.inicio ?? null,
        };
      });

      // Os conflitos primeiro: são o único caso que exige mesmo uma decisão difícil.
      const sorted = [...mapped].sort((a, b) => Number(b.isConflict) - Number(a.isConflict));
      setRows(sorted);
    } catch (err) {
      console.error("[PendingFormSubmissions] load failed:", err);
      toast({ variant: "destructive", title: t(`${S}loadError`) });
    } finally {
      setLoading(false);
    }
  }, [orgId, toast, t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (resolvidoRecente.current && !dialogo) tituloRef.current?.focus();
  }, [rows, dialogo]);

  /**
   * Chama a RPC. `entityId` só vai quando se escolheu a OUTRA candidata; `confirmarAberto` só depois de o utilizador confirmar o
   * diálogo «Já existe um negócio aberto». Devolve se o diálogo do negócio aberto ficou à espera.
   */
  const resolver = async (row: PendingSubmissionRow, acao: AcaoEnvio, nome: string, entityId?: string, confirmarAberto = false) => {
    setResolving(true);
    resolvidoRecente.current = false;
    let aEsperar = false;
    try {
      const { data, error } = await supabase.rpc("rpc_resolve_form_submission", {
        p_submission_id: row.id,
        p_action: acao,
        ...(entityId ? { p_entity_id: entityId } : {}),
        ...(confirmarAberto ? { p_confirmar_negocio_aberto: true } : {}),
      });
      if (error) throw error;

      const resposta = interpretarRespostaSubmissao(data);
      if (resposta === "confirmar") {
        // Nada foi escrito: a pessoa já tem um negócio aberto e a RPC pede para confirmar.
        aEsperar = true;
        setDialogo({ tipo: "aberto", row, entityId, nome });
        return;
      }
      // mudou=false é sucesso: o envio já estava resolvido (por outra pessoa, ou por um pedido repetido).
      const titulo =
        resposta === "jaResolvida"
          ? t(`${S}done.already`)
          : acao === "ligar"
            ? t(`${S}done.link`)
            : acao === "criar_negocio"
              ? t(`${S}done.createDeal`)
              : t(`${S}done.ignore`);
      toast({ title: titulo });
      resolvidoRecente.current = true;
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch (err: unknown) {
      console.error("[PendingFormSubmissions] resolve failed:", err);
      captureFlowError(err, "form-submission-intake");
      toast({ variant: "destructive", title: t(`${S}error.title`), description: t(chaveDoErroSubmissao(err)) });
      // O envio já não está disponível para quem o viu: relê-se a fila em vez de deixar uma linha que nunca se resolve.
      if (codigoDoErroSubmissao(err) === "NG029") void load();
    } finally {
      setResolving(false);
      if (!aEsperar) setDialogo(null);
    }
  };

  const nomeDe = (row: PendingSubmissionRow) => row.targetName || t(`${S}${row.nameUnread ? "nameUnread.short" : "noName"}`);
  // O nome acessível de cada ação diz de que envio é; vários envios na fila teriam todos «Ligar à pessoa».
  const rotulo = (acao: string, nome: string) => t(`${S}a11y.action`, { label: acao, name: nome });

  const confirmarDialogo = () => {
    if (!dialogo) return;
    if (dialogo.tipo === "aberto") void resolver(dialogo.row, "criar_negocio", dialogo.nome, dialogo.entityId, true);
    else void resolver(dialogo.row, dialogo.tipo === "ligar" ? "ligar" : "ignorar", dialogo.nome, dialogo.entityId);
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

  const abertoDialogo = dialogo?.tipo === "aberto";
  const tipoConfirmar = dialogo?.tipo === "ignorar" ? "ignore" : "link";

  return (
    <div className="container mx-auto py-6 space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="-ml-2">
        <ArrowLeft className="h-4 w-4 mr-1" aria-hidden="true" /> {t(`${S}back`)}
      </Button>

      <div className="flex items-center gap-3">
        <FileText className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        <div>
          <h1 className="text-2xl font-bold">{t(`${S}title`)}</h1>
          <p className="text-sm text-muted-foreground">{t(`${S}intro`)}</p>
        </div>
      </div>

      <div role="note" className="flex items-start gap-2 rounded-md border border-amber-500/60 bg-amber-500/5 px-3 py-2">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" aria-hidden="true" />
        <p className="text-sm text-amber-800 dark:text-amber-400">{t(`${S}unverified`)}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle ref={tituloRef} tabIndex={-1} className="text-base outline-none">
            {t(`${S}pending`)}{" "}
            {/* Região de estado: o leitor de ecrã anuncia o novo total quando um envio é resolvido. */}
            <span role="status" aria-live="polite" aria-atomic="true" className="inline-flex">
              <Badge variant="secondary" className="ml-2" aria-hidden="true">{rows.length}</Badge>
              <span className="sr-only">{t(`${S}counter.${rows.length === 1 ? "one" : "other"}`, { count: rows.length })}</span>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex justify-center py-8">
              <OlyviaLoader size={24} inline />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">{t(`${S}empty`)}</p>
          ) : (
            rows.map((row) => {
              const entries = Object.entries(row.field_values || {}).filter(([key]) => key !== "_meta");
              const isConflict = row.isConflict;
              const horaPedida = row.requestedVisitStart ? formatRequestedVisit(row.requestedVisitStart, locale) : null;
              const nome = nomeDe(row);
              return (
                <Card
                  key={row.id}
                  className={isConflict ? "border-l-4 border-l-amber-500" : "border-l-4 border-l-muted-foreground/30"}
                >
                  <CardContent className="py-3 px-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {isConflict && (
                          <Badge variant="destructive" className="text-xs gap-1">
                            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                            {t(`${S}conflict.badge`)}
                          </Badge>
                        )}
                        <p className="text-sm font-medium">{nome}</p>
                        {row.nameUnread && <p className="text-xs text-amber-700 dark:text-amber-500">{t(`${S}nameUnread.warning`)}</p>}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {row.campaignName && <span>{row.campaignName}</span>}
                        {row.formName && <span>· {row.formName}</span>}
                        <span>{new Date(row.created_at).toLocaleString(locale)}</span>
                      </div>
                    </div>

                    {/* O que coincidiu, em bloco: enterrado numa frase corrida ninguem via qual era o valor que bateu. O nome vem
                        identificado como sendo o da FICHA, porque a mesma pessoa pode reenviar o formulario com outro nome. */}
                    {row.matchedBy && row.matchedBy !== "conflito" && (
                      <div className="rounded-md border bg-muted/40 px-3 py-2 space-y-1.5">
                        <p className="text-xs text-muted-foreground">
                          {t(`${S}matched.intro`)} <span className="font-medium text-foreground">{nome}</span>
                        </p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          {row.matchedEmail && (
                            <span className="inline-flex items-center gap-1.5 text-xs">
                              <Mail className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                              <span className="font-medium">{row.matchedEmail}</span>
                              <Badge variant="secondary" className="text-xs px-1.5 py-0">{t(`${S}same`)}</Badge>
                            </span>
                          )}
                          {row.matchedPhone && (
                            <span className="inline-flex items-center gap-1.5 text-xs">
                              <Phone className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                              <span className="font-medium">{row.matchedPhone}</span>
                              <Badge variant="secondary" className="text-xs px-1.5 py-0">{t(`${S}same`)}</Badge>
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{t(`${S}matched.note`)}</p>
                      </div>
                    )}

                    {/* A hora pedida vem ANTES dos campos submetidos: é o que obriga a agir, e enterrada debaixo da lista passava
                        despercebida. */}
                    {horaPedida && (
                      <div className="rounded-md border border-sky-500/60 bg-sky-500/5 px-3 py-2 space-y-2">
                        <div className="flex items-center gap-2">
                          <CalendarClock className="h-4 w-4 text-sky-600 shrink-0" aria-hidden="true" />
                          <p className="text-sm font-medium text-sky-700 dark:text-sky-400">
                            {t(`${S}visit.title`, { when: horaPedida })}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground">{t(`${S}visit.note`, { name: nome })}</p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            navigate("/scheduling", {
                              state: {
                                submissionId: row.id,
                                entityId: row.entity_id,
                                targetName: nome,
                                // O agendamento so sabe ligar a marcacao a um cliente; para os outros vai so o nome no titulo.
                                targetType: row.target_type,
                                clientId: row.target_type === "client" ? row.target_id : null,
                                requestedStart: row.requestedVisitStart,
                              },
                            })
                          }
                        >
                          <CalendarClock className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                          {t(`${S}visit.button`)}
                        </Button>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                      {entries.length === 0 ? (
                        <p className="text-xs text-muted-foreground col-span-2">{t(`${S}noValues`)}</p>
                      ) : (
                        entries.map(([key, value]) => (
                          <div
                            key={key}
                            className="flex items-baseline justify-between gap-2 text-xs border-b border-dashed py-1"
                          >
                            <span className="text-muted-foreground">
                              {row.fieldLabels[key] || humanizeFormFieldKey(key)}
                            </span>
                            <span className="font-medium text-right flex items-center justify-end gap-1.5">
                              {row.districtFieldKeys.has(key)
                                ? (row.districtNameById[String(value)] || sanitizeFieldValue(value))
                                : sanitizeFieldValue(value)}
                              {/* O valor que bateu marcado onde ele esta, para nao obrigar a compara-lo de cabeca. */}
                              {isMatchedValue(value, row) && (
                                <Badge variant="secondary" className="text-xs px-1.5 py-0">{t(`${S}same`)}</Badge>
                              )}
                            </span>
                          </div>
                        ))
                      )}
                    </div>

                    {isConflict && row.conflictUnreadable && (!row.candidates || row.candidates.length === 0) && (
                      <p role="alert" className="text-xs font-medium text-destructive">{t(`${S}conflict.loadFailed`)}</p>
                    )}

                    {isConflict && row.candidates && row.candidates.length > 0 && (
                      <ConflictCandidates
                        candidates={row.candidates}
                        linkedEntityId={row.entity_id}
                        submissionName={nome}
                        unreadable={row.conflictUnreadable}
                        disabled={resolving}
                        // A candidata que já é a da submissão não leva p_entity_id: a RPC usa a entidade gravada.
                        onLink={(c) => setDialogo({ tipo: "ligar", row, entityId: c.id === row.entity_id ? undefined : c.id, nome: c.name || t(`${S}noName`) })}
                        onCreateDeal={(c) => void resolver(row, "criar_negocio", c.name || t(`${S}noName`), c.id === row.entity_id ? undefined : c.id)}
                      />
                    )}

                    <div className="flex flex-wrap gap-2 pt-1">
                      {!isConflict && (
                        <>
                          <Button size="sm" variant="outline" disabled={resolving} aria-label={rotulo(t(`${S}action.link`), nome)} onClick={() => setDialogo({ tipo: "ligar", row, nome })}>
                            <Link2 className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                            {t(`${S}action.link`)}
                          </Button>
                          <Button size="sm" variant="outline" disabled={resolving} aria-label={rotulo(t(`${S}action.createDeal`), nome)} onClick={() => void resolver(row, "criar_negocio", nome)}>
                            <PlusCircle className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                            {t(`${S}action.createDeal`)}
                          </Button>
                        </>
                      )}
                      <Button size="sm" variant="ghost" disabled={resolving} aria-label={rotulo(t(`${S}action.ignore`), nome)} onClick={() => setDialogo({ tipo: "ignorar", row, nome })}>
                        <XCircle className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                        {t(`${S}action.ignore`)}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!dialogo} onOpenChange={(open) => !open && !resolving && setDialogo(null)}>
        <AlertDialogContent
          onCloseAutoFocus={(e) => {
            // O botão que abriu o diálogo pode já não existir (o envio saiu da lista): o foco vai para o título.
            if (resolvidoRecente.current) {
              e.preventDefault();
              tituloRef.current?.focus();
            }
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{abertoDialogo ? t(`${S}openDeal.title`) : t(`${S}confirm.${tipoConfirmar}.title`)}</AlertDialogTitle>
            <AlertDialogDescription>
              {abertoDialogo
                ? t(`${S}openDeal.description`, { name: dialogo?.nome ?? "" })
                : t(`${S}confirm.${tipoConfirmar}.description`, { name: dialogo?.nome ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resolving}>{t(`${S}confirm.cancel`)}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // O diálogo fecha-se quando a RPC acaba (ou fica aberto, se pedir a confirmação do negócio aberto).
                e.preventDefault();
                confirmarDialogo();
              }}
              disabled={resolving}
            >
              {resolving ? t(`${S}confirm.working`) : abertoDialogo ? t(`${S}openDeal.ok`) : t(`${S}confirm.ok`)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
