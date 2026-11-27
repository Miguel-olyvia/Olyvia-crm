import { useState, useMemo, useEffect, useId, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { withAuditContext } from "@/utils/auditContext";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";
import { setEntityOwner, notifyOwnerChangeVisits } from "@/lib/leads/entityOwnerSync";
import { EntityKindSelector } from "@/components/shared/EntityKindSelector";
import { fetchEntityCompanyName } from "@/lib/clients/fetchEntityCompanyName";
import {
  initialKindState,
  leadNameArgsAfterKindStep,
  personNamesFromEntity,
  planNameSave,
  resolveInitialPersonNames,
  saveKindThenRest,
  type EntityKind,
  type KindFormState,
  type KindStepOutcome,
  type PersonNames,
} from "@/lib/entityKind";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Save } from "lucide-react";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { DynamicFormField } from "./DynamicFormField";
import { LeadPhoneField } from "./LeadPhoneField";
import { normalizeLegacyPhonePrefix } from "@/lib/phone/splitInternationalPhone";
import {
  createSupabaseLeadDialogFieldDefinitionResolverClient,
  resolveLeadDialogFieldDefinitions,
  type LeadDialogFieldDefinition,
} from "@/lib/leads/fieldDefinitions";
import { leadEditGeneralFieldsSchema, leadEditNotesSchema } from "@/lib/validations";
import { linkEntityFiscalEntity } from "@/utils/orgFiscalEntity";
import { linkEntityAddress, linkEntityEmail, linkEntityPhone } from "@/utils/entityContactSync";
import {
  getEntityPrimaryEmail,
  getEntityPrimaryPhone,
  isMissingFunctionError,
  phoneFormValueFromEntity,
  sameEmail,
  samePhone,
} from "@/utils/entityPrimaryContact";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { checkNifCollisionOnEdit } from "@/lib/duplicateBlockingRule";
import { useLeadPipelineRules } from "@/hooks/useLeadPipelineRules";
import {
  isLeadStageTransitionAllowed,
  LEAD_STAGE_TRANSITION_BLOCKED_TITLE,
  leadStageTransitionBlockedMessage,
} from "@/lib/leads/stageTransitionGuard";

interface Lead {
  id: string;
  organization_id?: string;
  campaign_id: string | null;
  entity_id: string | null;
  field_values: Record<string, any> | null;
  status: string;
  source: string | null;
  notes: string | null;
  assigned_to: string | null;
  workflow_stage_id?: string | null;
  qualification_type?: string | null;
  lost_reason?: string | null;
}

export interface LeadEditDialogUpdate {
  leadId: string;
  entityId: string | null;
  status: string;
  assignedTo: string | null;
  source: string | null;
  notes: string | null;
  workflowStageId: string | null;
  fieldValues: Record<string, any>;
}

interface LeadEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead | null;
  companyId: string;
  companyUsers: { id: string; name: string }[];
  onLeadUpdated: (payload?: LeadEditDialogUpdate) => void;
  /** anew_users.id (preferred) or auth user id — used for audit context */
  userId: string;
}

const NOTES_FIELD_KEYS = ["notas", "notes", "observacoes", "observações"];

const GENERAL_FIELD_ALIASES: Record<string, string[]> = {
  first_name: ["first_name", "nome", "name", "primeiro_nome", "firstname", "firstName"],
  last_name: ["last_name", "apelido", "surname", "sobrenome", "lastname", "lastName"],
  email: ["email", "e-mail", "e_mail", "mail"],
  phone: ["phone", "telefone", "telemovel", "telemóvel", "mobile", "celular", "contacto"],
  company_name: ["company_name", "empresa", "company", "nome_empresa", "organizacao", "organização"],
  address: ["address", "morada", "endereco", "endereço", "rua", "address_line1"],
  postal_code: ["postal_code", "codigo_postal", "código_postal", "cp", "cep", "zip", "zipcode"],
  city: ["city", "cidade", "localidade"],
  vat: ["vat", "nif", "contribuinte", "fiscal", "tax_id", "taxid", "numero_contribuinte"],
};

const GENERAL_FIELDS = [
  { key: "first_name", label: "Nome" },
  { key: "last_name", label: "Apelido" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Telefone" },
  { key: "company_name", label: "Empresa" },
  { key: "address", label: "Morada" },
  { key: "postal_code", label: "Código Postal" },
  { key: "city", label: "Localidade" },
  { key: "vat", label: "NIF" },
];

const normalizeFieldKey = (key: string) => key.toLowerCase().trim();
const isNotesFieldKey = (key: string) => NOTES_FIELD_KEYS.includes(normalizeFieldKey(key));
const isGeneralFieldKey = (key: string) => Object.values(GENERAL_FIELD_ALIASES).some((aliases) => aliases.includes(normalizeFieldKey(key)));

const GENERAL_FIELD_KEYS = GENERAL_FIELDS.map((f) => f.key);

// Same generic business reasons as LeadLostReasonDialog (Kanban / bulk
// flows) — kept as a plain array here too since this Select lives inline in
// the form instead of a separate dialog.
const LOST_REASON_OPTIONS = [
  "Sem resposta",
  "Preço",
  "Escolheu concorrente",
  "Não é o momento certo",
  "Outro",
];

/**
 * Maps each base lead field to the form field key that actually holds its
 * value, using the form's own `contact_field_mapping`.
 *
 * The form is the authority here, not the key's spelling. A campaign field
 * keyed `po_email` and mapped to `email` IS the lead's email; guessing from
 * the key alone (the previous behaviour) failed for every prefixed form, so
 * the base "Email" box rendered empty while the same value showed again
 * further down under "Campos do Formulário".
 */
const buildGeneralKeyToFormKey = (
  defs: readonly { field_key: string; contact_field_mapping?: string | null }[],
): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const def of defs) {
    const mapped = def.contact_field_mapping;
    if (!mapped || !GENERAL_FIELD_KEYS.includes(mapped)) continue;
    if (!out[mapped]) out[mapped] = def.field_key;
  }
  return out;
};

/** True when the form itself declares this field as one of the base fields. */
const isMappedGeneralField = (def: { contact_field_mapping?: string | null }) =>
  !!def.contact_field_mapping && GENERAL_FIELD_KEYS.includes(def.contact_field_mapping);

const getGeneralFieldValue = (
  values: Record<string, any>,
  key: string,
  mappedKeys: Record<string, string> = {},
) => {
  // The mapped form key wins over the alias guesses.
  const aliases = [mappedKeys[key], ...(GENERAL_FIELD_ALIASES[key] || [key])].filter(Boolean) as string[];
  for (const alias of aliases) {
    const rawValue = values?.[alias];
    if (rawValue === null || rawValue === undefined || rawValue === "") continue;
    if (typeof rawValue === "object") {
      return String(rawValue.address_line1 || rawValue.street || rawValue.value || "");
    }
    return String(rawValue);
  }
  return "";
};

/**
 * Telefone e email principais da ficha ao abrir o dialogo, ja no formato do formulario.
 * `string`: a ficha tem principal. `null`: a ficha nao tem. Ausente: nao se conseguiu ler.
 * Nos dois ultimos casos o formulario fica com o que a lead tem em field_values.
 */
interface EntityContacts {
  phone?: string | null;
  email?: string | null;
}

type ContactField = "phone" | "email";

/** Erro da gravacao do telefone ou do email na ficha: qual dos dois falhou e o texto para o alerta. */
interface ContactError {
  field: ContactField;
  message: string;
}

const CONTACT_FIELD_LABEL: Record<ContactField, string> = { phone: "O telefone", email: "O email" };

// A funcao da ficha nao existe na base (a migration ainda nao foi aplicada): a pessoa nao pode resolver,
// por isso o texto manda para o suporte em vez de mostrar o nome interno da funcao.
const CONTACT_FUNCTION_MISSING_MESSAGE =
  "a gravação de contactos na ficha não está disponível de momento. Contacte o suporte.";

/** O que a ficha ja aceitou antes de uma falha, para quem edita saber que isso nao se perdeu. */
const contactsSavedNotice = (saved: readonly ContactField[]): string =>
  saved.length > 1
    ? "O telefone e o email já ficaram guardados na ficha."
    : `${CONTACT_FIELD_LABEL[saved[0] ?? "phone"]} já ficou guardado na ficha.`;

/** Junta duas frases sem duplicar o ponto final da primeira. */
const joinSentences = (first: string, second: string): string => `${first.trim().replace(/[.\s]+$/, "")}. ${second}`;

const fieldDefinitionResolverClient = createSupabaseLeadDialogFieldDefinitionResolverClient(supabase);

export function AnewLeadEditDialog({
  open,
  onOpenChange,
  lead,
  companyId,
  companyUsers,
  onLeadUpdated,
  userId,
}: LeadEditDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  // Restrição de transições desenhada no diagrama de fluxo. Só se aplica a
  // mudanças feitas por utilizadores — é exatamente o caso deste diálogo.
  const {
    stages: pipelineStages,
    enforceStageTransitions,
    transitions: stageTransitions,
  } = useLeadPipelineRules(companyId);

  const [fieldDefs, setFieldDefs] = useState<LeadDialogFieldDefinition[]>([]);
  const [fieldValues, setFieldValues] = useState<Record<string, any>>({});
  const [status, setStatus] = useState("new");
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");
  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const [qualificationType, setQualificationType] = useState<string | null>(null);
  const [lostReason, setLostReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Pessoa | Empresa. `entityInfo` e a ficha como estava ao abrir (tipo e nome da
  // empresa). O nome da empresa SO se escreve em modo Empresa («Nome da empresa», que e
  // o nome da ficha); escrito, fica em `kindCompany` e nao se perde ao trocar o
  // seletor. `null` = ainda nao escrito (vale o nome da ficha, se e Empresa, ou a empresa
  // que a lead ja tinha). Em modo Pessoa nao ha campo de empresa e o valor de field_values
  // nao se toca.
  const [kind, setKind] = useState<EntityKind>("person");
  // `names` = nome e apelido da ficha, para quando a lead nao os tem em field_values.
  const [entityInfo, setEntityInfo] = useState<{ type: string; state: KindFormState; names: PersonNames } | null>(null);
  const nameSeedPending = useRef(false);
  const [kindCompany, setKindCompany] = useState<string | null>(null);
  // O telefone e o email da pessoa vivem na ficha: o formulario abre com o principal mais recente
  // dela e e contra ele que se compara ao gravar. `contactsRequest` descarta a leitura de uma
  // abertura anterior; `contactSeedPending` faz o preenchimento correr uma so vez por abertura.
  const [entityContacts, setEntityContacts] = useState<EntityContacts | null>(null);
  const contactSeedPending = useRef(false);
  const contactsRequest = useRef(0);
  // Enquanto a ficha se le o Guardar espera: gravar antes de a ler compararia com o retrato da lead e
  // deixaria passar, sem aviso, o numero que a ficha nao tem (a divergencia que isto veio corrigir).
  const [contactsLoading, setContactsLoading] = useState(false);
  // Erro da gravacao do telefone/email na ficha, mostrado em role="alert" dentro do dialogo e ligado
  // ao campo que falhou (aria-invalid / aria-describedby).
  const [contactError, setContactError] = useState<ContactError | null>(null);
  const contactErrorId = useId();

  // Load field definitions and populate form when dialog opens
  useEffect(() => {
    if (open && lead) {
      loadFieldDefs();
      populateForm();
    }
  }, [open, lead]);

  const loadFieldDefs = async () => {
    if (!lead) return;
    setLoading(true);
    
    try {
      const resolvedDefinitions = await resolveLeadDialogFieldDefinitions(
        {
          campaignId: lead.campaign_id,
          organizationId: companyId,
        },
        fieldDefinitionResolverClient,
      );

      setFieldDefs(resolvedDefinitions);
    } catch (error) {
      console.error("Error loading field definitions:", error);
    } finally {
      setLoading(false);
    }
  };

  const populateForm = () => {
    if (!lead) return;
    
    // Clone field_values, excluding _meta
    const values = { ...(lead.field_values || {}) };
    delete values._meta;
    
    setFieldValues(values);
    setStatus(lead.status || "new");
    setSource(lead.source || "");
    setNotes(lead.notes || "");
    setAssignedTo(lead.assigned_to);
    setQualificationType(lead.qualification_type ?? null);
    setLostReason(lead.lost_reason || "");
    setFieldErrors({});
    setContactError(null);
    void loadEntityKind();
    void loadEntityContacts();
  };

  // Telefone e email principais da ficha (a mesma ordem do portal). Cada um le-se por si: se um
  // falhar o outro conta na mesma, e o que falhou fica como «nao lido» (field_values).
  const loadEntityContacts = async () => {
    const request = ++contactsRequest.current;
    contactSeedPending.current = false;
    setEntityContacts(null);
    if (!lead?.entity_id) {
      setContactsLoading(false);
      return;
    }
    setContactsLoading(true);
    try {
      const [phoneRead, emailRead] = await Promise.allSettled([
        getEntityPrimaryPhone(lead.entity_id),
        getEntityPrimaryEmail(lead.entity_id),
      ]);
      if (request !== contactsRequest.current) return;
      const contacts: EntityContacts = {};
      if (phoneRead.status === "fulfilled") {
        contacts.phone = phoneRead.value ? phoneFormValueFromEntity(phoneRead.value) : null;
      } else {
        // Ficha por ler: o formulario cai no que a lead tem, sem aviso no ecra. Fica registado, para
        // se saber quando isto acontece (o Info e o Editar podem mostrar numeros diferentes).
        console.error("Error loading entity primary phone:", phoneRead.reason);
        captureFlowError(phoneRead.reason, "lead-contact-update");
      }
      if (emailRead.status === "fulfilled") {
        contacts.email = emailRead.value;
      } else {
        console.error("Error loading entity primary email:", emailRead.reason);
        captureFlowError(emailRead.reason, "lead-contact-update");
      }
      contactSeedPending.current = true;
      setEntityContacts(contacts);
    } finally {
      // Uma leitura de uma abertura anterior nao liberta o Guardar da abertura actual.
      if (request === contactsRequest.current) setContactsLoading(false);
    }
  };

  // Tipo da ficha (Pessoa/Empresa) e nome da empresa actual, para pre-seleccionar o
  // seletor e pre-preencher «Nome da empresa». A empresa le-se aparte e tolera a
  // coluna ainda nao existir (ver fetchEntityCompanyName).
  const loadEntityKind = async () => {
    setEntityInfo(null);
    setKind("person");
    setKindCompany(null);
    if (!lead?.entity_id) return;
    const { data, error } = await supabase
      .from("anew_entities")
      .select("type, display_name, first_name, last_name")
      .eq("id", lead.entity_id)
      .maybeSingle();
    if (error || !data) {
      if (error) console.error("Error loading entity type:", error);
      return;
    }
    const companyRead = await fetchEntityCompanyName(supabase, lead.entity_id);
    const initial = initialKindState(data, companyRead.company);
    const names = personNamesFromEntity(data);
    setEntityInfo({ type: data.type || "person", state: { ...initial, first: names.first, last: names.last }, names });
    setKind(initial.kind);
    nameSeedPending.current = true;
  };

  // Lead sem nome em field_values (criada por script, Edge Function, importacao): Nome e Apelido
  // vem da ficha, para nao abrirem vazios nem se gravar um nome vazio. Corre uma vez, depois de o
  // formulario (e o mapeamento das chaves) estar carregado e so se a pessoa ainda nao escreveu nada.
  useEffect(() => {
    if (!nameSeedPending.current || !entityInfo || loading) return;
    nameSeedPending.current = false;
    const current = { first: readGeneralField("first_name"), last: readGeneralField("last_name") };
    const seeded = resolveInitialPersonNames(current, entityInfo.names);
    if (seeded.first !== current.first) handleGeneralFieldChange("first_name", seeded.first);
    if (seeded.last !== current.last) handleGeneralFieldChange("last_name", seeded.last);
  }, [entityInfo, loading]);

  // Telefone e email abrem com o principal da ficha, que e o que o Info e a proposta mostram, e nao
  // com a copia em field_values (a lead pode ter ficado com um numero mais novo, ou mais velho, que a
  // ficha). Sem principal na ficha, ou ficha por ler, fica o que a lead tem. Corre uma vez, depois do
  // formulario (e do mapeamento das chaves) carregado, e so mexe num campo que a pessoa ainda nao tocou.
  useEffect(() => {
    if (!contactSeedPending.current || !entityContacts || loading) return;
    contactSeedPending.current = false;
    const original = lead?.field_values || {};
    if (entityContacts.phone) {
      const current = readGeneralField("phone");
      if (current === readGeneralField("phone", original) && !samePhone(current, entityContacts.phone)) {
        handleGeneralFieldChange("phone", entityContacts.phone);
      }
    }
    if (entityContacts.email) {
      const current = readGeneralField("email");
      if (current === readGeneralField("email", original) && !sameEmail(current, entityContacts.email)) {
        handleGeneralFieldChange("email", entityContacts.email);
      }
    }
  }, [entityContacts, loading]);

  const generalKeyToFormKey = useMemo(() => buildGeneralKeyToFormKey(fieldDefs), [fieldDefs]);

  const readGeneralField = (key: string, values: Record<string, any> = fieldValues) =>
    getGeneralFieldValue(values, key, generalKeyToFormKey);

  // Uma so fonte para «Nome da empresa»: o que se escreveu; senao o nome da ficha (se ja e
  // Empresa); senao a empresa que a lead ja tinha em field_values.
  const companyValue = (
    kindCompany
    ?? (entityInfo?.state.kind === "organization"
      ? entityInfo.state.company
      : readGeneralField("company_name") || entityInfo?.state.company || "")
  ).replace(/\s+/g, " ").trim();

  const handleFieldChange = (key: string, value: any) => {
    setFieldValues(prev => ({ ...prev, [key]: value }));
  };

  const handleGeneralFieldChange = (generalKey: string, value: string) => {
    // Write back to the SAME key the value was read from, or editing the base
    // box would create a second copy under a different key.
    const aliases = GENERAL_FIELD_ALIASES[generalKey] || [generalKey];
    const existingAlias =
      generalKeyToFormKey[generalKey] ||
      aliases.find((alias) => Object.prototype.hasOwnProperty.call(fieldValues, alias)) ||
      aliases[0];
    handleFieldChange(existingAlias, value);
    // Mexer no campo que a ficha recusou apaga o erro desse campo; o do outro continua (ainda e verdade).
    if (generalKey === "phone" || generalKey === "email") {
      setContactError((current) => (current?.field === generalKey ? null : current));
    }
    if (fieldErrors[generalKey]) {
      setFieldErrors(prev => {
        const next = { ...prev };
        delete next[generalKey];
        return next;
      });
    }
  };

  /**
   * Validates the general fields (name/email/phone/company) and notes with
   * Zod before saving. Dynamic campaign fields keep their existing
   * DynamicFormField-level behavior — this only blocks/flags data that would
   * previously have been saved without any format check (e.g. malformed
   * email, phone, or overly long text).
   */
  const validateForm = (): boolean => {
    const generalValues = {
      first_name: readGeneralField("first_name"),
      last_name: readGeneralField("last_name"),
      email: readGeneralField("email"),
      phone: readGeneralField("phone"),
      // Em modo Pessoa nao ha campo de empresa: o valor guardado nao se valida nem se toca.
      company_name: kind === "organization" ? companyValue : "",
      address: readGeneralField("address"),
      postal_code: readGeneralField("postal_code"),
      city: readGeneralField("city"),
      vat: readGeneralField("vat"),
    };

    const generalResult = leadEditGeneralFieldsSchema.safeParse(generalValues);
    const notesResult = leadEditNotesSchema.safeParse({ notes });

    const nextErrors: Record<string, string> = {};
    if (!generalResult.success) {
      for (const issue of generalResult.error.issues) {
        const key = String(issue.path[0] ?? "");
        if (key && !nextErrors[key]) nextErrors[key] = issue.message;
      }
    }
    if (!notesResult.success) {
      const issue = notesResult.error.issues[0];
      if (issue) nextErrors.notes = issue.message;
    }

    if (kind === "organization" && !companyValue) {
      nextErrors.company_name = "Indique o nome da empresa";
    }

    setFieldErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      const firstMessage = Object.values(nextErrors)[0];
      toast({
        title: "Dados inválidos",
        description: firstMessage,
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  const resolveWorkflowStageId = async (statusValue: string) => {
    const { data, error } = await supabase
      .from("lead_workflow_stages")
      .select("id, organization_id, name, is_rejection")
      .or(`organization_id.eq.${companyId},organization_id.is.null`);

    if (error) throw error;

    // "lost" e "rejected" são tratados como o mesmo estado terminal em todo o
    // resto da app (contadores, filtros, bucket "Lost" do Kanban), mas nenhuma
    // org tem um estágio literalmente chamado "lost" — só "rejected". Usar
    // is_rejection em vez de igualdade literal de name evita que a resolução
    // falhe silenciosamente e deixe workflow_stage_id por atualizar.
    const isLostLikeStatus = statusValue === "lost" || statusValue === "rejected";
    const candidates = (data ?? []).filter(
      (stage) => stage.name === statusValue || (isLostLikeStatus && stage.is_rejection)
    );

    const organizationStage = candidates.find((stage) => stage.organization_id === companyId);
    return organizationStage?.id || candidates.find((stage) => stage.organization_id === null)?.id || null;
  };

  /**
   * Envia para a ficha o email e o telefone que a pessoa mudou. Compara com o que o formulario
   * mostrava ao abrir (o principal da ficha; sem principal, ou ficha por ler, o que a lead tinha) e
   * NAO com field_values: o que partiu isto foi uma lead com o numero novo ja em field_values e a
   * ficha com o antigo, em que gravar de novo era sempre «sem mudanca». Para no primeiro que a ficha
   * recusar. Devolve o que a ficha JA aceitou (`saved`) e o que recusou (`failure`, ou null se correu
   * tudo). O que ficou gravado passa a ser o novo ponto de comparacao: se a lead falhar a seguir e a
   * pessoa repuser o valor antigo, esse valor volta a ser uma mudanca e escreve-se na ficha.
   */
  const saveEntityContacts = async (
    entityId: string,
    values: Record<string, any>,
  ): Promise<{ saved: ContactField[]; failure: { field: ContactField; error: unknown } | null }> => {
    const original = lead?.field_values || {};
    const saved: ContactField[] = [];

    const email = readGeneralField("email", values);
    const emailShown = entityContacts?.email ?? readGeneralField("email", original);
    if (email && !sameEmail(email, emailShown)) {
      try {
        await linkEntityEmail(entityId, email, userId);
      } catch (error) {
        return { saved, failure: { field: "email", error } };
      }
      saved.push("email");
      setEntityContacts((current) => ({ ...current, email }));
    }

    const phone = readGeneralField("phone", values);
    const phoneShown = entityContacts?.phone ?? readGeneralField("phone", original);
    if (phone && !samePhone(phone, phoneShown)) {
      try {
        await linkEntityPhone(entityId, phone, userId);
      } catch (error) {
        return { saved, failure: { field: "phone", error } };
      }
      saved.push("phone");
      setEntityContacts((current) => ({ ...current, phone }));
    }
    return { saved, failure: null };
  };

  const handleSave = async () => {
    if (!lead) return;
    if (!validateForm()) return;

    // Marking a lead as "Perdida" must always carry a reason — block the
    // submit (never call the RPC) instead of silently saving without one.
    if (status === "lost" && !lostReason.trim()) {
      toast({
        title: "Motivo obrigatório",
        description: "Indique o motivo de perda antes de guardar.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    setContactError(null);
    // O que a ficha ja aceitou nesta gravacao. Se algo falhar a seguir, a ficha fica a frente da lead:
    // diz-se a quem edita e o ecra de listas volta a ler (o Info e a lista mostram a ficha).
    let contactsSaved: ContactField[] = [];
    // A lead exactamente como estava: avisa o ecra para voltar a ler SEM dizer que a lead foi gravada.
    const refreshAfterContactsOnly = () =>
      onLeadUpdated({
        leadId: lead.id,
        entityId: lead.entity_id,
        status: lead.status,
        assignedTo: lead.assigned_to,
        source: lead.source,
        notes: lead.notes,
        workflowStageId: lead.workflow_stage_id ?? null,
        fieldValues: lead.field_values ?? {},
      });
    try {
      // Preserve _meta if it exists
      const existingMeta = lead.field_values?._meta;
      const updatedFieldValues: Record<string, any> = {
        ...fieldValues,
        ...(existingMeta ? { _meta: existingMeta } : {}),
      };

      // Empresa: o campo «empresa» da lead acompanha o nome da empresa (nas duas chaves).
      if (kind === "organization" && companyValue) {
        updatedFieldValues.company_name = companyValue;
        const mappedCompanyKey = generalKeyToFormKey.company_name;
        if (mappedCompanyKey) updatedFieldValues[mappedCompanyKey] = companyValue;
      }

      // Normalizar os campos base no snapshot antes de guardar. O formulario le
      // um campo base (Email, Telefone, Morada...) pela chave da campanha quando
      // ela existe (po_email, po_telefone...), mas a escrita podia deixar a
      // chave da campanha com o valor ANTIGO enquanto o valor novo ficava so
      // noutra chave -- ao reabrir, a leitura ia buscar a po_email antiga e o
      // Editar parecia ter revertido (embora a entidade/Info ja mostrasse o
      // valor novo). Aqui escrevemos o valor de cada campo base -- o MESMO que
      // e sincronizado para a entidade -- tanto na chave padrao como na chave da
      // campanha, para as duas nunca divergirem. NAO toca em form_submissions
      // (a submissao original vive noutra tabela e mantem-se).
      for (const generalKey of GENERAL_FIELD_KEYS) {
        // Em modo Pessoa a empresa que a lead ja tinha fica exactamente como esta.
        if (generalKey === "company_name" && kind !== "organization") continue;
        const rawCanonical = readGeneralField(generalKey, updatedFieldValues);
        if (rawCanonical === "" || rawCanonical === null || rawCanonical === undefined) continue;
        // Telefones antigos com "00" (ex.: "0045 41736520") passam a "+45...",
        // o formato que o seletor de indicativo mostra e que o resto guarda.
        const canonical = generalKey === "phone" ? normalizeLegacyPhonePrefix(rawCanonical) : rawCanonical;
        updatedFieldValues[generalKey] = canonical;
        const mappedKey = generalKeyToFormKey[generalKey];
        if (mappedKey) updatedFieldValues[mappedKey] = canonical;
      }

      const statusChanged = status !== lead.status;
      const qualificationChanged = qualificationType !== (lead.qualification_type ?? null);

      let workflowStageId = lead.workflow_stage_id || null;
      if (statusChanged) {
        // O destino só é conhecido depois de resolvido o estágio, por isso a
        // guarda corre imediatamente a seguir — e sempre ANTES de qualquer
        // escrita (a RPC rpc_update_lead só é chamada mais abaixo).
        workflowStageId = await resolveWorkflowStageId(status);

        if (!isLeadStageTransitionAllowed({
          enforce: enforceStageTransitions,
          transitions: stageTransitions,
          fromStageId: lead.workflow_stage_id ?? null,
          toStageId: workflowStageId,
        })) {
          toast({
            title: LEAD_STAGE_TRANSITION_BLOCKED_TITLE,
            description: leadStageTransitionBlockedMessage(
              pipelineStages.find(s => s.id === lead.workflow_stage_id)?.label,
              pipelineStages.find(s => s.id === workflowStageId)?.label,
            ),
            variant: "destructive",
          });
          return; // o finally envolvente limpa o `saving`
        }
      }

      // O tipo e o nome da ficha gravam-se (rpc_set_entity_kind) antes de rpc_update_lead e das
      // sincronizacoes do NIF e da morada: ver saveKindThenRest. O telefone e o email gravam-se ainda antes,
      // mais abaixo, porque a recusa deles tem de parar tudo o resto.
      let namePlan: ReturnType<typeof planNameSave> = null;
      if (lead.entity_id) {
        const originalValues = lead.field_values || {};
        const base: KindFormState = entityInfo?.state ?? { kind: "person", first: "", last: "", company: "" };
        // Nome e apelido de partida: os do formulario ao abrir (field_values; se a lead nao os tinha,
        // os da ficha, como o formulario os mostrou).
        const originalNames = resolveInitialPersonNames(
          { first: readGeneralField("first_name", originalValues), last: readGeneralField("last_name", originalValues) },
          entityInfo?.names ?? { first: "", last: "" },
        );
        namePlan = planNameSave(
          { ...base, first: originalNames.first, last: originalNames.last },
          {
            kind,
            first: readGeneralField("first_name", updatedFieldValues),
            last: readGeneralField("last_name", updatedFieldValues),
            company: companyValue,
          },
          entityInfo?.type ?? "person",
        );
      }

      // One NIF per entity, per organization — the same rule already enforced
      // on lead creation (AnewLeads.tsx passes `vat` through the duplicate
      // ladder). Runs BEFORE any write, so a clash leaves the lead untouched
      // rather than half-saved with the NIF link rejected afterwards.
      const vatToSave = readGeneralField("vat", updatedFieldValues);
      if (vatToSave && companyId) {
        const { collisions, error: nifCheckError } = await checkNifCollisionOnEdit({
          orgId: companyId,
          nif: vatToSave,
          ownEntityId: lead.entity_id ?? null,
        });

        if (nifCheckError) {
          // Fails closed: an unverifiable NIF must not be written.
          toast({
            title: "Não foi possível verificar o NIF",
            description:
              "A verificação de NIF duplicado falhou, por isso a lead não foi guardada. Tente novamente.",
            variant: "destructive",
          });
          return; // the enclosing finally clears `saving`
        }

        if (collisions.length > 0) {
          const names = collisions
            .map((c) => c.displayName)
            .filter(Boolean)
            .join(", ");
          toast({
            title: "NIF já utilizado nesta organização",
            description: names
              ? `Este NIF já pertence a: ${names}. Não podem existir duas entidades com o mesmo NIF na mesma organização.`
              : "Este NIF já pertence a outra entidade desta organização.",
            variant: "destructive",
          });
          return; // the enclosing finally clears `saving`
        }
      }

      // O telefone e o email da pessoa gravam-se PRIMEIRO na ficha, que e a fonte do Info, da proposta
      // e do portal, e so se ela aceitar se grava a lead. Se a ficha recusar, nada mais se grava, o
      // erro fica a vista dentro do dialogo e o ecra continua aberto: a lead nunca fica a frente da ficha.
      if (lead.entity_id) {
        const { saved, failure } = await saveEntityContacts(lead.entity_id, updatedFieldValues);
        contactsSaved = saved;
        if (failure) {
          console.error(`Error saving entity ${failure.field}:`, failure.error);
          const functionMissing = isMissingFunctionError(failure.error);
          // Uma recusa de permissao e a resposta certa; uma funcao em falta e uma avaria: regista-se.
          if (functionMissing) captureFlowError(failure.error, "lead-contact-update");
          const reason = functionMissing
            ? CONTACT_FUNCTION_MISSING_MESSAGE
            : await getFriendlyErrorMessage(failure.error);
          const refused = `${CONTACT_FIELD_LABEL[failure.field]} não foi guardado: ${reason}`;
          setContactError({
            field: failure.field,
            message: saved.length > 0 ? joinSentences(refused, contactsSavedNotice(saved)) : refused,
          });
          if (saved.length > 0) refreshAfterContactsOnly();
          return; // o finally envolvente limpa o `saving`
        }
      }

      // O dono e as visitas futuras da lead nunca divergem: muda-se o dono PRIMEIRO
      // (a base troca o recurso das visitas futuras). Se o novo dono não tem
      // recurso de agenda, a mudança é recusada e nada mais é gravado.
      let ownerAffectedVisitIds: string[] = [];
      if ((lead.assigned_to ?? null) !== (assignedTo ?? null)) {
        try {
          const ownerResult = await withAuditContext(supabase, userId, () =>
            setEntityOwner("lead", lead.id, assignedTo),
          );
          ownerAffectedVisitIds = ownerResult.affectedVisitIds;
        } catch (ownerError) {
          const description = await getFriendlyErrorMessage(ownerError);
          toast({
            title: t("leads.toast.assigneeUpdateError"),
            description: contactsSaved.length > 0 ? joinSentences(description, contactsSavedNotice(contactsSaved)) : description,
            variant: "destructive",
          });
          if (contactsSaved.length > 0) refreshAfterContactsOnly();
          return; // o finally envolvente limpa o `saving`
        }
      }

      const saved = await saveKindThenRest({
        client: supabase as any,
        entityId: lead.entity_id ?? "",
        plan: namePlan,
        wrap: (fn) => withAuditContext(supabase, userId, fn),
        saveRest: async (outcome) => {
      // So no caminho de recurso (RPC do tipo em falta) e que a lead leva o nome.
      const nameArgs = leadNameArgsAfterKindStep(outcome, namePlan);
      await withAuditContext(supabase, userId, async () => {
        // p_lost_reason is cast via `as any`: it's added by migration
        // 20261112200000_rpc_update_lead_add_lost_reason.sql, not yet
        // reflected in the generated src/integrations/supabase/types.ts
        // (regenerating that file requires a `supabase db push` first,
        // which is out of scope here) — same "as any" pattern already used
        // for genuinely-existing-but-not-yet-typed columns elsewhere in the
        // codebase (e.g. src/pages/Quotes.tsx's lost_reason update).
        const { error } = await supabase.rpc("rpc_update_lead", {
          p_lead_id: lead.id,
          p_field_values: updatedFieldValues,
          p_status: status,
          p_source: source || null,
          p_notes: notes || null,
          p_assigned_to: assignedTo,
          p_status_changed: statusChanged,
          p_workflow_stage_id: statusChanged ? workflowStageId : null,
          p_display_name: nameArgs.displayName ?? null,
          p_first_name: nameArgs.first ?? null,
          p_last_name: nameArgs.last ?? null,
          ...(qualificationChanged
            ? { p_qualification_type: qualificationType, p_qualification_changed: true }
            : {}),
          ...(status === "lost" ? { p_lost_reason: lostReason.trim() } : {}),
        } as any);

        if (error) throw error;
      });

        },
      });
      const kindOutcome: KindStepOutcome = saved.outcome;
      if (kindOutcome.status === "missing") {
        toast({ title: "Nome guardado", description: "A troca de tipo (Pessoa/Empresa) fica completa quando a base de dados for atualizada." });
      } else if (kindOutcome.status === "failed") {
        // O resto da lead ficou guardado (e continua a sincronizar abaixo); o tipo e o nome nao.
        console.error("Error saving entity kind:", kindOutcome.error);
        toast({
          title: "Lead guardada, mas o tipo e o nome da ficha não foram alterados",
          description: await getFriendlyErrorMessage(kindOutcome.error),
          variant: "destructive",
        });
      }
      const fiscalName = kindOutcome.status === "ok"
        ? kindOutcome.displayName
        : kindOutcome.status === "missing" ? namePlan?.fallback.displayName ?? null : null;

      // Link the lead's NIF (if any) to the shared, encrypted fiscal-entities
      // system — same resolve/link mechanism already used for organizations
      // (src/utils/orgFiscalEntity.ts). Requires the lead to already have an
      // entity_id; best-effort — a failed/invalid NIF resolve must never
      // block saving the lead's core data, which already succeeded above.
      if (lead.entity_id) {
        const vatValue = vatToSave;
        if (vatValue) {
          try {
            await linkEntityFiscalEntity(lead.entity_id, vatValue, fiscalName, "PT", userId);
          } catch (fiscalError) {
            console.error("Error linking lead's fiscal entity:", fiscalError);
            const description = await getFriendlyErrorMessage(fiscalError);
            toast({
              title: "Lead guardada, mas o NIF não foi validado",
              description,
              variant: "destructive",
            });
          }
        }
      }

      // Sync Morada/Código Postal/Localidade to the entity's relational
      // address tables (anew_entity_addresses/anew_addresses) — same overwrite
      // semantics as the NIF link above. Without this, a correction made here
      // only ever reached anew_leads.field_values, which contract/document
      // generation (gatherContractData in contractDocument.ts) never reads — so
      // an edited address silently never showed up on the contract.
      // Best-effort: a failing sync must never block saving the lead's core
      // data (already succeeded above). Email e telefone NAO entram aqui: sao a
      // fonte do Info, da proposta e do portal e gravam-se antes da lead.
      if (lead.entity_id) {
        const street = readGeneralField("address", updatedFieldValues);
        const postalCode = readGeneralField("postal_code", updatedFieldValues);
        const city = readGeneralField("city", updatedFieldValues);
        if (street && postalCode) {
          try {
            await linkEntityAddress(lead.entity_id, companyId, street, postalCode, city, userId);
          } catch (addressError) {
            console.error("Error linking lead's address:", addressError);
            const description = await getFriendlyErrorMessage(addressError);
            toast({
              title: "Lead guardada, mas a morada não foi atualizada no contrato",
              description,
              variant: "destructive",
            });
          }
        }
      }

      let workflowFailed = false;
      if (statusChanged && workflowStageId) {
        try {
          const { error: workflowError } = await supabase.functions.invoke("execute-workflow", {
            body: {
              source_entity: "lead",
              entity_id: lead.id,
              new_stage_id: workflowStageId,
              old_stage_id: lead.workflow_stage_id || null,
              organization_id: companyId,
            },
          });

          if (workflowError) {
            throw workflowError;
          }
        } catch (workflowErr) {
          console.error("Error executing workflow automation:", workflowErr);
          workflowFailed = true;
          const description = await getFriendlyErrorMessage(workflowErr);
          toast({
            title: "Lead guardada, mas a automação falhou",
            description,
            variant: "destructive",
          });
        }
      }

      if (!workflowFailed && kindOutcome.status !== "failed") {
        toast({
          title: "Lead atualizada",
          description: "Os dados da lead foram guardados com sucesso.",
        });
      }

      // Avisa o cliente de que mudou o comercial da visita (só se o interruptor da
      // organização estiver ligado). Em segundo plano: a gravação já terminou.
      if (ownerAffectedVisitIds.length > 0) {
        void notifyOwnerChangeVisits(companyId, ownerAffectedVisitIds).then((notified) => {
          if (notified > 0) toast({ title: t("scheduling.notify.clientNotified") });
        });
      }

      onLeadUpdated({
        leadId: lead.id,
        entityId: lead.entity_id,
        status,
        assignedTo,
        source: source || null,
        notes: notes || null,
        workflowStageId,
        fieldValues: updatedFieldValues,
      });
      // Tipo/nome recusado: o ecrã fica aberto para se poder tentar de novo.
      if (kindOutcome.status !== "failed") onOpenChange(false);
    } catch (error) {
      console.error("Error saving lead:", error);
      const failed = "Não foi possível guardar as alterações.";
      toast({
        title: "Erro",
        description: contactsSaved.length > 0 ? `${failed} ${contactsSavedNotice(contactsSaved)}` : failed,
        variant: "destructive",
      });
      if (contactsSaved.length > 0) refreshAfterContactsOnly();
    } finally {
      setSaving(false);
    }
  };

  const statusOptions = [
    { value: "new", label: "Nova" },
    { value: "contacted", label: "Contactada" },
    { value: "qualified", label: "Qualificada" },
    { value: "converted", label: "Convertida" },
    { value: "lost", label: "Perdida" },
    { value: "incomplete", label: "Incompleta" },
  ];

  const qualificationTypeOptions = [
    { value: "sql", label: t("leads.qualificationType.sql") },
    { value: "mql", label: t("leads.qualificationType.mql") },
    { value: "unclassified", label: t("leads.qualificationType.unclassified") },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Lead</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <OlyviaLoader size={28} />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Status, Source, Assigned To */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Fonte</Label>
                <Input
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="Ex: Website, Referência..."
                />
              </div>
              
              <div className="space-y-2">
                <Label>Atribuído a</Label>
                <Select 
                  value={assignedTo || "unassigned"} 
                  onValueChange={(v) => setAssignedTo(v === "unassigned" ? null : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Não atribuído</SelectItem>
                    {companyUsers.map(user => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {status === "lost" && (
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-3 space-y-2">
                  <Label htmlFor="lost_reason">Motivo da Perda *</Label>
                  <Select value={lostReason} onValueChange={setLostReason}>
                    <SelectTrigger id="lost_reason" className={!lostReason ? "border-destructive/50" : ""}>
                      <SelectValue placeholder="Selecione o motivo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {LOST_REASON_OPTIONS.map((opt) => (
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Obrigatório para leads marcadas como perdidas</p>
                </div>
              </div>
            )}

            {status === "qualified" && (
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>{t("leads.qualificationType.label")}</Label>
                  <Select
                    value={qualificationType || "unclassified"}
                    onValueChange={(v) => setQualificationType(v === "unclassified" ? null : v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {qualificationTypeOptions.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <h4 className="text-sm font-semibold border-b pb-2">Dados da Lead</h4>
              <EntityKindSelector value={kind} onChange={setKind} />
              <div className="grid grid-cols-2 gap-4">
                {kind === "organization" && (
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="lead-edit-company-name">Nome da empresa *</Label>
                    <Input
                      id="lead-edit-company-name"
                      value={kindCompany ?? companyValue}
                      onChange={(e) => {
                        setKindCompany(e.target.value);
                        if (fieldErrors.company_name) setFieldErrors(prev => { const next = { ...prev }; delete next.company_name; return next; });
                      }}
                      aria-invalid={!!fieldErrors.company_name}
                      aria-required="true"
                    />
                    {fieldErrors.company_name && <p className="text-xs text-destructive">{fieldErrors.company_name}</p>}
                  </div>
                )}
                {GENERAL_FIELDS.filter((field) => field.key !== "company_name" && (kind !== "organization" || !["first_name", "last_name"].includes(field.key))).map((field) => (
                  <div key={field.key} className="space-y-2">
                    {field.key === "phone" ? (
                      <LeadPhoneField
                        label={field.label}
                        value={readGeneralField(field.key)}
                        onChange={(val) => handleGeneralFieldChange(field.key, val)}
                        invalid={!!fieldErrors[field.key] || contactError?.field === "phone"}
                        describedBy={contactError?.field === "phone" ? contactErrorId : undefined}
                      />
                    ) : (
                      <>
                        <Label>{field.label}</Label>
                        <Input
                          value={readGeneralField(field.key)}
                          onChange={(e) => handleGeneralFieldChange(field.key, e.target.value)}
                          aria-invalid={!!fieldErrors[field.key] || (field.key === "email" && contactError?.field === "email")}
                          aria-describedby={field.key === "email" && contactError?.field === "email" ? contactErrorId : undefined}
                        />
                      </>
                    )}
                    {fieldErrors[field.key] && (
                      <p className="text-xs text-destructive">{fieldErrors[field.key]}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Dynamic Fields from Campaign/Company */}
            {fieldDefs.filter((field) => !isNotesFieldKey(field.field_key) && !isGeneralFieldKey(field.field_key) && !isMappedGeneralField(field)).length > 0 && (
              <div className="space-y-4">
                <h4 className="text-sm font-semibold border-b pb-2">Campos do Formulário</h4>
                <div className="grid grid-cols-2 gap-4">
                  {fieldDefs
                    .filter((field) => !isNotesFieldKey(field.field_key) && !isGeneralFieldKey(field.field_key) && !isMappedGeneralField(field))
                    .map(field => (
                      <DynamicFormField
                        key={field.id}
                        field={field}
                        value={fieldValues[field.field_key] ?? ""}
                        onChange={(val) => handleFieldChange(field.field_key, val)}
                      />
                    ))}
                </div>
              </div>
            )}

            {/* Notes - hide if field definitions already have a notes field */}
            {!fieldDefs.some(f => isNotesFieldKey(f.field_key)) && (
              <div className="space-y-2">
                <Label>Notas</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => {
                    setNotes(e.target.value);
                    if (fieldErrors.notes) {
                      setFieldErrors(prev => {
                        const next = { ...prev };
                        delete next.notes;
                        return next;
                      });
                    }
                  }}
                  placeholder="Adicionar notas sobre esta lead..."
                  rows={3}
                  aria-invalid={!!fieldErrors.notes}
                />
                {fieldErrors.notes && (
                  <p className="text-xs text-destructive">{fieldErrors.notes}</p>
                )}
              </div>
            )}
          </div>
        )}

        {contactError && (
          <p id={contactErrorId} role="alert" className="text-sm text-destructive">
            {contactError.message}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || loading || contactsLoading}>
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                A guardar...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Guardar Alterações
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
