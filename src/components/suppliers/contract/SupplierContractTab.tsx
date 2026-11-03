// Separador «Contrato» da ficha do fornecedor (Fase 3 do Contrato de
// Fornecedor): condições em vigor, versões (CF-AAAA-NNNN · vN) com estado,
// criar rascunho (modelo da empresa ou PDF do fornecedor), e a versão
// escolhida em SupplierContractDetail. Botões conforme can_manage /
// can_countersign devolvidos pelo servidor (rpc_supplier_contracts_list).
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FilePlus2, FileText, Loader2, Lock, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InventoryStatusBadge } from "@/components/inventory/ui";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { describeContractError, supplierContractKeys, supplierContractsRpc } from "@/lib/supplierContracts/rpc";
import {
  KIND_LABEL,
  ORIGIN_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  conditionsRows,
  contractRef,
  fmtData,
  fmtDataHora,
  isOpenStatus,
  type SupplierContractKind,
  type SupplierContractOrigin,
  type SupplierContractSummary,
} from "@/lib/supplierContracts/tipos";
import { SupplierContractDetail } from "./SupplierContractDetail";
import { SupplierContractTemplatesDialog } from "./SupplierContractTemplatesDialog";
import { useInvalidateSupplierContracts, useSupplierContractDetail, useSupplierContractsList } from "./useSupplierContracts";

const NO_TEMPLATE = "__none__";

interface Props {
  supplierId: string;
  supplierName: string;
  organizationId: string | null;
  organizationName?: string | null;
}

/** A versão a abrir por omissão: a em curso, senão a assinada, senão a mais recente. */
export function defaultContractId(list: readonly SupplierContractSummary[]): string | null {
  return (
    list.find((c) => isOpenStatus(c.status))?.id ??
    list.find((c) => c.status === "signed")?.id ??
    list[0]?.id ??
    null
  );
}

export function SupplierContractTab({ supplierId, supplierName, organizationId, organizationName }: Props) {
  const listQuery = useSupplierContractsList(supplierId);
  const invalidate = useInvalidateSupplierContracts();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  const data = listQuery.data;
  const contracts = data?.contracts ?? [];
  const hasOpen = contracts.some((c) => isOpenStatus(c.status));
  // Proposta do fornecedor por responder: conta como contrato em curso (índice "um em curso").
  const pendingProposal = contracts.find((c) => c.status === "proposed") ?? null;
  const active = contracts.find((c) => c.status === "signed") ?? null;

  // Seleção: mantém a escolhida enquanto existir; senão a por omissão.
  useEffect(() => {
    if (!data) return;
    if (selectedId && data.contracts.some((c) => c.id === selectedId)) return;
    setSelectedId(defaultContractId(data.contracts));
  }, [data, selectedId]);

  const detailQuery = useSupplierContractDetail(selectedId);

  if (listQuery.isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> A carregar contratos...
      </p>
    );
  }
  if (listQuery.isError || !data) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {describeContractError(listQuery.error)}
      </p>
    );
  }

  const orgId = organizationId ?? contracts[0]?.organization_id ?? null;

  return (
    <div className="space-y-5">
      {/* Condições em vigor */}
      <section className="rounded-lg border p-4" aria-labelledby="sc-vigentes">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 id="sc-vigentes" className="text-sm font-semibold">
            Condições em vigor
          </h3>
          {active ? (
            <InventoryStatusBadge tone="ok">
              {contractRef(active)} · até {active.valid_until ? fmtData(active.valid_until) : "sem termo"}
            </InventoryStatusBadge>
          ) : (
            <InventoryStatusBadge tone="neutral">Sem contrato assinado</InventoryStatusBadge>
          )}
        </div>
        {data.conditions_locked && active && (
          <p className="mb-2 flex items-start gap-2 text-xs text-muted-foreground">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            As condições do fornecedor (pagamento, entrega, portes, ...) vêm deste contrato e não se editam na ficha: para as
            mudar, faça uma nova versão.
          </p>
        )}
        {active ? (
          <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
            {conditionsRows(active.conditions).map((r) => (
              <div key={r.label} className="flex justify-between gap-3 border-b py-1 text-sm last:border-b-0">
                <dt className="text-muted-foreground">{r.label}</dt>
                <dd className="text-right">{r.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">
            As encomendas a {supplierName} não têm prazo de pagamento definido por contrato.
          </p>
        )}
      </section>

      {/* Versões */}
      <section aria-labelledby="sc-versoes" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="sc-versoes" className="text-sm font-semibold">
            Versões
          </h3>
          <div className="flex flex-wrap gap-2">
            {orgId && (
              <Button type="button" size="sm" variant="outline" onClick={() => setTemplatesOpen(true)}>
                <Settings2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Modelos
              </Button>
            )}
            {/* Com versões anteriores, o rascunho novo continua o número (versão seguinte, em branco);
                «Nova versão» na versão escolhida copia as condições dela. */}
            {data.can_manage && !hasOpen && (
              <Button type="button" size="sm" onClick={() => setNewOpen(true)}>
                <FilePlus2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                {contracts.length === 0 ? "Novo contrato" : "Novo rascunho em branco"}
              </Button>
            )}
            {data.can_manage && pendingProposal && (
              <Button type="button" size="sm" disabled aria-describedby="sc-proposta-pendente">
                <FilePlus2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Novo contrato
              </Button>
            )}
          </div>
        </div>
        {pendingProposal && (
          <p
            id="sc-proposta-pendente"
            className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-amber-900 dark:text-warning"
            role="note"
          >
            {supplierName} propôs um contrato no portal ({contractRef(pendingProposal)}
            {pendingProposal.proposed_by_name ? `, por ${pendingProposal.proposed_by_name}` : ""}). Só pode haver um contrato em
            curso de cada vez: aceite ou recuse a proposta antes de criar outro.{" "}
            {pendingProposal.id !== selectedId && (
              <button
                type="button"
                className="font-medium underline underline-offset-2"
                onClick={() => setSelectedId(pendingProposal.id)}
              >
                Abrir a proposta
              </button>
            )}
          </p>
        )}
        {contracts.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Ainda não há contratos com este fornecedor.
            {data.can_manage
              ? " Crie um rascunho a partir de um modelo da empresa ou do PDF que o fornecedor enviou."
              : " Só quem gere contratos de fornecedor os pode criar."}
          </p>
        ) : (
          <ul className="divide-y rounded-lg border" aria-label="Versões do contrato">
            {contracts.map((c) => {
              const on = c.id === selectedId;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    aria-pressed={on}
                    className={cn(
                      "flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      on && "bg-muted/60",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="font-mono font-semibold">{contractRef(c)}</span>
                      <span className="truncate text-muted-foreground">{c.title}</span>
                      {c.created_via === "portal" && c.status !== "proposed" && (
                        <InventoryStatusBadge tone="violet">Proposta do fornecedor</InventoryStatusBadge>
                      )}
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      <small className="text-xs text-muted-foreground">
                        {c.company_signed_at
                          ? `assinado ${fmtDataHora(c.company_signed_at)}`
                          : c.supplier_signed_at
                            ? `fornecedor assinou ${fmtDataHora(c.supplier_signed_at)}`
                            : c.sent_at
                              ? `enviado ${fmtDataHora(c.sent_at)}`
                              : `criado ${fmtDataHora(c.created_at)}`}
                      </small>
                      <InventoryStatusBadge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</InventoryStatusBadge>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Versão escolhida */}
      {selectedId &&
        (detailQuery.isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> A abrir o contrato...
          </p>
        ) : detailQuery.isError || !detailQuery.data ? (
          <p className="text-sm text-destructive" role="alert">
            {describeContractError(detailQuery.error)}
          </p>
        ) : (
          <SupplierContractDetail
            key={detailQuery.data.id}
            contract={detailQuery.data}
            supplierHasOpenContract={hasOpen}
            onSelect={setSelectedId}
          />
        ))}

      {orgId && (
        <SupplierContractTemplatesDialog
          open={templatesOpen}
          onOpenChange={setTemplatesOpen}
          organizationId={orgId}
          organizationName={organizationName}
          canManage={data.can_manage}
        />
      )}

      {newOpen && orgId && (
        <NewContractDialog
          supplierId={supplierId}
          supplierName={supplierName}
          organizationId={orgId}
          onClose={() => setNewOpen(false)}
          onCreated={(id) => {
            setNewOpen(false);
            void invalidate();
            setSelectedId(id);
          }}
          onOpenTemplates={() => setTemplatesOpen(true)}
        />
      )}
    </div>
  );
}

function NewContractDialog({
  supplierId,
  supplierName,
  organizationId,
  onClose,
  onCreated,
  onOpenTemplates,
}: {
  supplierId: string;
  supplierName: string;
  organizationId: string;
  onClose: () => void;
  onCreated: (id: string) => void;
  onOpenTemplates: () => void;
}) {
  const [origin, setOrigin] = useState<SupplierContractOrigin>("modelo");
  const [kind, setKind] = useState<SupplierContractKind>("material");
  const [templateId, setTemplateId] = useState<string>(NO_TEMPLATE);
  const [title, setTitle] = useState(`Condições comerciais — ${supplierName}`.slice(0, 200));
  const [saving, setSaving] = useState(false);

  const templatesQuery = useQuery({
    queryKey: supplierContractKeys.templates(organizationId),
    queryFn: () => supplierContractsRpc.templatesList(organizationId, null, false),
  });
  const templates = (templatesQuery.data ?? []).filter((t) => t.kind === kind);

  // Ao mudar de tipo, escolhe o primeiro modelo desse tipo.
  useEffect(() => {
    setTemplateId(templates[0]?.id ?? NO_TEMPLATE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, templatesQuery.data]);

  const create = async () => {
    if (!title.trim()) {
      toast.error("O título é obrigatório.");
      return;
    }
    setSaving(true);
    try {
      const c = await supplierContractsRpc.saveDraft(null, supplierId, {
        title: title.trim(),
        kind,
        origin,
        ...(origin === "modelo" && templateId !== NO_TEMPLATE ? { template_id: templateId } : {}),
      });
      toast.success(`Rascunho ${contractRef(c)} criado`, { description: "Preencha as condições comerciais e envie ao fornecedor." });
      onCreated(c.id);
    } catch (err) {
      toast.error(describeContractError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && !saving && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo contrato de fornecedor</DialogTitle>
          <DialogDescription>
            Fica em rascunho: as condições e a validade preenchem-se a seguir. O número CF-AAAA-NNNN é atribuído agora e
            mantém-se nas versões seguintes.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sc-new-title">Título *</Label>
            <Input id="sc-new-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} className="h-9" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sc-new-kind">Tipo</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as SupplierContractKind)}>
                <SelectTrigger id="sc-new-kind" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="material">{KIND_LABEL.material}</SelectItem>
                  <SelectItem value="servico">{KIND_LABEL.servico}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sc-new-origin">Origem do texto</Label>
              <Select value={origin} onValueChange={(v) => setOrigin(v as SupplierContractOrigin)}>
                <SelectTrigger id="sc-new-origin" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="modelo">{ORIGIN_LABEL.modelo}</SelectItem>
                  <SelectItem value="pdf_fornecedor">{ORIGIN_LABEL.pdf_fornecedor}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {origin === "modelo" ? (
            <div className="space-y-1.5">
              <Label htmlFor="sc-new-tpl">Modelo</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger id="sc-new-tpl" className="h-9">
                  <SelectValue placeholder={templatesQuery.isLoading ? "A carregar..." : "Escolher modelo"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TEMPLATE}>Sem modelo (escolher depois)</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!templatesQuery.isLoading && templates.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Não há modelos ativos deste tipo.{" "}
                  <button type="button" className="text-primary underline underline-offset-2" onClick={onOpenTemplates}>
                    Abrir modelos
                  </button>
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Depois de criar o rascunho, anexe o PDF do contrato do fornecedor; o documento enviado é o resumo das condições
              com a referência (e o SHA-256) desse PDF.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" onClick={() => void create()} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
            Criar rascunho
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
