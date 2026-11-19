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
  STATUS_TONE,
  contractRef,
  fmtData,
  fmtDataHora,
  type SupplierContractFile,
  type SupplierContractStatus,
} from "@/lib/supplierContracts/tipos";
import { downloadContractFile, uploadContractFile, CONTRACT_ANNEX_MIME } from "@/lib/supplierContracts/acoes";
import {
  defaultContractId,
  expiringContract,
  spContractsRpc,
  type SpContractSummary,
  type SpContractDetail,
  type SpContractsList,
} from "@/lib/supplierContracts/portal";
import { getSpHint } from "@/lib/supplierPortal/spRpc";
import {
  descreverErroContrato,
  descreverErroRetirar,
  linhasDeCondicoes,
  mensagemErroFicheiroContrato,
  rotuloEstadoContrato,
  rotuloTipoContrato,
  textoDoEvento,
  validarFicheiroContrato,
} from "@/lib/supplierPortal/textosContrato";
import { resolverMensagem, usePortalT } from "@/portal-i18n";
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
  const { t } = usePortalT();
  return (
    <Badge variant="outline" className={cn("font-medium", TONE_CLASS[spTone(contract)])}>
      {rotuloEstadoContrato(contract, t)}
    </Badge>
  );
}

/**
 * Onde pode propor e porque não pode. Titular com pelo menos uma empresa livre → botão; com todas ocupadas → explica;
 * membro → só leitura.
 */
function ProposeArea({ list, onPropose }: { list: SpContractsList; onPropose: () => void }) {
  const { t } = usePortalT();
  const targets = list.proposal_targets ?? [];
  if (targets.length === 0) return null;
  const free = targets.filter((x) => x.can_propose);
  const blocked = targets.filter((x) => x.has_open_contract);
  if (!list.is_owner) {
    return (
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        {t("sp.contrato.propor.soPrincipal")}
      </p>
    );
  }
  const empresas = blocked.map((x) => x.organization_name || t("sp.contrato.aEmpresa")).join(", ");
  return (
    <div className="space-y-2">
      {free.length > 0 && (
        <Button type="button" className="h-11 gap-2" onClick={onPropose}>
          <Send className="h-4 w-4" aria-hidden="true" /> {t("sp.contrato.propor.botao")}
        </Button>
      )}
      {blocked.length > 0 && (
        <p className="flex items-start gap-2 text-sm text-muted-foreground" role="note">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {free.length === 0
              ? t("sp.contrato.propor.bloqueioAgora", { empresas })
              : t("sp.contrato.propor.bloqueioAlgumas", { empresas })}
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
  const { t } = usePortalT();
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
  const proposeTargets = (list.data?.proposal_targets ?? []).filter((x) => x.can_propose);

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
          <h1 className="text-xl sm:text-2xl font-semibold text-foreground">{t("sp.contrato.titulo")}</h1>
          <p className="text-sm text-muted-foreground">{t("sp.contrato.descricao")}</p>
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
              ? t("sp.contrato.expira.hoje", { ref: contractRef(expiring) })
              : t(expiring.days_to_expiry === 1 ? "sp.contrato.expira.emUm" : "sp.contrato.expira.emVarios", {
                  ref: contractRef(expiring),
                  n: expiring.days_to_expiry,
                })}
          </AlertTitle>
          <AlertDescription>
            {t("sp.contrato.expira.descricao", {
              data: fmtData(expiring.valid_until),
              empresa: expiring.organization_name || t("sp.contrato.aEmpresa"),
            })}
          </AlertDescription>
        </Alert>
      )}

      {list.isLoading && (
        <div className="py-16 flex justify-center" role="status" aria-live="polite">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">{t("sp.contrato.aCarregar")}</span>
        </div>
      )}

      {list.isError && !isNoSupplierAccess(list.error) && (
        <Card>
          <CardContent className="py-8 text-center space-y-3" role="alert">
            <p className="text-sm text-destructive">
              {isSpFunctionMissing(list.error) ? t("sp.contrato.indisponivel") : descreverErroContrato(list.error, t)}
            </p>
            {!isSpFunctionMissing(list.error) && (
              <Button type="button" variant="outline" className="h-11 gap-2" onClick={() => void list.refetch()} disabled={list.isFetching}>
                <RefreshCw className={list.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
                {t("sp.contrato.tentarNovamente")}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {list.data && contracts.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center space-y-2">
            <FileSignature className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium text-foreground">{t("sp.contrato.vazio.titulo")}</p>
            <p className="text-sm text-muted-foreground">
              {t("sp.contrato.vazio.texto")}
              {list.data.is_owner && proposeTargets.length > 0 ? ` ${t("sp.contrato.vazio.proporExtra")}` : ""}
            </p>
          </CardContent>
        </Card>
      )}

      {list.data && contracts.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,16rem)_1fr]">
          <nav aria-label={t("sp.contrato.versoes.aria")} className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">{t("sp.contrato.versoes.titulo")}</h2>
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
                <span className="sr-only">{t("sp.contrato.aCarregarVersao")}</span>
              </div>
            )}
            {detail.isError && !isNoSupplierAccess(detail.error) && (
              <Card>
                <CardContent className="py-8 text-center space-y-3" role="alert">
                  <p className="text-sm text-destructive">{descreverErroContrato(detail.error, t)}</p>
                  <Button type="button" variant="outline" className="h-11 gap-2" onClick={() => void detail.refetch()} disabled={detail.isFetching}>
                    <RefreshCw className={detail.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
                    {t("sp.contrato.tentarNovamente")}
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
  const { t, idioma } = usePortalT();
  const invalidate = useInvalidateSpContracts();
  const empresa = c.organization_name || t("sp.contrato.aEmpresa");
  const empresaMaiusc = c.organization_name || t("sp.contrato.aEmpresaMaiusc");
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
      toast({
        title: t("sp.contrato.toast.naoAbriu"),
        description: resolverMensagem(mensagemErroFicheiroContrato(r.error), idioma),
        variant: "destructive",
      });
      return;
    }
    window.open(r.data.url, "_blank", "noopener,noreferrer");
  };

  const doWithdraw = async () => {
    setWithdrawing(true);
    try {
      await spContractsRpc.withdraw(c.id);
      toast({ title: t("sp.contrato.toast.retirada"), description: t("sp.contrato.toast.retiradaDescricao", { empresa: empresaMaiusc }) });
      setWithdrawOpen(false);
    } catch (err) {
      toast({ title: t("sp.contrato.toast.naoRetirou"), description: descreverErroRetirar(err, t), variant: "destructive" });
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
    const problem = validarFicheiroContrato(file, "contrato_fornecedor");
    if (problem) {
      toast({ title: t("sp.contrato.toast.ficheiroRecusado"), description: resolverMensagem(problem, idioma), variant: "destructive" });
      return;
    }
    setUploadingMain(true);
    const r = await uploadContractFile(c.id, "contrato_fornecedor", file);
    setUploadingMain(false);
    if (r.error) {
      toast({
        title: t("sp.contrato.toast.naoCarregouPdf"),
        description: resolverMensagem(mensagemErroFicheiroContrato(r.error), idioma),
        variant: "destructive",
      });
      if (r.error.error === "invalid_state") stale();
      return;
    }
    toast({
      title: t("sp.contrato.toast.pdfCarregado"),
      description: t("sp.contrato.toast.pdfCarregadoDescricao", { nome: r.data.file_name }),
    });
    void invalidate();
  };

  const onPickFile = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    const problem = validarFicheiroContrato(file, "anexo");
    if (problem) {
      toast({ title: t("sp.contrato.toast.ficheiroRecusado"), description: resolverMensagem(problem, idioma), variant: "destructive" });
      return;
    }
    setUploading(true);
    const r = await uploadContractFile(c.id, "anexo", file);
    setUploading(false);
    if (r.error) {
      toast({
        title: t("sp.contrato.toast.naoAnexou"),
        description: resolverMensagem(mensagemErroFicheiroContrato(r.error), idioma),
        variant: "destructive",
      });
      if (r.error.error === "invalid_state") stale();
      return;
    }
    toast({
      title: r.data.already_registered ? t("sp.contrato.toast.jaAnexado") : t("sp.contrato.toast.anexado"),
      description: r.data.already_registered
        ? undefined
        : t(isProposed ? "sp.contrato.toast.anexadoProposta" : "sp.contrato.toast.anexadoContrato", { nome: r.data.file_name }),
    });
    void invalidate();
  };

  const conditionRows = [
    ...linhasDeCondicoes(c.conditions, t),
    {
      label: t("sp.contrato.cond.validade"),
      value: `${c.valid_from ? t("sp.contrato.cond.validadeDe", { data: fmtData(c.valid_from) }) : t("sp.contrato.cond.desdeAssinatura")} ${
        c.valid_until ? t("sp.contrato.cond.validadeAte", { data: fmtData(c.valid_until) }) : t("sp.contrato.cond.semTermo")
      }`,
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
              {rotuloTipoContrato(c.kind, t)}
              {c.sent_at
                ? ` · ${t("sp.contrato.cartao.enviadoEm", { data: fmtData(c.sent_at) })}`
                : fromPortal
                  ? ` · ${t("sp.contrato.cartao.propostoEm", { data: fmtData(c.created_at) })}${
                      c.proposed_by_name ? ` ${t("sp.contrato.cartao.porNome", { nome: c.proposed_by_name })}` : ""
                    }`
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
              {t("sp.contrato.cartao.retirar")}
            </Button>
          )}
          {canSign && (
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Button type="button" className="h-11 gap-2" onClick={() => setSignOpen(true)}>
                <PenTool className="h-4 w-4" aria-hidden="true" />
                {t("sp.contrato.cartao.assinar")}
              </Button>
              {c.can_refuse && (
                <Button type="button" variant="outline" className="h-11 gap-2 text-destructive hover:text-destructive" onClick={() => setRefuseOpen(true)}>
                  <XCircle className="h-4 w-4" aria-hidden="true" />
                  {t("sp.contrato.cartao.recusar")}
                </Button>
              )}
            </div>
          )}
        </div>

        {c.status === "sent" && !c.is_owner && (
          <Alert>
            <Lock className="h-4 w-4" aria-hidden="true" />
            <AlertDescription>{t("sp.contrato.aviso.soConsulta")}</AlertDescription>
          </Alert>
        )}
        {c.status === "sent" && c.is_owner && !c.can_sign && (
          <Alert>
            <Info className="h-4 w-4" aria-hidden="true" />
            <AlertDescription>{t("sp.contrato.aviso.outraConta")}</AlertDescription>
          </Alert>
        )}
        {isProposed && (
          <Alert>
            <Clock className="h-4 w-4" aria-hidden="true" />
            <AlertTitle>{t("sp.contrato.aviso.esperaTitulo")}</AlertTitle>
            <AlertDescription>
              {t("sp.contrato.aviso.espera", { empresa })}
              {c.can_withdraw
                ? ` ${t("sp.contrato.aviso.esperaRetirar")}`
                : !c.is_owner
                  ? ` ${t("sp.contrato.aviso.esperaSoResponsavel")}`
                  : ""}
            </AlertDescription>
          </Alert>
        )}
        {c.status === "draft" && fromPortal && (
          <Alert>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            <AlertTitle>{t("sp.contrato.aviso.aceiteTitulo")}</AlertTitle>
            <AlertDescription>{t("sp.contrato.aviso.aceite", { empresa: empresaMaiusc })}</AlertDescription>
          </Alert>
        )}
        {withdrawn && (
          <Alert>
            <Info className="h-4 w-4" aria-hidden="true" />
            <AlertDescription>{t("sp.contrato.aviso.retirada", { data: fmtDataHora(c.cancelled_at) })}</AlertDescription>
          </Alert>
        )}
        {c.status === "signed_supplier" && (
          <Alert>
            <Info className="h-4 w-4" aria-hidden="true" />
            <AlertDescription>{t("sp.contrato.aviso.assinadoPorSi")}</AlertDescription>
          </Alert>
        )}
      </CardHeader>

      <CardContent className="space-y-6">
        <Section title={t("sp.contrato.condicoes")} icon={<FileText className="h-4 w-4 text-primary" aria-hidden="true" />}>
          <dl className="divide-y rounded-lg border px-3">
            {conditionRows.map((r) => (
              <Row key={r.label} label={r.label}>
                <span className="whitespace-pre-wrap">{r.value}</span>
              </Row>
            ))}
          </dl>
        </Section>

        <Section title={t("sp.contrato.documento.titulo")} icon={<FileSignature className="h-4 w-4 text-primary" aria-hidden="true" />}>
          {c.document_html ? (
            <div
              className="prose prose-sm max-h-[60vh] max-w-none overflow-y-auto rounded-lg border bg-white p-4 text-black sm:p-6 dark:prose-invert dark:bg-gray-950 dark:text-white [&_table]:w-full [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:bg-muted/40 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left"
              tabIndex={0}
              aria-label={t("sp.contrato.documento.aria", { ref: label })}
              // HTML congelado no envio pelo servidor (modelo validado + valores escapados); sanitizado sempre ao mostrar.
              dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(c.document_html) }}
            />
          ) : mainFile ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{mainFile.file_name}</p>
                <p className="text-xs text-muted-foreground">{t("sp.contrato.documento.pdf", { tamanho: fmtKb(mainFile.size_bytes) })}</p>
              </div>
              <Button type="button" variant="outline" className="h-11 gap-2" onClick={() => void openFile(mainFile)} disabled={opening === mainFile.id}>
                {opening === mainFile.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
                {t("sp.contrato.documento.abrirPdf")}
              </Button>
            </div>
          ) : c.can_attach_main ? (
            <div className="space-y-2 rounded-lg border border-dashed p-3">
              <p className="text-sm">{t("sp.contrato.documento.faltaPdf")}</p>
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
                {uploadingMain ? t("sp.contrato.documento.aCarregar") : t("sp.contrato.documento.carregarPdf")}
              </Button>
            </div>
          ) : isProposed || c.status === "draft" ? (
            <p className="text-sm text-muted-foreground">
              {c.origin === "modelo" ? t("sp.contrato.documento.textoDoModelo") : t("sp.contrato.documento.pdfPorCarregar")}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">{t("sp.contrato.documento.indisponivel")}</p>
          )}
          {c.document_sha256 && (
            <p className="text-xs text-muted-foreground">
              {t("sp.contrato.documento.impressao")}{" "}
              <code className="font-mono" title={c.document_sha256}>
                {shortHash(c.document_sha256)}
              </code>
            </p>
          )}
        </Section>

        <Section title={t("sp.contrato.anexos.titulo")} icon={<Paperclip className="h-4 w-4 text-primary" aria-hidden="true" />}>
          {annexes.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("sp.contrato.anexos.nenhum")}</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {annexes.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{f.file_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtKb(f.size_bytes)} · {f.uploaded_via === "portal" ? t("sp.contrato.anexos.porSi") : t("sp.contrato.anexos.daEmpresa")} · {fmtDataHora(f.created_at)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-11 min-w-11"
                    onClick={() => void openFile(f)}
                    disabled={opening === f.id}
                    aria-label={t("sp.contrato.anexos.descarregar", { nome: f.file_name })}
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
                {uploading ? t("sp.contrato.anexos.aAnexar") : t("sp.contrato.anexos.anexar")}
              </Button>
              <p className="text-xs text-muted-foreground">
                {t("sp.contrato.anexos.formatos")}{" "}
                {isProposed ? t("sp.contrato.anexos.seguemProposta") : t("sp.contrato.anexos.ficamAssinatura")}
              </p>
            </div>
          )}
        </Section>

        {(c.supplier_signed_at || c.company_signed_at) && (
          <Section title={t("sp.contrato.assinaturas.titulo")} icon={<ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />}>
            <dl className="divide-y rounded-lg border px-3">
              {c.supplier_signed_at && (
                <Row label={t("sp.contrato.assinaturas.fornecedor")}>
                  {c.supplier_signed_by_name || "—"} · {fmtDataHora(c.supplier_signed_at)}
                  {c.supplier_signed_phone_masked ? ` · ${c.supplier_signed_phone_masked}` : ""}
                </Row>
              )}
              {c.company_signed_at && (
                <Row label={t("sp.contrato.assinaturas.empresa")}>
                  {c.company_signed_by_name || "—"} · {fmtDataHora(c.company_signed_at)}
                </Row>
              )}
              {c.supplier_signature_sha256 && (
                <Row label={t("sp.contrato.assinaturas.selo")}>
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
            title={refusedByCompany ? t("sp.contrato.recusa.pelaEmpresa") : t("sp.contrato.recusa.porSi")}
            icon={<XCircle className="h-4 w-4 text-destructive" aria-hidden="true" />}
          >
            <dl className="divide-y rounded-lg border px-3">
              <Row label={t("sp.contrato.recusa.quando")}>{fmtDataHora(c.refused_at)}</Row>
              <Row label={t("sp.contrato.recusa.motivo")}>
                <span className="whitespace-pre-wrap">{c.refusal_reason || "—"}</span>
              </Row>
            </dl>
          </Section>
        )}

        {c.events.length > 0 && (
          <details className="group">
            <summary className="flex min-h-11 cursor-pointer items-center gap-1.5 text-sm font-semibold">
              <History className="h-4 w-4" aria-hidden="true" /> {t("sp.contrato.historico", { n: c.events.length })}
            </summary>
            <ol className="mt-2 space-y-1 border-l pl-3">
              {[...c.events].reverse().map((e) => (
                <li key={e.id} className="text-sm">
                  <span className="text-xs text-muted-foreground">{fmtDataHora(e.created_at)}</span> · {textoDoEvento(e, t)}
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
            <AlertDialogTitle>{t("sp.contrato.retirar.titulo", { ref: label })}</AlertDialogTitle>
            <AlertDialogDescription>{t("sp.contrato.retirar.descricao", { empresa: empresaMaiusc })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11" disabled={withdrawing}>
              {t("sp.contrato.retirar.voltar")}
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
              {t("sp.contrato.retirar.botao")}
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
