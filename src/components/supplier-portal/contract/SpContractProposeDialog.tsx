// Portal do Fornecedor — «Propor contrato» (sp_supplier_contract_propose).
// O titular escolhe a empresa (se tiver mais de uma ligação), a origem do
// texto (modelo da empresa ou o PDF dele), o tipo, o título, a validade e as
// condições comerciais. Os ficheiros (PDF principal e anexos) só se carregam
// DEPOIS de a proposta existir (Edge supplier-contract-action, upload): se um
// falhar, a proposta fica criada e volta-se a carregar no detalhe
// (can_attach_main / can_attach).
import { useId, useMemo, useRef, useState } from "react";
import { FileUp, Loader2, Paperclip, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { getSpHint } from "@/lib/supplierPortal/spRpc";
import { SupplierContractConditionsFields } from "@/components/suppliers/contract/SupplierContractConditionsFields";
import {
  KIND_LABEL,
  conditionsToForm,
  formToConditions,
  hojeLisboa,
  type ConditionsFormValues,
  type SupplierContractKind,
  type SupplierContractOrigin,
} from "@/lib/supplierContracts/tipos";
import { CONTRACT_ANNEX_MIME, CONTRACT_MAIN_MIME, uploadContractFile, validateContractFile } from "@/lib/supplierContracts/acoes";
import {
  describeSpProposeError,
  spContractsRpc,
  type SpProposalTarget,
  type SpProposeData,
} from "@/lib/supplierContracts/portal";

export const PROPOSE_MAX_ANNEXES = 10;

const targetKey = (t: Pick<SpProposalTarget, "organization_id" | "supplier_id">) => `${t.organization_id}:${t.supplier_id}`;
const defaultTitle = (t: SpProposalTarget | undefined) =>
  `Condições comerciais${t?.supplier_name ? ` — ${t.supplier_name}` : ""}`.slice(0, 200);
const fmtKb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("pt-PT")} KB`;

type FormErrors = Partial<Record<keyof ConditionsFormValues | "title" | "target" | "main_file", string>>;

export interface SpContractProposeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Só os alvos onde pode propor (can_propose). */
  targets: SpProposalTarget[];
  /** Depois de criada a proposta (mesmo que algum ficheiro tenha falhado). */
  onProposed: (contractId: string) => void;
  /** Erro que indica que a lista está desatualizada (outra proposta/contrato entretanto). */
  onStale: () => void;
}

export function SpContractProposeDialog({ open, onOpenChange, targets, onProposed, onStale }: SpContractProposeDialogProps) {
  const { toast } = useToast();
  const uid = useId();
  const [targetId, setTargetId] = useState<string>(() => (targets[0] ? targetKey(targets[0]) : ""));
  const target = targets.find((t) => targetKey(t) === targetId);
  const [origin, setOrigin] = useState<SupplierContractOrigin>("modelo");
  const [kind, setKind] = useState<SupplierContractKind>("material");
  const [title, setTitle] = useState(() => defaultTitle(targets[0]));
  const [titleTouched, setTitleTouched] = useState(false);
  const [values, setValues] = useState<ConditionsFormValues>(() => conditionsToForm(null, null, null));
  const [mainFile, setMainFile] = useState<File | null>(null);
  const [annexes, setAnnexes] = useState<File[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [step, setStep] = useState<null | "propose" | "upload">(null);
  const mainRef = useRef<HTMLInputElement>(null);
  const annexRef = useRef<HTMLInputElement>(null);
  const busy = step !== null;

  const conditionErrors = useMemo(() => {
    const out: Partial<Record<keyof ConditionsFormValues, string>> = {};
    for (const [k, v] of Object.entries(errors)) if (k in values && v) out[k as keyof ConditionsFormValues] = v;
    return out;
  }, [errors, values]);

  const reset = () => {
    setTargetId(targets[0] ? targetKey(targets[0]) : "");
    setOrigin("modelo");
    setKind("material");
    setTitle(defaultTitle(targets[0]));
    setTitleTouched(false);
    setValues(conditionsToForm(null, null, null));
    setMainFile(null);
    setAnnexes([]);
    setErrors({});
    setFormError(null);
  };

  const close = (next: boolean) => {
    if (busy) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const pickTarget = (key: string) => {
    setTargetId(key);
    if (!titleTouched) setTitle(defaultTitle(targets.find((t) => targetKey(t) === key)));
    setErrors((e) => ({ ...e, target: undefined }));
  };

  const onPickMain = (file: File | undefined) => {
    if (mainRef.current) mainRef.current.value = "";
    if (!file) return;
    const problem = validateContractFile(file, "contrato_fornecedor");
    if (problem) {
      setErrors((e) => ({ ...e, main_file: problem }));
      return;
    }
    setMainFile(file);
    setErrors((e) => ({ ...e, main_file: undefined }));
  };

  const onPickAnnexes = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (annexRef.current) annexRef.current.value = "";
    if (files.length === 0) return;
    const ok: File[] = [];
    const problems: string[] = [];
    for (const f of files) {
      const p = validateContractFile(f, "anexo");
      if (p) problems.push(`${f.name}: ${p}`);
      else ok.push(f);
    }
    setAnnexes((prev) => {
      const merged = [...prev, ...ok].slice(0, PROPOSE_MAX_ANNEXES);
      if (prev.length + ok.length > PROPOSE_MAX_ANNEXES) problems.push(`No máximo ${PROPOSE_MAX_ANNEXES} anexos.`);
      return merged;
    });
    if (problems.length) toast({ title: "Alguns ficheiros não foram aceites", description: problems.join(" "), variant: "destructive" });
  };

  /** Valida como o servidor; devolve os dados ou null (com os erros no ecrã). */
  const validate = (): SpProposeData | null => {
    const parsed = formToConditions(values);
    const errs: FormErrors = { ...parsed.errors };
    if (!target) errs.target = "Escolha a empresa.";
    if (!title.trim()) errs.title = "O título é obrigatório.";
    if (parsed.conditions.payment_terms_days === null && !errs.payment_terms_days)
      errs.payment_terms_days = "Indique o prazo de pagamento.";
    if (!parsed.conditions.payment_method) errs.payment_method = "Escolha a forma de pagamento.";
    if (parsed.valid_until && parsed.valid_until < hojeLisboa() && !errs.valid_until)
      errs.valid_until = "O fim da validade já passou.";
    if (origin === "pdf_fornecedor" && !mainFile) errs.main_file = "Escolha o PDF do seu contrato.";
    setErrors(errs);
    if (Object.values(errs).some(Boolean)) {
      // A forma de pagamento é uma lista: o campo não mostra o erro, por isso vai na mensagem geral.
      const others = Object.entries(errs).some(([k, v]) => v && k !== "payment_method");
      setFormError([errs.payment_method, others ? "Corrija os campos assinalados." : null].filter(Boolean).join(" "));
      return null;
    }
    setFormError(null);
    return {
      origin,
      kind,
      title: title.trim(),
      valid_from: parsed.valid_from,
      valid_until: parsed.valid_until,
      conditions: parsed.conditions,
    };
  };

  const submit = async () => {
    const data = validate();
    if (!data || !target) return;
    setStep("propose");
    let contractId: string;
    try {
      const created = await spContractsRpc.propose(target.organization_id, target.supplier_id, data);
      contractId = created.id;
    } catch (err) {
      setStep(null);
      const msg = describeSpProposeError(err);
      const hint = getSpHint(err);
      setFormError(msg);
      if (hint === "open_contract_exists" || hint === "not_found" || hint === "not_owner") onStale();
      return;
    }

    // A proposta já existe: os ficheiros vão a seguir, um de cada vez.
    setStep("upload");
    const failed: string[] = [];
    const uploads: { kind: "contrato_fornecedor" | "anexo"; file: File }[] = [
      ...(origin === "pdf_fornecedor" && mainFile ? [{ kind: "contrato_fornecedor" as const, file: mainFile }] : []),
      ...annexes.map((file) => ({ kind: "anexo" as const, file })),
    ];
    for (const u of uploads) {
      const r = await uploadContractFile(contractId, u.kind, u.file);
      if (r.error) failed.push(`${u.file.name} (${r.error.message})`);
    }
    setStep(null);

    if (failed.length === 0) {
      toast({
        title: "Proposta enviada",
        description: `${target.organization_name || "A empresa"} foi avisada e vai aceitá-la ou recusá-la.`,
      });
    } else {
      toast({
        title: "Proposta enviada, mas faltam ficheiros",
        description: `Não foi possível carregar: ${failed.join("; ")}. Volte a carregá-los no detalhe da proposta.`,
        variant: "destructive",
      });
    }
    reset();
    onOpenChange(false);
    onProposed(contractId);
  };

  const radioCls = (on: boolean) =>
    cn(
      "flex min-h-11 cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm transition-colors focus-within:ring-2 focus-within:ring-ring",
      on ? "border-primary bg-primary/5" : "hover:border-foreground/30",
    );

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" aria-hidden="true" /> Propor contrato
          </DialogTitle>
          <DialogDescription>
            Proponha as suas condições comerciais. A empresa aceita (e prepara o contrato para assinar) ou recusa com um
            motivo. Até lá pode retirar a proposta.
          </DialogDescription>
        </DialogHeader>

        <form
          id={`${uid}-form`}
          noValidate
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {targets.length > 1 ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Empresa *</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {targets.map((t) => {
                  const k = targetKey(t);
                  return (
                    <label key={k} className={radioCls(k === targetId)}>
                      <input
                        type="radio"
                        name={`${uid}-target`}
                        value={k}
                        checked={k === targetId}
                        onChange={() => pickTarget(k)}
                        disabled={busy}
                        className="mt-0.5 h-4 w-4 accent-primary"
                      />
                      <span className="min-w-0">
                        <span className="block font-medium">{t.organization_name || "Empresa"}</span>
                        {t.supplier_name ? <span className="block truncate text-xs text-muted-foreground">como {t.supplier_name}</span> : null}
                      </span>
                    </label>
                  );
                })}
              </div>
              {errors.target ? (
                <p className="text-xs text-destructive" role="alert">
                  {errors.target}
                </p>
              ) : null}
            </fieldset>
          ) : target ? (
            <p className="text-sm">
              Para <span className="font-medium">{target.organization_name || "a empresa"}</span>
              {target.supplier_name ? <span className="text-muted-foreground"> (como {target.supplier_name})</span> : null}
            </p>
          ) : null}

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Texto do contrato *</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className={radioCls(origin === "modelo")}>
                <input
                  type="radio"
                  name={`${uid}-origin`}
                  value="modelo"
                  checked={origin === "modelo"}
                  onChange={() => setOrigin("modelo")}
                  disabled={busy}
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <span>
                  <span className="block font-medium">Modelo da empresa</span>
                  <span className="block text-xs text-muted-foreground">A empresa usa o texto dela com as suas condições.</span>
                </span>
              </label>
              <label className={radioCls(origin === "pdf_fornecedor")}>
                <input
                  type="radio"
                  name={`${uid}-origin`}
                  value="pdf_fornecedor"
                  checked={origin === "pdf_fornecedor"}
                  onChange={() => setOrigin("pdf_fornecedor")}
                  disabled={busy}
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <span>
                  <span className="block font-medium">O meu PDF</span>
                  <span className="block text-xs text-muted-foreground">Junta o contrato da sua empresa em PDF.</span>
                </span>
              </label>
            </div>
          </fieldset>

          {origin === "pdf_fornecedor" && (
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-main`}>PDF do contrato *</Label>
              <input
                ref={mainRef}
                id={`${uid}-main`}
                type="file"
                accept={CONTRACT_MAIN_MIME.join(",")}
                className="sr-only"
                onChange={(e) => onPickMain(e.target.files?.[0])}
                disabled={busy}
                aria-invalid={!!errors.main_file}
                aria-describedby={errors.main_file ? `${uid}-main-err` : undefined}
              />
              {mainFile ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                  <span className="min-w-0 truncate">
                    {mainFile.name} <span className="text-xs text-muted-foreground">· {fmtKb(mainFile.size)}</span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-11 min-w-11"
                    onClick={() => setMainFile(null)}
                    disabled={busy}
                    aria-label={`Remover ${mainFile.name}`}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              ) : (
                <Button type="button" variant="outline" className="h-11 gap-2" onClick={() => mainRef.current?.click()} disabled={busy}>
                  <FileUp className="h-4 w-4" aria-hidden="true" /> Escolher PDF
                </Button>
              )}
              <p className="text-xs text-muted-foreground">Só PDF, até 15 MB. Depois de enviado não se troca: para mudar, retire a proposta e proponha de novo.</p>
              {errors.main_file ? (
                <p id={`${uid}-main-err`} className="text-xs text-destructive" role="alert">
                  {errors.main_file}
                </p>
              ) : null}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Tipo *</legend>
              <div className="flex flex-col gap-2">
                {(["material", "servico"] as const).map((k) => (
                  <label key={k} className={radioCls(kind === k)}>
                    <input
                      type="radio"
                      name={`${uid}-kind`}
                      value={k}
                      checked={kind === k}
                      onChange={() => setKind(k)}
                      disabled={busy}
                      className="mt-0.5 h-4 w-4 accent-primary"
                    />
                    <span>{KIND_LABEL[k]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-title`}>Título *</Label>
              <Input
                id={`${uid}-title`}
                value={title}
                maxLength={200}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setTitleTouched(true);
                  setErrors((er) => ({ ...er, title: undefined }));
                }}
                disabled={busy}
                aria-invalid={!!errors.title}
                className={cn("h-11", errors.title && "border-destructive")}
              />
              {errors.title ? (
                <p className="text-xs text-destructive" role="alert">
                  {errors.title}
                </p>
              ) : null}
            </div>
          </div>

          <section aria-label="Condições comerciais" className="space-y-2">
            <h3 className="text-sm font-semibold">Condições comerciais</h3>
            <SupplierContractConditionsFields
              idPrefix={`${uid}-cond`}
              values={values}
              setValues={setValues}
              errors={conditionErrors}
              disabled={busy}
            />
          </section>

          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-annex`}>Anexos (opcional)</Label>
            <input
              ref={annexRef}
              id={`${uid}-annex`}
              type="file"
              multiple
              accept={CONTRACT_ANNEX_MIME.join(",")}
              className="sr-only"
              onChange={(e) => onPickAnnexes(e.target.files)}
              disabled={busy}
            />
            {annexes.length > 0 && (
              <ul className="divide-y rounded-lg border">
                {annexes.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 px-3 py-1 text-sm">
                    <span className="min-w-0 truncate">
                      {f.name} <span className="text-xs text-muted-foreground">· {fmtKb(f.size)}</span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-11 min-w-11"
                      onClick={() => setAnnexes((prev) => prev.filter((_, j) => j !== i))}
                      disabled={busy}
                      aria-label={`Remover ${f.name}`}
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {annexes.length < PROPOSE_MAX_ANNEXES && (
              <Button type="button" variant="outline" className="h-11 gap-2" onClick={() => annexRef.current?.click()} disabled={busy}>
                <Paperclip className="h-4 w-4" aria-hidden="true" /> Juntar anexos
              </Button>
            )}
            <p className="text-xs text-muted-foreground">PDF, JPEG ou PNG até 15 MB cada (ex.: tabela de preços, certidões, seguros).</p>
          </div>

          {formError && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
              {formError}
            </p>
          )}
        </form>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" className="h-11" onClick={() => close(false)} disabled={busy}>
            Voltar
          </Button>
          <Button type="submit" form={`${uid}-form`} className="h-11 gap-2" disabled={busy || !target}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {step === "upload" ? "A carregar ficheiros…" : step === "propose" ? "A enviar…" : "Enviar proposta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
