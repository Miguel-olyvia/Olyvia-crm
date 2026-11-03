// Portal do Fornecedor — «Contrato»: as versões do contrato com a empresa
// (sp_supplier_contracts_list / sp_supplier_contract_get), condições
// estruturadas, documento (HTML congelado no envio, sanitizado; ou o PDF do
// fornecedor), anexos, estado e assinaturas. O titular assina (SMS) ou recusa
// (motivo); os membros veem só leitura. Nunca bloqueia o resto do portal.
// Propostas (migração 20270104100000): o titular propõe um contrato
// («Propor contrato»), junta o PDF/anexos e pode retirá-lo enquanto a empresa
// não responde; vê a proposta pendente, aceite (em preparação), recusada
// (com o motivo da empresa) ou retirada.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock,
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
  Send,
  ShieldCheck,
  Upload,
  XCircle,
} from "lucide-react";
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
  eventText,
  fmtData,
  fmtDataHora,
  type SupplierContractFile,
  type SupplierContractStatus,
} from "@/lib/supplierContracts/tipos";
import { downloadContractFile, uploadContractFile, validateContractFile, CONTRACT_ANNEX_MIME } from "@/lib/supplierContracts/acoes";
import {
  defaultContractId,
  describeSpContractError,
  describeSpWithdrawError,
  expiringContract,
  spContractsRpc,
  spStatusLabel,
  type SpContractSummary,
  type SpContractDetail,
  type SpContractsList,
} from "@/lib/supplierContracts/portal";
import { getSpHint } from "@/lib/supplierPortal/spRpc";
import type { InventoryTone } from "@/components/inventory/ui/tones";
import {
  useInvalidateSpContracts,
  useSpContractDetail,
  useSpContractsList,
} from "@/components/supplier-portal/contract/useSpContracts";
import { SpContractSignDialog } from "@/components/supplier-portal/contract/SpContractSignDialog";
import { SpContractRefuseDialog } from "@/components/supplier-portal/contract/SpContractRefuseDialog";
import { SpContractProposeDialog } from "@/components/supplier-portal/contract/SpContractProposeDialog";

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

type StatusInput = Pick<SpContractSummary, "status" | "proposal_state" | "refused_by">;

/** Tom no portal: uma proposta retirada é neutra (não é um erro); a pendente é informação, não um aviso. */
function spTone(c: StatusInput): InventoryTone {
  if (c.proposal_state === "withdrawn") return "neutral";
  if (c.status === "proposed") return "info";
  if (c.status === "draft") return "violet";
  return STATUS_TONE[c.status as SupplierContractStatus];
}

function StatusBadge({ contract }: { contract: StatusInput }) {
  return (
    <Badge variant="outline" className={cn("font-medium", TONE_CLASS[spTone(contract)])}>
      {spStatusLabel(contract)}
    </Badge>
  );
}

/**
 * Onde pode propor e porque não pode. Titular com pelo menos uma empresa livre → botão; com todas ocupadas → explica;
 * membro → só leitura.
 */
function ProposeArea({ list, onPropose }: { list: SpContractsList; onPropose: () => void }) {
  const targets = list.proposal_targets ?? [];
  if (targets.length === 0) return null;
  const free = targets.filter((t) => t.can_propose);
  const blocked = targets.filter((t) => t.has_open_contract);
  if (!list.is_owner) {
    return (
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        Só o responsável principal da conta pode propor um contrato.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {free.length > 0 && (
        <Button type="button" className="h-11 gap-2" onClick={onPropose}>
          <Send className="h-4 w-4" aria-hidden="true" /> Propor contrato
        </Button>
      )}
      {blocked.length > 0 && (
        <p className="flex items-start gap-2 text-sm text-muted-foreground" role="note">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {free.length === 0 ? "Não pode propor um contrato agora: " : "Não pode propor a "}
            já há um contrato em curso com {blocked.map((t) => t.organization_name || "a empresa").join(", ")}. Só pode
            haver um de cada vez: aguarde que termine ou, se for uma proposta sua, retire-a primeiro.
          </span>
        </p>
      )}
    </div>
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
  const invalidate = useInvalidateSpContracts();
  const [proposeOpen, setProposeOpen] = useState(false);
  const proposeTargets = (list.data?.proposal_targets ?? []).filter((t) => t.can_propose);

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Contrato</h1>
          <p className="text-sm text-muted-foreground">
            As condições comerciais acordadas com as empresas com que trabalha: prazos, pagamento, portes e devoluções.
          </p>
        </div>
        {list.data && (
          <div className="w-full sm:w-auto sm:max-w-md">
            <ProposeArea list={list.data} onPropose={() => setProposeOpen(true)} />
          </div>
        )}
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
              {list.data.is_owner && proposeTargets.length > 0 ? " Também pode ser o primeiro a propor as suas condições." : ""}
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
                        <StatusBadge contract={c} />
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

      {proposeOpen && (
        <SpContractProposeDialog
          open={proposeOpen}
          onOpenChange={setProposeOpen}
          targets={proposeTargets}
          onProposed={(id) => {
            void invalidate();
            select(id);
          }}
          onStale={() => void invalidate()}
        />
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
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingMain, setUploadingMain] = useState(false);
  const mainRef = useRef<HTMLInputElement>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const label = contractRef(c);
  const mainFile = c.files.find((f) => f.is_main) ?? null;
  const annexes = c.files.filter((f) => !f.is_main);
  const canSign = c.can_sign && !!c.document_sha256;
  const fromPortal = c.created_via === "portal";
  const isProposed = c.status === "proposed";
  const withdrawn = c.proposal_state === "withdrawn";
  const refusedByCompany = c.status === "refused" && c.refused_by === "empresa";

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

  const doWithdraw = async () => {
    setWithdrawing(true);
    try {
      await spContractsRpc.withdraw(c.id);
      toast({ title: "Proposta retirada", description: `${c.organization_name || "A empresa"} foi avisada.` });
      setWithdrawOpen(false);
    } catch (err) {
      toast({ title: "Não foi possível retirar a proposta", description: describeSpWithdrawError(err), variant: "destructive" });
      const hint = getSpHint(err);
      if (hint === "invalid_state" || hint === "not_found" || hint === "not_owner") setWithdrawOpen(false);
    } finally {
      setWithdrawing(false);
      void invalidate();
    }
  };

  const onPickMain = async (file: File | undefined) => {
    if (mainRef.current) mainRef.current.value = "";
    if (!file) return;
    const problem = validateContractFile(file, "contrato_fornecedor");
    if (problem) {
      toast({ title: "Ficheiro não aceite", description: problem, variant: "destructive" });
      return;
    }
    setUploadingMain(true);
    const r = await uploadContractFile(c.id, "contrato_fornecedor", file);
    setUploadingMain(false);
    if (r.error) {
      toast({ title: "Não foi possível carregar o PDF", description: r.error.message, variant: "destructive" });
      if (r.error.error === "invalid_state") stale();
      return;
    }
    toast({ title: "PDF do contrato carregado", description: `${r.data.file_name} foi enviado à empresa com a proposta.` });
    void invalidate();
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
      description: r.data.already_registered
        ? undefined
        : `${r.data.file_name} foi enviado à empresa com ${isProposed ? "a proposta" : "o contrato"}.`,
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
              <StatusBadge contract={c} />
            </p>
            <CardTitle className="text-base">{c.title}</CardTitle>
            <CardDescription>
              {c.organization_name ? `${c.organization_name} · ` : ""}
              {KIND_LABEL[c.kind]}
              {c.sent_at
                ? ` · enviado em ${fmtData(c.sent_at)}`
                : fromPortal
                  ? ` · proposto em ${fmtData(c.created_at)}${c.proposed_by_name ? ` por ${c.proposed_by_name}` : ""}`
                  : ""}
            </CardDescription>
          </div>
          {c.can_withdraw && (
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full gap-2 text-destructive hover:text-destructive sm:w-auto"
              onClick={() => setWithdrawOpen(true)}
            >
              <Ban className="h-4 w-4" aria-hidden="true" />
              Retirar proposta
            </Button>
          )}
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
        {isProposed && (
          <Alert>
            <Clock className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>À espera de resposta</AlertTitle>
            <AlertDescription>
              Enviou esta proposta a {c.organization_name || "a empresa"}. A empresa aceita-a e prepara o contrato para assinar,
              ou recusa-a com um motivo.
              {c.can_withdraw
                ? " Enquanto não responder, pode retirá-la."
                : !c.is_owner
                  ? " Só o responsável principal da conta a pode retirar ou juntar-lhe documentos."
                  : ""}
            </AlertDescription>
          </Alert>
        )}
        {c.status === "draft" && fromPortal && (
          <Alert>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            <AlertTitle>Proposta aceite — em preparação</AlertTitle>
            <AlertDescription>
              {c.organization_name || "A empresa"} aceitou a sua proposta e está a preparar o contrato. Quando o enviar,
              aparece aqui para o rever e assinar com código SMS. Abaixo estão as condições que propôs.
            </AlertDescription>
          </Alert>
        )}
        {withdrawn && (
          <Alert>
            <Info className="h-4 w-4" aria-hidden="true" />
            <AlertDescription>
              Retirou esta proposta em {fmtDataHora(c.cancelled_at)}. Pode propor outra quando quiser.
            </AlertDescription>
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
          ) : c.can_attach_main ? (
            <div className="space-y-2 rounded-lg border border-dashed p-3">
              <p className="text-sm">
                Falta o PDF do seu contrato: a empresa precisa dele para avaliar a proposta. Só pode ser carregado uma vez.
              </p>
              <input
                ref={mainRef}
                id={`sp-contract-main-${c.id}`}
                type="file"
                accept="application/pdf"
                className="sr-only"
                onChange={(e) => void onPickMain(e.target.files?.[0])}
                disabled={uploadingMain}
              />
              <Button type="button" className="h-11 gap-2" onClick={() => mainRef.current?.click()} disabled={uploadingMain}>
                {uploadingMain ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
                {uploadingMain ? "A carregar…" : "Carregar PDF do contrato"}
              </Button>
            </div>
          ) : isProposed || c.status === "draft" ? (
            <p className="text-sm text-muted-foreground">
              {c.origin === "modelo"
                ? "O texto do contrato é preparado pela empresa a partir do modelo dela, depois de aceitar a proposta."
                : "O PDF do contrato ainda não foi carregado."}
            </p>
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
                PDF, JPEG ou PNG até 15 MB (ex.: certidões, seguros, tabela de preços).{" "}
                {isProposed ? "Os anexos seguem com a proposta." : "Os anexos ficam ligados à assinatura."}
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
          <Section
            title={refusedByCompany ? "Proposta recusada pela empresa" : "Recusado por si"}
            icon={<XCircle className="h-4 w-4 text-destructive" aria-hidden="true" />}
          >
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
                  <span className="text-xs text-muted-foreground">{fmtDataHora(e.created_at)}</span> · {eventText(e)}
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
      <AlertDialog open={withdrawOpen} onOpenChange={(v) => !withdrawing && setWithdrawOpen(v)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirar a proposta {label}?</AlertDialogTitle>
            <AlertDialogDescription>
              {c.organization_name || "A empresa"} deixa de a poder aceitar. A proposta fica no histórico como retirada e pode
              propor outra depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11" disabled={withdrawing}>
              Voltar
            </AlertDialogCancel>
            <AlertDialogAction
              className="h-11 gap-2 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void doWithdraw();
              }}
              disabled={withdrawing}
            >
              {withdrawing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Retirar proposta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
