// Rascunho de um contrato de fornecedor: título, origem (modelo da empresa ou
// PDF do fornecedor), modelo/texto, condições estruturadas e validade. Grava
// por rpc_supplier_contract_save_draft (só as chaves alteradas no texto;
// condições e validade sempre). O PDF/anexos vão pela Edge
// supplier-contract-action (acoes.ts, Fase 2).
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileUp, Loader2, Pencil, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RichTextEditor } from "@/components/RichTextEditor";
import { toast } from "@/lib/toast";
import { describeContractError, supplierContractKeys, supplierContractsRpc, type SaveDraftData } from "@/lib/supplierContracts/rpc";
import { uploadContractFile, validateContractFile } from "@/lib/supplierContracts/acoes";
import {
  KIND_LABEL,
  ORIGIN_LABEL,
  conditionsToForm,
  formToConditions,
  type ConditionsFormValues,
  type SupplierContractDetail,
  type SupplierContractFile,
  type SupplierContractOrigin,
} from "@/lib/supplierContracts/tipos";
import { SupplierContractConditionsFields } from "./SupplierContractConditionsFields";
import { cleanTemplateHtml, unknownVariables } from "./SupplierContractTemplatesDialog";
import { stripVariableChips } from "@/components/contracts/contractDocument";

const NO_TEMPLATE = "__none__";

interface Props {
  contract: SupplierContractDetail;
  onSaved: (c: SupplierContractDetail) => void;
  onFilesChanged: () => void;
  onDirtyChange: (dirty: boolean) => void;
}

interface TextState {
  title: string;
  origin: SupplierContractOrigin;
  templateId: string | null;
  body: string;
}

const textFrom = (c: SupplierContractDetail): TextState => ({
  title: c.title,
  origin: c.origin,
  templateId: c.template_id,
  body: c.body_html ?? "",
});

export function SupplierContractDraftEditor({ contract, onSaved, onFilesChanged, onDirtyChange }: Props) {
  const [text, setText] = useState<TextState>(() => textFrom(contract));
  const [bodyDirty, setBodyDirty] = useState(false);
  const [editingBody, setEditingBody] = useState(false);
  const [cond, setCond] = useState<ConditionsFormValues>(() =>
    conditionsToForm(contract.conditions, contract.valid_from, contract.valid_until),
  );
  const [errors, setErrors] = useState<Partial<Record<keyof ConditionsFormValues, string>>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<SupplierContractFile["kind"] | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const annexInput = useRef<HTMLInputElement>(null);

  // Ao mudar de contrato ou depois de gravar, volta ao que está no servidor.
  useEffect(() => {
    setText(textFrom(contract));
    setBodyDirty(false);
    setEditingBody(false);
    setCond(conditionsToForm(contract.conditions, contract.valid_from, contract.valid_until));
    setErrors({});
  }, [contract.id, contract.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const templatesQuery = useQuery({
    queryKey: supplierContractKeys.templates(contract.organization_id),
    queryFn: () => supplierContractsRpc.templatesList(contract.organization_id, null, false),
  });
  const variablesQuery = useQuery({
    queryKey: supplierContractKeys.variables(),
    queryFn: () => supplierContractsRpc.templateVariables(),
    staleTime: Infinity,
  });
  const templates = templatesQuery.data ?? [];
  const knownKeys = useMemo(() => new Set((variablesQuery.data ?? []).map((v) => v.key)), [variablesQuery.data]);
  const editorVariables = useMemo(
    () => (variablesQuery.data ?? []).map((v) => ({ key: `{{${v.key}}}`, label: v.label, description: v.example ? `Ex.: ${v.example}` : undefined })),
    [variablesQuery.data],
  );

  const initialCond = useMemo(
    () => JSON.stringify(conditionsToForm(contract.conditions, contract.valid_from, contract.valid_until)),
    [contract.conditions, contract.valid_from, contract.valid_until],
  );
  const textDirty =
    text.title !== contract.title || text.origin !== contract.origin || text.templateId !== contract.template_id || bodyDirty;
  const dirty = textDirty || JSON.stringify(cond) !== initialCond;

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  const unknown = text.origin === "modelo" ? unknownVariables(stripVariableChips(text.body), knownKeys) : [];

  const chooseTemplate = (id: string) => {
    if (id === NO_TEMPLATE) {
      setText((t) => ({ ...t, templateId: null }));
      return;
    }
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    // O servidor copia o texto do modelo quando só recebe template_id.
    setText((t) => ({ ...t, templateId: tpl.id, body: tpl.body_html }));
    setBodyDirty(false);
  };

  const save = async () => {
    const parsed = formToConditions(cond);
    setErrors(parsed.errors);
    if (Object.keys(parsed.errors).length > 0) {
      toast.error("Corrija os campos assinalados.");
      return;
    }
    if (!text.title.trim()) {
      toast.error("O título é obrigatório.");
      return;
    }
    if (unknown.length > 0) {
      toast.error("O texto tem variáveis que não existem nos contratos de fornecedor.");
      return;
    }
    const data: SaveDraftData = {
      conditions: parsed.conditions,
      valid_from: parsed.valid_from,
      valid_until: parsed.valid_until,
    };
    if (text.title !== contract.title) data.title = text.title.trim();
    if (text.origin !== contract.origin) data.origin = text.origin;
    if (text.origin === "modelo") {
      if (text.templateId !== contract.template_id) data.template_id = text.templateId;
      if (bodyDirty) data.body_html = cleanTemplateHtml(text.body) || null;
    }
    setSaving(true);
    try {
      const saved = await supplierContractsRpc.saveDraft(contract.id, null, data);
      toast.success("Rascunho guardado");
      onSaved(saved);
    } catch (err) {
      toast.error(describeContractError(err));
    } finally {
      setSaving(false);
    }
  };

  const upload = async (kind: SupplierContractFile["kind"], file: File | undefined) => {
    if (!file) return;
    const invalid = validateContractFile(file, kind);
    if (invalid) {
      toast.error(invalid);
      return;
    }
    setUploading(kind);
    const r = await uploadContractFile(contract.id, kind, file);
    setUploading(null);
    if (r.error) {
      toast.error(r.error.message);
      return;
    }
    toast.success(
      r.data.already_registered
        ? "Este ficheiro já estava no contrato"
        : kind === "contrato_fornecedor"
          ? "PDF do fornecedor anexado"
          : "Anexo adicionado",
      { description: `SHA-256 ${r.data.sha256.slice(0, 12)}…` },
    );
    onFilesChanged();
  };

  const mainFile = contract.files.find((f) => f.is_main) ?? null;
  const originChangedUnsaved = text.origin !== contract.origin;

  return (
    <div className="space-y-5">
      <section className="space-y-3" aria-labelledby={`scd-${contract.id}-doc`}>
        <h4 id={`scd-${contract.id}-doc`} className="text-sm font-semibold">
          Documento
        </h4>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor={`scd-${contract.id}-title`}>Título *</Label>
            <Input
              id={`scd-${contract.id}-title`}
              value={text.title}
              maxLength={200}
              onChange={(e) => setText((t) => ({ ...t, title: e.target.value }))}
              className="h-9"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`scd-${contract.id}-origin`}>Origem do texto</Label>
            <Select value={text.origin} onValueChange={(v) => setText((t) => ({ ...t, origin: v as SupplierContractOrigin }))}>
              <SelectTrigger id={`scd-${contract.id}-origin`} className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="modelo">{ORIGIN_LABEL.modelo}</SelectItem>
                <SelectItem value="pdf_fornecedor">{ORIGIN_LABEL.pdf_fornecedor}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {text.origin === "modelo" ? (
            <div className="space-y-1.5">
              <Label htmlFor={`scd-${contract.id}-tpl`}>Modelo</Label>
              <Select value={text.templateId ?? NO_TEMPLATE} onValueChange={chooseTemplate}>
                <SelectTrigger id={`scd-${contract.id}-tpl`} className="h-9">
                  <SelectValue placeholder={templatesQuery.isLoading ? "A carregar..." : "Escolher modelo"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TEMPLATE}>Sem modelo (texto próprio)</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} · {KIND_LABEL[t.kind]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!templatesQuery.isLoading && templates.length === 0 && (
                <p className="text-xs text-muted-foreground">Não há modelos ativos: crie-os em «Modelos».</p>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <span className="text-sm font-medium">PDF do fornecedor</span>
              {originChangedUnsaved ? (
                <p className="text-xs text-muted-foreground">Grave o rascunho para poder anexar o PDF.</p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm">{mainFile ? mainFile.file_name : "Por anexar"}</span>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="application/pdf"
                    className="sr-only"
                    aria-label="Escolher o PDF do contrato do fornecedor"
                    onChange={(e) => {
                      void upload("contrato_fornecedor", e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                  <Button type="button" size="sm" variant="outline" onClick={() => fileInput.current?.click()} disabled={!!uploading}>
                    {uploading === "contrato_fornecedor" ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <FileUp className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {mainFile ? "Substituir PDF" : "Anexar PDF"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {text.origin === "modelo" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">Texto do contrato</span>
              {!editingBody && (
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditingBody(true)}>
                  <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Ajustar texto
                </Button>
              )}
            </div>
            {unknown.length > 0 && (
              <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive" role="alert">
                Variáveis desconhecidas: {unknown.map((k) => `{{${k}}}`).join(", ")}
              </p>
            )}
            {editingBody ? (
              <RichTextEditor
                value={text.body}
                onChange={(v) => {
                  setText((t) => ({ ...t, body: v }));
                  setBodyDirty(true);
                }}
                variables={editorVariables}
                minHeight="280px"
                maxHeight="520px"
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                {text.body
                  ? "O texto vem do modelo escolhido; use «Pré-visualizar» para ver o documento com os dados do fornecedor."
                  : "Escolha um modelo ou ajuste o texto antes de enviar."}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={annexInput}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            className="sr-only"
            aria-label="Escolher um anexo do contrato"
            onChange={(e) => {
              void upload("anexo", e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <Button type="button" size="sm" variant="outline" onClick={() => annexInput.current?.click()} disabled={!!uploading}>
            {uploading === "anexo" ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <FileUp className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            )}
            Adicionar anexo
          </Button>
          <span className="text-xs text-muted-foreground">PDF, JPEG ou PNG até 15 MB. Ficam presos ao documento enviado.</span>
        </div>
      </section>

      <section className="space-y-3" aria-labelledby={`scd-${contract.id}-cond`}>
        <h4 id={`scd-${contract.id}-cond`} className="text-sm font-semibold">
          Condições comerciais
        </h4>
        <SupplierContractConditionsFields idPrefix={`scd-${contract.id}`} values={cond} setValues={setCond} errors={errors} />
      </section>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {dirty && <span className="text-xs text-amber-700 dark:text-warning">Alterações por gravar</span>}
        <Button type="button" onClick={() => void save()} disabled={saving || !dirty}>
          {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="mr-1 h-4 w-4" aria-hidden="true" />}
          Guardar rascunho
        </Button>
      </div>
    </div>
  );
}
