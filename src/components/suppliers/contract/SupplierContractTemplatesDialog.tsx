// Modelos do Contrato de Fornecedor (supplier_contract_templates) por
// organização. Reaproveita o editor das minutas de cliente (RichTextEditor, o
// mesmo de ContractTemplates.tsx) em "modo fornecedor": só as variáveis de
// rpc_supplier_contract_template_variables, sem cabeçalhos/assinaturas/tabelas
// de proposta (o servidor recusa variáveis desconhecidas e conteúdo ativo).
// "Criar modelos base" grava pela RPC os dois modelos de modelosBase.ts.
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileText, Loader2, Pencil, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RichTextEditor, type RichTextEditorHandle } from "@/components/RichTextEditor";
import { InventoryStatusBadge } from "@/components/inventory/ui";
import { stripVariableChips } from "@/components/contracts/contractDocument";
import { sanitizeRichHtml } from "@/utils/sanitize";
import { toast } from "@/lib/toast";
import { BASE_SUPPLIER_TEMPLATES } from "@/lib/supplierContracts/modelosBase";
import { describeContractError, supplierContractKeys, supplierContractsRpc } from "@/lib/supplierContracts/rpc";
import { KIND_LABEL, fmtDataHora, type SupplierContractKind, type SupplierContractTemplate } from "@/lib/supplierContracts/tipos";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  organizationName?: string | null;
  canManage: boolean;
}

interface Draft {
  id: string | null;
  name: string;
  kind: SupplierContractKind;
  description: string;
  body_html: string;
  is_active: boolean;
}

const EMPTY: Draft = { id: null, name: "", kind: "material", description: "", body_html: "", is_active: true };

/** O HTML que segue para o servidor: sem as pastilhas do editor e sanitizado. */
export const cleanTemplateHtml = (html: string): string => sanitizeRichHtml(stripVariableChips(html)).trim();

/** Variáveis do texto que o servidor não conhece (fn_sc_validar_corpo recusa-as). */
export function unknownVariables(html: string, known: ReadonlySet<string>): string[] {
  const out = new Set<string>();
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) if (!known.has(m[1])) out.add(m[1]);
  return [...out];
}

export function SupplierContractTemplatesDialog({ open, onOpenChange, organizationId, organizationName, canManage }: Props) {
  const queryClient = useQueryClient();
  const editorRef = useRef<RichTextEditorHandle>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const templatesQuery = useQuery({
    queryKey: supplierContractKeys.templates(organizationId),
    queryFn: () => supplierContractsRpc.templatesList(organizationId, null, true),
    enabled: open && !!organizationId,
  });
  const variablesQuery = useQuery({
    queryKey: supplierContractKeys.variables(),
    queryFn: () => supplierContractsRpc.templateVariables(),
    enabled: open,
    staleTime: Infinity,
  });

  const editorVariables = useMemo(
    () =>
      (variablesQuery.data ?? []).map((v) => ({
        key: `{{${v.key}}}`,
        label: v.label,
        description: v.example ? `Ex.: ${v.example}` : undefined,
      })),
    [variablesQuery.data],
  );
  const knownKeys = useMemo(() => new Set((variablesQuery.data ?? []).map((v) => v.key)), [variablesQuery.data]);

  const templates = templatesQuery.data ?? [];
  const missingBase = BASE_SUPPLIER_TEMPLATES.filter((b) => !templates.some((t) => t.kind === b.kind));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["supplier-contracts", "templates"] });

  const saveMutation = useMutation({
    mutationFn: async (d: Draft) => {
      const body = cleanTemplateHtml(d.body_html);
      return supplierContractsRpc.templateSave(d.id, d.id ? null : organizationId, {
        name: d.name.trim(),
        kind: d.kind,
        description: d.description.trim() || null,
        body_html: body,
        is_active: d.is_active,
      });
    },
    onSuccess: () => {
      toast.success("Modelo guardado");
      setDraft(null);
      void invalidate();
    },
    onError: (err) => toast.error(describeContractError(err)),
  });

  const baseMutation = useMutation({
    mutationFn: async () => {
      for (const b of missingBase) {
        await supplierContractsRpc.templateSave(null, organizationId, {
          name: b.name,
          kind: b.kind,
          description: b.description,
          body_html: b.body_html,
          is_active: true,
        });
      }
      return missingBase.length;
    },
    onSuccess: (n) => {
      toast.success(n === 1 ? "Modelo base criado" : `${n} modelos base criados`);
      void invalidate();
    },
    onError: (err) => {
      toast.error(describeContractError(err));
      void invalidate();
    },
  });

  const startEdit = (t: SupplierContractTemplate | null) =>
    setDraft(
      t
        ? { id: t.id, name: t.name, kind: t.kind, description: t.description ?? "", body_html: t.body_html, is_active: t.is_active }
        : { ...EMPTY },
    );

  const unknown = draft ? unknownVariables(stripVariableChips(draft.body_html), knownKeys) : [];
  const canSave = !!draft && draft.name.trim().length > 0 && cleanTemplateHtml(draft.body_html).length > 0 && unknown.length === 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setDraft(null);
        onOpenChange(v);
      }}
    >
      <DialogContent className="flex max-h-[92vh] max-w-4xl flex-col">
        <DialogHeader>
          <DialogTitle>{draft ? (draft.id ? "Editar modelo" : "Novo modelo") : "Modelos de contrato de fornecedor"}</DialogTitle>
          <DialogDescription>
            {organizationName ? `${organizationName}. ` : ""}
            Os modelos servem de texto aos contratos novos; as variáveis entre chavetas são preenchidas no envio com os dados
            do fornecedor e as condições do contrato.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {!draft ? (
            <div className="space-y-3">
              {templatesQuery.isLoading ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> A carregar modelos...
                </p>
              ) : templatesQuery.isError ? (
                <p className="text-sm text-destructive" role="alert">
                  {describeContractError(templatesQuery.error)}
                </p>
              ) : templates.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ainda não há modelos nesta empresa.</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {templates.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-1.5 font-medium">
                          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                          <span className="truncate">{t.name}</span>
                          <InventoryStatusBadge tone="info">{KIND_LABEL[t.kind]}</InventoryStatusBadge>
                          {!t.is_active && <InventoryStatusBadge tone="neutral">Inativo</InventoryStatusBadge>}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {t.description || "Sem descrição"} · alterado {fmtDataHora(t.updated_at)}
                        </p>
                      </div>
                      {canManage && (
                        <Button type="button" variant="outline" size="sm" onClick={() => startEdit(t)}>
                          <Pencil className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Editar
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {canManage && missingBase.length > 0 && !templatesQuery.isLoading && !templatesQuery.isError && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-info/30 bg-info/10 px-3.5 py-3 text-sm">
                  <span>
                    Falta{missingBase.length > 1 ? "m" : ""} o{missingBase.length > 1 ? "s" : ""} modelo
                    {missingBase.length > 1 ? "s" : ""} base: {missingBase.map((b) => `«${b.name}»`).join(" e ")}.
                  </span>
                  <Button type="button" size="sm" variant="outline" onClick={() => baseMutation.mutate()} disabled={baseMutation.isPending}>
                    {baseMutation.isPending ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Sparkles className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    Criar modelos base
                  </Button>
                </div>
              )}
              {!canManage && (
                <p className="text-xs text-muted-foreground">Só quem gere contratos de fornecedor pode criar ou alterar modelos.</p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="sct-name">Nome *</Label>
                  <Input id="sct-name" value={draft.name} maxLength={200} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sct-kind">Tipo</Label>
                  <Select value={draft.kind} onValueChange={(v) => setDraft({ ...draft, kind: v as SupplierContractKind })}>
                    <SelectTrigger id="sct-kind" className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="material">{KIND_LABEL.material}</SelectItem>
                      <SelectItem value="servico">{KIND_LABEL.servico}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="sct-desc">Descrição</Label>
                  <Textarea
                    id="sct-desc"
                    rows={2}
                    maxLength={2000}
                    value={draft.description}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  />
                </div>
                <div className="flex min-h-6 items-center gap-2 sm:col-span-2">
                  <Switch id="sct-active" checked={draft.is_active} onCheckedChange={(c) => setDraft({ ...draft, is_active: !!c })} />
                  <Label htmlFor="sct-active" className="cursor-pointer">
                    Ativo (aparece ao criar contratos)
                  </Label>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Texto do contrato *</Label>
                {unknown.length > 0 && (
                  <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive" role="alert">
                    Variáveis que não existem nos contratos de fornecedor (o servidor recusa o modelo):{" "}
                    {unknown.map((k) => `{{${k}}}`).join(", ")}
                  </p>
                )}
                <RichTextEditor
                  ref={editorRef}
                  value={draft.body_html}
                  onChange={(v) => setDraft((d) => (d ? { ...d, body_html: v } : d))}
                  placeholder="Escreva as cláusulas; insira as variáveis pelo botão de variáveis."
                  variables={editorVariables}
                  minHeight="360px"
                />
                <div className="rounded-lg border bg-muted/20 p-3">
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Variáveis (clique para inserir)
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {(variablesQuery.data ?? []).map((v) => (
                      <button
                        key={v.key}
                        type="button"
                        onClick={() => editorRef.current?.insertVariable(`{{${v.key}}}`)}
                        className="min-h-6 rounded border bg-background px-1.5 py-0.5 font-mono text-[11px] hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        title={v.example ? `${v.label} — ex.: ${v.example}` : v.label}
                      >
                        {`{{${v.key}}}`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {draft ? (
            <>
              <Button type="button" variant="outline" onClick={() => setDraft(null)} disabled={saveMutation.isPending}>
                <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" /> Voltar
              </Button>
              <Button type="button" onClick={() => draft && saveMutation.mutate(draft)} disabled={!canSave || saveMutation.isPending}>
                {saveMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
                Guardar modelo
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
              {canManage && (
                <Button type="button" onClick={() => startEdit(null)}>
                  <Plus className="mr-1 h-4 w-4" aria-hidden="true" /> Novo modelo
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
