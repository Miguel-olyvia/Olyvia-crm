// Portal do Fornecedor — «Contrato»: as versões do contrato com a empresa
// (sp_supplier_contracts_list / sp_supplier_contract_get), condições
// estruturadas, documento (HTML congelado no envio, sanitizado; ou o PDF do
// fornecedor), anexos, estado e assinaturas. O titular assina (SMS) ou recusa
// (motivo); os membros veem só leitura. Nunca bloqueia o resto do portal.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  Download,
  FileSignature,
  FileText,
  History,
  Info,
  Loader2,
  Lock,
  Paperclip,
  PenTool,
  RefreshCw,
  ShieldCheck,
  Upload,
  XCircle,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { sanitizeRichHtml } from "@/utils/sanitize";
import { useSupplierPortal } from "@/contexts/SupplierPortalContext";
import { isNoSupplierAccess, isSpFunctionMissing } from "@/lib/supplierPortal/spRpc";
import {
  KIND_LABEL,
  STATUS_TONE,
  conditionsRows,
  contractRef,
  fmtData,
  fmtDataHora,
  type SupplierContractFile,
} from "@/lib/supplierContracts/tipos";
import { downloadContractFile, uploadContractFile, validateContractFile, CONTRACT_ANNEX_MIME } from "@/lib/supplierContracts/acoes";
import {
  SP_STATUS_LABEL,
  defaultContractId,
  describeSpContractError,
  expiringContract,
  type SpContractDetail,
} from "@/lib/supplierContracts/portal";
import type { InventoryTone } from "@/components/inventory/ui/tones";
import {
  useInvalidateSpContracts,
  useSpContractDetail,
  useSpContractsList,
} from "@/components/supplier-portal/contract/useSpContracts";
import { SpContractSignDialog } from "@/components/supplier-portal/contract/SpContractSignDialog";
import { SpContractRefuseDialog } from "@/components/supplier-portal/contract/SpContractRefuseDialog";

const TONE_CLASS: Record<InventoryTone, string> = {
  ok: "bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-200 dark:border-emerald-500/30",
  warn: "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-500/30",
  bad: "bg-red-100 text-red-900 border-red-200 dark:bg-red-500/15 dark:text-red-200 dark:border-red-500/30",
  info: "bg-sky-100 text-sky-900 border-sky-200 dark:bg-sky-500/15 dark:text-sky-200 dark:border-sky-500/30",
  violet: "bg-violet-100 text-violet-900 border-violet-200 dark:bg-violet-500/15 dark:text-violet-200 dark:border-violet-500/30",
  neutral: "bg-slate-100 text-slate-800 border-slate-200 dark:bg-slate-500/15 dark:text-slate-200 dark:border-slate-500/30",
};

const shortHash = (h: string | null | undefined) => (h ? `${h.slice(0, 12)}…${h.slice(-6)}` : "—");
const fmtKb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("pt-PT")} KB`;

function StatusBadge({ status }: { status: SpContractDetail["status"] }) {
  return (
    <Badge variant="outline" className={cn("font-medium", TONE_CLASS[STATUS_TONE[status]])}>
      {SP_STATUS_LABEL[status]}
    </Badge>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-0.5 py-2 text-sm sm:grid-cols-[minmax(0,13rem)_1fr] sm:gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">{children}</dd>
    </div>
  );
}

function Section({ title, icon, children, className }: { title: string; icon: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={cn("space-y-2", className)}>
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

export default function SupplierPortalContract() {
  const { refresh } = useSupplierPortal();
  const [params, setParams] = useSearchParams();
  const list = useSpContractsList();
  const requestedId = params.get("id");
  const contracts = list.data?.contracts ?? [];
  const selectedId =
    requestedId && contracts.some((c) => c.id === requestedId) ? requestedId : defaultContractId(list.data);
  const detail = useSpContractDetail(selectedId);
  const expiring = expiringContract(list.data);

  useEffect(() => {
    if ((list.isError && isNoSupplierAccess(list.error)) || (detail.isError && isNoSupplierAccess(detail.error))) void refresh();
  }, [list.isError, list.error, detail.isError, detail.error, refresh]);

  const select = (id: string) => {
    const p = new URLSearchParams(params);
    p.set("id", id);
    p.delete("assinar");
    setParams(p, { replace: true });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Contrato</h1>
        <p className="text-sm text-muted-foreground">
          As condições comerciais acordadas com as empresas com que trabalha: prazos, pagamento, portes e devoluções.
        </p>
      </div>

      {expiring && expiring.days_to_expiry !== null && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>
            {expiring.days_to_expiry === 0
              ? `O contrato ${contractRef(expiring)} expira hoje`
              : `O contrato ${contractRef(expiring)} expira em ${expiring.days_to_expiry} ${expiring.days_to_expiry === 1 ? "dia" : "dias"}`}
          </AlertTitle>
          <AlertDescription>
            Válido até {fmtData(expiring.valid_until)}. Fale com {expiring.organization_name || "a empresa"} para preparar a
            renovação: a nova versão aparece aqui para assinar.
          </AlertDescription>
        </Alert>
      )}

      {list.isLoading && (
        <div className="py-16 flex justify-center" role="status" aria-live="polite">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">A carregar o contrato…</span>
        </div>
      )}

      {list.isError && !isNoSupplierAccess(list.error) && (
        <Card>
          <CardContent className="py-8 text-center space-y-3" role="alert">
            <p className="text-sm text-destructive">
              {isSpFunctionMissing(list.error)
                ? "Esta funcionalidade ainda não está disponível. Tente mais tarde."
                : describeSpContractError(list.error)}
            </p>
            {!isSpFunctionMissing(list.error) && (
              <Button type="button" variant="outline" className="h-11 gap-2" onClick={() => void list.refetch()} disabled={list.isFetching}>
                <RefreshCw className={list.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
                Tentar de novo
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {list.data && contracts.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center space-y-2">
            <FileSignature className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">Ainda não tem nenhum contrato</p>
            <p className="text-sm text-muted-foreground">
              Quando uma empresa lhe enviar um contrato, aparece aqui para o rever e assinar.
            </p>
          </CardContent>
        </Card>
      )}

      {list.data && contracts.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,16rem)_1fr]">
          <nav aria-label="Versões do contrato" className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">Versões</h2>
            <ul className="space-y-2">
              {contracts.map((c) => {
                const active = c.id === selectedId;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => select(c.id)}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "w-full min-h-11 rounded-lg border bg-background p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active ? "border-primary ring-1 ring-primary" : "hover:border-foreground/30",
                      )}
                    >
                      <span className="block font-mono text-sm font-semibold">{contractRef(c)}</span>
                      <span className="block truncate text-xs text-muted-foreground">{c.organization_name}</span>
                      <span className="mt-1.5 block">
                        <StatusBadge status={c.status} />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="min-w-0">
            {detail.isLoading && (
              <div className="py-16 flex justify-center" role="status" aria-live="polite">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
                <span className="sr-only">A carregar a versão…</span>
              </div>
            )}
            {detail.isError && !isNoSupplierAccess(detail.error) && (
              <Card>
                <CardContent className="py-8 text-center space-y-3" role="alert">
                  <p className="text-sm text-destructive">{describeSpContractError(detail.error)}</p>
                  <Button type="button" variant="outline" className="h-11 gap-2" onClick={() => void detail.refetch()} disabled={detail.isFetching}>
                    <RefreshCw className={detail.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
                    Tentar de novo
                  </Button>
                </CardContent>
              </Card>
            )}
            {detail.data && (
              <ContractView
                key={detail.data.id}
                contract={detail.data}
                autoSign={params.get("assinar") === "1"}
                onAutoSignHandled={() => {
                  const p = new URLSearchParams(params);
                  p.delete("assinar");
                  setParams(p, { replace: true });
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ContractView({
  contract: c,
  autoSign,
  onAutoSignHandled,
}: {
  contract: SpContractDetail;
  autoSign: boolean;
  onAutoSignHandled: () => void;
}) {
  const { toast } = useToast();
  const invalidate = useInvalidateSpContracts();
  const [signOpen, setSignOpen] = useState(false);
  const [refuseOpen, setRefuseOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const label = contractRef(c);
  const mainFile = c.files.find((f) => f.is_main) ?? null;
  const annexes = c.files.filter((f) => !f.is_main);
  const canSign = c.can_sign && !!c.document_sha256;

  // «Assinar agora» no modal de entrada → abre a assinatura uma vez.
  useEffect(() => {
    if (!autoSign) return;
    if (canSign) setSignOpen(true);
    onAutoSignHandled();
  }, [autoSign, canSign, onAutoSignHandled]);

  const stale = () => {
    void invalidate();
  };

  const openFile = async (f: SupplierContractFile) => {
    setOpening(f.id);
    const r = await downloadContractFile(f.id);
    setOpening(null);
    if (r.error) {
      toast({ title: "Não foi possível abrir o ficheiro", description: r.error.message, variant: "destructive" });
      return;
    }
    window.open(r.data.url, "_blank", "noopener,noreferrer");
  };

  const onPickFile = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    const problem = validateContractFile(file, "anexo");
    if (problem) {
      toast({ title: "Ficheiro não aceite", description: problem, variant: "destructive" });
      return;
    }
    setUploading(true);
    const r = await uploadContractFile(c.id, "anexo", file);
    setUploading(false);
    if (r.error) {
      toast({ title: "Não foi possível anexar", description: r.error.message, variant: "destructive" });
      if (r.error.error === "invalid_state") stale();
      return;
    }
    toast({
      title: r.data.already_registered ? "Este ficheiro já estava anexado" : "Documento anexado",
      description: r.data.already_registered ? undefined : `${r.data.file_name} foi enviado à empresa com o contrato.`,
    });
    void invalidate();
  };

  const conditionRows = [
    ...conditionsRows(c.conditions),
    {
      label: "Validade",
      value: `${c.valid_from ? `De ${fmtData(c.valid_from)}` : "Desde a assinatura"} ${c.valid_until ? `até ${fmtData(c.valid_until)}` : "· sem termo"}`,
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-semibold">{label}</span>
              <StatusBadge status={c.status} />
            </p>
            <CardTitle className="text-base">{c.title}</CardTitle>
            <CardDescription>
              {c.organization_name ? `${c.organization_name} · ` : ""}
              {KIND_LABEL[c.kind]}
              {c.sent_at ? ` · enviado em ${fmtData(c.sent_at)}` : ""}
            </CardDescription>
          </div>
          {canSign && (
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Button type="button" className="h-11 gap-2" onClick={() => setSignOpen(true)}>
                <PenTool className="h-4 w-4" aria-hidden="true" />
                Assinar
              </Button>
              {c.can_refuse && (
                <Button type="button" variant="outline" className="h-11 gap-2 text-destructive hover:text-destructive" onClick={() => setRefuseOpen(true)}>
                  <XCircle className="h-4 w-4" aria-hidden="true" />
                  Recusar
                </Button>
              )}
            </div>
          )}
        </div>

        {c.status === "sent" && !c.is_owner && (
          <Alert>
            <Lock className="h-4 w-4" aria-hidden="true" />
            <AlertDescription>
              Pode consultar este contrato. Só o responsável principal da conta o pode assinar, recusar ou anexar
              documentos.
            </AlertDescription>
          </Alert>
        )}
        {c.status === "sent" && c.is_owner && !c.can_sign && (
          <Alert>
            <Info className="h-4 w-4" aria-hidden="true" />
            <AlertDescription>Este contrato foi enviado a outra conta do seu fornecedor: só essa conta o pode assinar.</AlertDescription>
          </Alert>
        )}
        {c.status === "signed_supplier" && (
          <Alert>
            <Info className="h-4 w-4" aria-hidden="true" />
            <AlertDescription>
              Assinado por si. Falta a contra-assinatura da empresa: as condições entram em vigor logo que o faça.
            </AlertDescription>
          </Alert>
        )}
      </CardHeader>

      <CardContent className="space-y-6">
        <Section title="Condições comerciais" icon={<FileText className="h-4 w-4 text-primary" aria-hidden="true" />}>
          <dl className="divide-y rounded-lg border px-3">
            {conditionRows.map((r) => (
              <Row key={r.label} label={r.label}>
                <span className="whitespace-pre-wrap">{r.value}</span>
              </Row>
            ))}
          </dl>
        </Section>

        <Section title="Documento" icon={<FileSignature className="h-4 w-4 text-primary" aria-hidden="true" />}>
          {c.document_html ? (
            <div
              className="prose prose-sm max-h-[60vh] max-w-none overflow-y-auto rounded-lg border bg-white p-4 text-black sm:p-6 dark:prose-invert dark:bg-gray-950 dark:text-white [&_table]:w-full [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:bg-muted/40 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left"
              tabIndex={0}
              aria-label={`Texto do contrato ${label}`}
              // HTML congelado no envio pelo servidor (modelo validado + valores escapados); sanitizado sempre ao mostrar.
              dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(c.document_html) }}
            />
          ) : mainFile ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{mainFile.file_name}</p>
                <p className="text-xs text-muted-foreground">Contrato em PDF · {fmtKb(mainFile.size_bytes)}</p>
              </div>
              <Button type="button" variant="outline" className="h-11 gap-2" onClick={() => void openFile(mainFile)} disabled={opening === mainFile.id}>
                {opening === mainFile.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
                Abrir PDF
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">O documento não está disponível.</p>
          )}
          {c.document_sha256 && (
            <p className="text-xs text-muted-foreground">
              Impressão digital do documento (SHA-256):{" "}
              <code className="font-mono" title={c.document_sha256}>
                {shortHash(c.document_sha256)}
              </code>
            </p>
          )}
        </Section>

        <Section title="Anexos" icon={<Paperclip className="h-4 w-4 text-primary" aria-hidden="true" />}>
          {annexes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem anexos.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {annexes.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{f.file_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtKb(f.size_bytes)} · {f.uploaded_via === "portal" ? "anexado por si" : "da empresa"} · {fmtDataHora(f.created_at)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-11 min-w-11"
                    onClick={() => void openFile(f)}
                    disabled={opening === f.id}
                    aria-label={`Descarregar ${f.file_name}`}
                  >
                    {opening === f.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {c.can_attach && (
            <div className="space-y-1">
              <input
                ref={fileRef}
                id={`sp-contract-annex-${c.id}`}
                type="file"
                accept={CONTRACT_ANNEX_MIME.join(",")}
                className="sr-only"
                onChange={(e) => void onPickFile(e.target.files?.[0])}
                disabled={uploading}
              />
              <Button type="button" variant="outline" className="h-11 gap-2" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
                {uploading ? "A anexar…" : "Anexar documento"}
              </Button>
              <p className="text-xs text-muted-foreground">
                PDF, JPEG ou PNG até 15 MB (ex.: certidões, seguros, tabela de preços). Os anexos ficam ligados à assinatura.
              </p>
            </div>
          )}
        </Section>

        {(c.supplier_signed_at || c.company_signed_at) && (
          <Section title="Assinaturas" icon={<ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />}>
            <dl className="divide-y rounded-lg border px-3">
              {c.supplier_signed_at && (
                <Row label="Fornecedor (código SMS)">
                  {c.supplier_signed_by_name || "—"} · {fmtDataHora(c.supplier_signed_at)}
                  {c.supplier_signed_phone_masked ? ` · ${c.supplier_signed_phone_masked}` : ""}
                </Row>
              )}
              {c.company_signed_at && (
                <Row label="Empresa">
                  {c.company_signed_by_name || "—"} · {fmtDataHora(c.company_signed_at)}
                </Row>
              )}
              {c.supplier_signature_sha256 && (
                <Row label="Selo da assinatura">
                  <code className="font-mono text-xs" title={c.supplier_signature_sha256}>
                    {shortHash(c.supplier_signature_sha256)}
                  </code>
                </Row>
              )}
            </dl>
          </Section>
        )}

        {c.status === "refused" && (
          <Section title="Recusado por si" icon={<XCircle className="h-4 w-4 text-destructive" aria-hidden="true" />}>
            <dl className="divide-y rounded-lg border px-3">
              <Row label="Quando">{fmtDataHora(c.refused_at)}</Row>
              <Row label="Motivo">
                <span className="whitespace-pre-wrap">{c.refusal_reason || "—"}</span>
              </Row>
            </dl>
          </Section>
        )}

        {c.events.length > 0 && (
          <details className="group">
            <summary className="flex min-h-11 cursor-pointer items-center gap-1.5 text-sm font-semibold">
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
      </CardContent>

      {/* Fica montado enquanto aberto: depois de assinar o detalhe recarrega (can_sign=false) e o passo final continua visível. */}
      {(canSign || signOpen) && c.document_sha256 && (
        <SpContractSignDialog
          open={signOpen}
          onOpenChange={setSignOpen}
          contract={{ id: c.id, label, document_sha256: c.document_sha256, phone_set: c.phone_set, phone_masked: c.phone_masked }}
          onSigned={() => void invalidate()}
          onStale={stale}
          onPhoneSaved={() => void invalidate()}
        />
      )}
      {(c.can_refuse || refuseOpen) && (
        <SpContractRefuseDialog
          open={refuseOpen}
          onOpenChange={setRefuseOpen}
          contractId={c.id}
          contractLabel={label}
          onRefused={() => void invalidate()}
          onStale={stale}
        />
      )}
    </Card>
  );
}
