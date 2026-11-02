// Uma versão do contrato de fornecedor (rpc_supplier_contract_get): estado,
// ações conforme o estado e as permissões do servidor (can_manage /
// can_countersign), condições, assinaturas (fornecedor e empresa), recusa,
// cancelamento, ficheiros e histórico. Em rascunho mostra o editor.
import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Ban,
  Download,
  Eye,
  FileText,
  History,
  Loader2,
  Mail,
  PenTool,
  RefreshCw,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { InventoryStatusBadge } from "@/components/inventory/ui";
import { sanitizeRichHtml } from "@/utils/sanitize";
import { toast } from "@/lib/toast";
import { describeContractError, supplierContractKeys, supplierContractsRpc } from "@/lib/supplierContracts/rpc";
import { downloadContractFile, resendContractEmail } from "@/lib/supplierContracts/acoes";
import {
  KIND_LABEL,
  ORIGIN_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  conditionsRows,
  contractRef,
  fmtData,
  fmtDataHora,
  hojeLisboa,
  isOpenStatus,
  missingForSend,
  type SupplierContractDetail as Detail,
} from "@/lib/supplierContracts/tipos";
import { SupplierContractDraftEditor } from "./SupplierContractDraftEditor";
import { SupplierContractCountersignDialog } from "./SupplierContractCountersignDialog";
import { useInvalidateSupplierContracts } from "./useSupplierContracts";

interface Props {
  contract: Detail;
  /** Há outra versão em curso deste fornecedor (bloqueia "Nova versão"). */
  supplierHasOpenContract: boolean;
  onSelect: (contractId: string) => void;
}

const shortHash = (h: string | null | undefined) => (h ? `${h.slice(0, 12)}…${h.slice(-6)}` : "—");

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,11rem)_1fr] gap-2 py-1 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function Hash({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <code className="font-mono text-xs" title={value}>
      {shortHash(value)}
    </code>
  );
}

export function SupplierContractDetail({ contract, supplierHasOpenContract, onSelect }: Props) {
  const invalidate = useInvalidateSupplierContracts();
  const [dirty, setDirty] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [signOpen, setSignOpen] = useState(false);
  const [busy, setBusy] = useState<null | "send" | "cancel" | "new" | "resend">(null);

  const c = contract;
  const isDraft = c.status === "draft";
  const canManage = c.can_manage;
  const label = contractRef(c);
  const missing = isDraft ? missingForSend(c, hojeLisboa()) : [];

  const previewQuery = useQuery({
    queryKey: supplierContractKeys.preview(c.id, c.updated_at),
    queryFn: () => supplierContractsRpc.preview(c.id),
    enabled: previewOpen,
  });

  const onDirtyChange = useCallback((d: boolean) => setDirty(d), []);

  const doSend = async () => {
    setBusy("send");
    try {
      await supplierContractsRpc.send(c.id);
      setSendOpen(false);
      // A RPC só congela e publica no portal; o aviso por e-mail ao titular é da Edge.
      const mail = await resendContractEmail(c.id);
      const para = !mail.error && mail.data.recipients?.length ? ` (${mail.data.recipients.join(", ")})` : "";
      if (!mail.error && mail.data.smtp_status === "sent") {
        toast.success(`Contrato ${label} enviado ao fornecedor`, {
          description: `Pedido de assinatura enviado por e-mail${para}; o fornecedor assina no portal com código SMS.`,
        });
      } else {
        toast.warning(`Contrato ${label} enviado ao portal, mas o e-mail não seguiu`, {
          description: `${mail.error ? mail.error.message : mail.data.message || "Falha no envio do e-mail."} Use «Reenviar pedido» mais tarde.`,
          duration: 12000,
        });
      }
      await invalidate();
    } catch (err) {
      toast.error(describeContractError(err));
    } finally {
      setBusy(null);
    }
  };

  const doCancel = async () => {
    const reason = cancelReason.trim();
    if (!isDraft && reason.length < 3) {
      toast.error("Indique o motivo do cancelamento (pelo menos 3 caracteres).");
      return;
    }
    setBusy("cancel");
    try {
      await supplierContractsRpc.cancel(c.id, reason || null);
      toast.success(isDraft ? "Rascunho cancelado" : `Contrato ${label} cancelado`);
      setCancelOpen(false);
      setCancelReason("");
      await invalidate();
    } catch (err) {
      toast.error(describeContractError(err));
    } finally {
      setBusy(null);
    }
  };

  const doNewVersion = async () => {
    setBusy("new");
    try {
      const n = await supplierContractsRpc.newVersion(c.id);
      toast.success(`Versão ${n.version} criada em rascunho`, { description: "Reveja as condições e a validade antes de enviar." });
      await invalidate();
      onSelect(n.id);
    } catch (err) {
      toast.error(describeContractError(err));
    } finally {
      setBusy(null);
    }
  };

  const doResend = async () => {
    setBusy("resend");
    const r = await resendContractEmail(c.id);
    setBusy(null);
    if (r.error) {
      toast.error(r.error.message);
      return;
    }
    const para = r.data.recipients?.length ? r.data.recipients.join(", ") : null;
    if (r.data.smtp_status === "sent") toast.success(para ? `Pedido de assinatura reenviado para ${para}` : "Pedido de assinatura reenviado");
    else if (r.data.smtp_status === "not_found")
      toast.error(r.data.message || "Não há configuração de e-mail (SMTP) para enviar o pedido.");
    else toast.error(r.data.message || "O e-mail não foi enviado. Tente novamente.");
  };

  const doDownload = async (fileId: string) => {
    const r = await downloadContractFile(fileId);
    if (r.error) {
      toast.error(r.error.message);
      return;
    }
    window.open(r.data.url, "_blank", "noopener,noreferrer");
  };

  const canCancel = canManage && isOpenStatus(c.status);
  const canNewVersion = canManage && !isOpenStatus(c.status) && !supplierHasOpenContract;

  return (
    <div className="space-y-5 rounded-lg border p-4">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold">{label}</span>
            <InventoryStatusBadge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</InventoryStatusBadge>
            {c.expires_soon && c.days_to_expiry !== null && (
              <InventoryStatusBadge tone="warn">Expira em {c.days_to_expiry} dias</InventoryStatusBadge>
            )}
          </p>
          <h3 className="mt-1 truncate text-base font-semibold">{c.title}</h3>
          <p className="text-xs text-muted-foreground">
            {KIND_LABEL[c.kind]} · {ORIGIN_LABEL[c.origin]} · validade {fmtData(c.valid_from)} a {c.valid_until ? fmtData(c.valid_until) : "sem termo"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setPreviewOpen(true)} disabled={isDraft && dirty}>
            <Eye className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Pré-visualizar
          </Button>
          {isDraft && canManage && (
            <Button type="button" size="sm" onClick={() => setSendOpen(true)} disabled={dirty || missing.length > 0 || busy !== null}>
              <Send className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Enviar ao fornecedor
            </Button>
          )}
          {c.status === "sent" && canManage && (
            <Button type="button" size="sm" variant="outline" onClick={() => void doResend()} disabled={busy !== null}>
              {busy === "resend" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Mail className="mr-1 h-3.5 w-3.5" aria-hidden="true" />}
              Reenviar pedido
            </Button>
          )}
          {c.status === "signed_supplier" && c.can_countersign && (
            <Button type="button" size="sm" onClick={() => setSignOpen(true)}>
              <PenTool className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> Contra-assinar
            </Button>
          )}
          {canNewVersion && (
            <Button type="button" size="sm" variant="outline" onClick={() => void doNewVersion()} disabled={busy !== null}>
              {busy === "new" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />}
              Nova versão
            </Button>
          )}
          {canCancel && (
            <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => setCancelOpen(true)} disabled={busy !== null}>
              <Ban className="mr-1 h-3.5 w-3.5" aria-hidden="true" /> {isDraft ? "Cancelar rascunho" : "Cancelar"}
            </Button>
          )}
        </div>
      </div>

      {isDraft && canManage && missing.length > 0 && (
        <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-amber-900 dark:text-warning" role="note">
          Para enviar falta: {missing.join(", ")}.
        </p>
      )}
      {isDraft && canManage && dirty && (
        <p className="text-xs text-muted-foreground">Grave o rascunho antes de pré-visualizar ou enviar.</p>
      )}
      {c.status === "signed_supplier" && !c.can_countersign && (
        <p className="rounded-lg border border-info/30 bg-info/10 px-3 py-2 text-xs text-sky-900 dark:text-info" role="note">
          À espera da contra-assinatura da empresa: precisa de «Gerir contratos de fornecedor» e de um papel com poderes para
          assinar contratos.
        </p>
      )}

      {/* Rascunho: editor; resto: só leitura */}
      {isDraft && canManage ? (
        <SupplierContractDraftEditor
          contract={c}
          onSaved={() => void invalidate()}
          onFilesChanged={() => void invalidate()}
          onDirtyChange={onDirtyChange}
        />
      ) : (
        <section aria-label="Condições comerciais">
          <h4 className="mb-1 text-sm font-semibold">Condições comerciais</h4>
          <dl className="divide-y">
            {conditionsRows(c.conditions).map((r) => (
              <Row key={r.label} label={r.label}>
                {r.value}
              </Row>
            ))}
          </dl>
        </section>
      )}

      {/* Documento enviado */}
      {c.sent_at && (
        <section aria-label="Documento enviado">
          <h4 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
            <FileText className="h-4 w-4" aria-hidden="true" /> Documento enviado
          </h4>
          <dl>
            <Row label="Enviado em">{fmtDataHora(c.sent_at)}</Row>
            <Row label="SHA-256 do documento">
              <Hash value={c.document_sha256} />
            </Row>
          </dl>
        </section>
      )}

      {/* Assinatura do fornecedor */}
      {c.supplier_signed_at && (
        <section aria-label="Assinatura do fornecedor" className="rounded-lg border border-success/30 bg-success/5 p-3">
          <h4 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-green-700 dark:text-success" aria-hidden="true" /> Assinado pelo fornecedor (SMS)
          </h4>
          <dl>
            <Row label="Quem">
              {c.supplier_signed_by_name || "—"}
              {c.supplier_signed_by_email ? <span className="text-muted-foreground"> · {c.supplier_signed_by_email}</span> : null}
            </Row>
            <Row label="Quando">{fmtDataHora(c.supplier_signed_at)}</Row>
            <Row label="Telemóvel">{c.supplier_signed_phone_masked || "—"}</Row>
            <Row label="Documento assinado (SHA-256)">
              <Hash value={c.supplier_signed_document_sha256} />
            </Row>
            <Row label="Selo da assinatura (SHA-256)">
              <Hash value={c.supplier_signature_sha256} />
            </Row>
            {c.supplier_signed_ip ? <Row label="IP">{c.supplier_signed_ip}</Row> : null}
          </dl>
        </section>
      )}

      {/* Contra-assinatura */}
      {c.company_signed_at && (
        <section aria-label="Contra-assinatura da empresa" className="rounded-lg border border-success/30 bg-success/5 p-3">
          <h4 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
            <PenTool className="h-4 w-4 text-green-700 dark:text-success" aria-hidden="true" /> Contra-assinado pela empresa
          </h4>
          <dl>
            <Row label="Quem">{c.company_signed_by_name || "—"}</Row>
            <Row label="Quando">{fmtDataHora(c.company_signed_at)}</Row>
            <Row label="Modo">{c.company_signature_mode === "sms_otp" ? "Código SMS" : c.company_signature_mode || "—"}</Row>
          </dl>
        </section>
      )}

      {/* Recusa */}
      {c.status === "refused" && (
        <section aria-label="Recusa do fornecedor" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <h4 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
            <XCircle className="h-4 w-4 text-destructive" aria-hidden="true" /> Recusado pelo fornecedor
          </h4>
          <dl>
            <Row label="Quando">{fmtDataHora(c.refused_at)}</Row>
            <Row label="Motivo">
              <span className="whitespace-pre-wrap">{c.refusal_reason || "—"}</span>
            </Row>
          </dl>
          {canNewVersion && (
            <p className="mt-1 text-xs text-muted-foreground">Ajuste as condições numa nova versão e volte a enviar.</p>
          )}
        </section>
      )}

      {/* Cancelamento */}
      {c.status === "cancelled" && (
        <section aria-label="Cancelamento" className="rounded-lg border p-3">
          <h4 className="mb-1 text-sm font-semibold">Cancelado pela empresa</h4>
          <dl>
            <Row label="Quando">{fmtDataHora(c.cancelled_at)}</Row>
            <Row label="Motivo">
              <span className="whitespace-pre-wrap">{c.cancel_reason || "—"}</span>
            </Row>
          </dl>
        </section>
      )}

      {/* Ficheiros */}
      {c.files.length > 0 && (
        <section aria-label="Ficheiros">
          <h4 className="mb-1 text-sm font-semibold">Ficheiros</h4>
          <ul className="divide-y rounded-lg border">
            {c.files.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate">
                    {f.file_name}{" "}
                    {f.is_main ? <InventoryStatusBadge tone="info">Contrato do fornecedor</InventoryStatusBadge> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(f.size_bytes / 1024).toLocaleString("pt-PT", { maximumFractionDigits: 0 })} KB ·{" "}
                    {f.uploaded_via === "portal" ? "pelo fornecedor" : "pela empresa"} · {fmtDataHora(f.created_at)} · SHA-256{" "}
                    <Hash value={f.sha256} />
                  </p>
                </div>
                <Button type="button" size="sm" variant="ghost" onClick={() => void doDownload(f.id)} aria-label={`Abrir ${f.file_name}`}>
                  <Download className="h-4 w-4" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Histórico */}
      {c.events.length > 0 && (
        <details className="group">
          <summary className="flex cursor-pointer items-center gap-1.5 text-sm font-semibold">
            <History className="h-4 w-4" aria-hidden="true" /> Histórico ({c.events.length})
          </summary>
          <ol className="mt-2 space-y-1 border-l pl-3">
            {[...c.events].reverse().map((e) => (
              <li key={e.id} className="text-sm">
                <span className="text-xs text-muted-foreground">{fmtDataHora(e.created_at)}</span> · {e.description || e.event_type}
              </li>
            ))}
          </ol>
        </details>
      )}

      {/* Pré-visualização */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pré-visualização · {label}</DialogTitle>
            <DialogDescription>
              {previewQuery.data?.frozen
                ? `Documento congelado no envio (SHA-256 ${shortHash(previewQuery.data.sha256)}).`
                : "Rascunho com os dados atuais do fornecedor; o documento só fica fixo ao enviar."}
            </DialogDescription>
          </DialogHeader>
          {previewQuery.isLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> A preparar o documento...
            </p>
          ) : previewQuery.isError ? (
            <p className="text-sm text-destructive" role="alert">
              {describeContractError(previewQuery.error)}
            </p>
          ) : previewQuery.data?.html ? (
            <div
              className="prose prose-sm max-w-none rounded-lg border bg-white p-6 text-black dark:prose-invert dark:bg-gray-950 dark:text-white [&_table]:w-full [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:bg-muted/40 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left"
              // O HTML vem do servidor (modelo validado + valores escapados), mas é sempre sanitizado ao mostrar.
              dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(previewQuery.data.html) }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Ainda não há documento: escolha um modelo ou anexe o PDF do fornecedor.</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Enviar */}
      <AlertDialog open={sendOpen} onOpenChange={(v) => busy !== "send" && setSendOpen(v)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar o contrato {label}?</AlertDialogTitle>
            <AlertDialogDescription>
              O documento fica congelado (com SHA-256) e aparece no portal do fornecedor para o titular assinar com código SMS.
              Depois de enviado já não se altera: para mudar, cancele e faça uma nova versão.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === "send"}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void doSend();
              }}
              disabled={busy === "send"}
            >
              {busy === "send" && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
              Enviar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancelar */}
      <Dialog open={cancelOpen} onOpenChange={(v) => busy !== "cancel" && setCancelOpen(v)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{isDraft ? "Cancelar o rascunho" : `Cancelar o contrato ${label}`}</DialogTitle>
            <DialogDescription>
              {isDraft
                ? "O rascunho fica cancelado (não se apaga). Pode criar outro depois."
                : "O fornecedor deixa de o poder assinar. O motivo fica no histórico do contrato."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`sc-cancel-${c.id}`}>Motivo{isDraft ? "" : " *"}</Label>
            <Textarea
              id={`sc-cancel-${c.id}`}
              rows={3}
              maxLength={2000}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCancelOpen(false)} disabled={busy === "cancel"}>
              Voltar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void doCancel()}
              disabled={busy === "cancel" || (!isDraft && cancelReason.trim().length < 3)}
            >
              {busy === "cancel" && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
              Cancelar contrato
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {c.status === "signed_supplier" && c.can_countersign && (
        <SupplierContractCountersignDialog
          open={signOpen}
          onOpenChange={setSignOpen}
          contractId={c.id}
          contractLabel={label}
          onSigned={() => {
            void invalidate();
          }}
        />
      )}
    </div>
  );
}
