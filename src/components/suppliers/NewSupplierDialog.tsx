// "Novo fornecedor" como no Olyvia 2.0 (NovoFornecedorDialogo): criar um
// fornecedor é convidá-lo para o portal. Pede o essencial (empresa, nome, NIF,
// email e contacto) e:
//   • "Criar e enviar acesso ao portal" — cria o fornecedor (insert de sempre)
//     e envia o convite pelo mesmo caminho do separador Portal da ficha
//     (edge function create-supplier-portal-access). Se o convite falhar, o
//     fornecedor fica criado: o diálogo mostra o erro e deixa corrigir o email
//     e tentar de novo, ou abrir a ficha.
//   • "Criar sem portal (preencho eu)" — não grava nada: abre a ficha nova
//     (Dados) já com estes campos, para preencher à mão e gravar.
// Sem suppliers.portal_manage, "Criar e enviar acesso" fica desativado com o
// motivo (a edge function e a RPC voltam a verificar do lado do servidor).
import { useId, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Loader2, Send } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  createSupplierRecord,
  firstError,
  sendSupplierPortalInvite,
  supplierNifKey,
  validateNewSupplier,
  type NewSupplierErrors,
  type NewSupplierField,
  type NewSupplierInput,
} from "./newSupplier";

export interface NewSupplierDraft {
  organizationId: string;
  name: string;
  taxId: string;
  email: string;
  contactName: string;
}

interface NewSupplierDialogProps {
  onClose: () => void;
  /** Empresas que o utilizador pode escolher (as da lista). */
  organizations: { id: string; name: string }[];
  defaultOrganizationId: string | null;
  /** suppliers.portal_manage — sem ela não se convida. */
  canInvite: boolean;
  /** O fornecedor foi gravado (a lista volta a ler-se), com ou sem convite. */
  onSupplierCreated: (supplierId: string) => void;
  /** Abrir a ficha do fornecedor criado no separador Portal. */
  onOpenSupplier: (supplierId: string) => void;
  /** "Criar sem portal": abrir a ficha nova com estes campos. */
  onDraft: (draft: NewSupplierDraft) => void;
}

const NO_PORTAL_PERMISSION = "Sem permissão para convidar para o portal (requer suppliers.portal_manage).";

export function NewSupplierDialog({
  onClose,
  organizations,
  defaultOrganizationId,
  canInvite,
  onSupplierCreated,
  onOpenSupplier,
  onDraft,
}: NewSupplierDialogProps) {
  const uid = useId();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const initialOrg =
    defaultOrganizationId && organizations.some((o) => o.id === defaultOrganizationId)
      ? defaultOrganizationId
      : organizations[0]?.id ?? "";
  const [d, setD] = useState<NewSupplierInput>({ organizationId: initialOrg, name: "", taxId: "", email: "", contactName: "" });
  const [errors, setErrors] = useState<NewSupplierErrors>({});
  const [busy, setBusy] = useState<"create" | "invite" | null>(null);
  // Fornecedor já gravado cujo convite falhou.
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const set = (patch: Partial<NewSupplierInput>) => {
    setD((x) => ({ ...x, ...patch }));
    setErrors((e) => {
      const next = { ...e };
      for (const k of Object.keys(patch) as NewSupplierField[]) delete next[k];
      return next;
    });
  };

  const nifOk = !!supplierNifKey(d.taxId);
  const locked = !!created || busy !== null;

  const refreshStats = () => void queryClient.invalidateQueries({ queryKey: ["supplier-list-org-stats"] });

  const invite = async (supplier: { id: string; name: string }) => {
    setBusy("invite");
    const r = await sendSupplierPortalInvite({
      organizationId: d.organizationId,
      supplierId: supplier.id,
      email: d.email,
      contactName: d.contactName,
    });
    setBusy(null);
    refreshStats();
    // "in" e não r.ok: o tsconfig da app não tem strictNullChecks e aí a união não se estreita pelo booleano.
    if (!("response" in r)) {
      const fail = r;
      setCreated(supplier);
      setInviteError(fail.message);
      if (fail.error.error === "email_not_allowed") setErrors((e) => ({ ...e, email: fail.message }));
      return;
    }
    const email = d.email.trim().toLowerCase();
    if (r.response.smtp_warning) {
      sonnerToast.warning("Fornecedor criado, mas o email não foi enviado", {
        description: `${r.response.message || "O acesso ficou registado."}${
          r.response.smtp_error_safe ? ` Motivo: ${r.response.smtp_error_safe}.` : ""
        } Reenvie no separador Portal.`,
        duration: 12000,
      });
    } else {
      sonnerToast.success(`Acesso enviado para ${email}.`, {
        description: "À espera que o fornecedor preencha a ficha.",
        duration: 6000,
      });
    }
    onOpenSupplier(supplier.id);
  };

  const createAndInvite = async () => {
    if (!canInvite) return;
    const e = validateNewSupplier(d, true);
    setErrors(e);
    const msg = firstError(e);
    if (msg) {
      toast({ title: "Corrija os campos assinalados", description: msg, variant: "destructive" });
      return;
    }
    setBusy("create");
    let supplier: { id: string; name: string };
    try {
      supplier = await createSupplierRecord(d);
    } catch (err) {
      setBusy(null);
      toast({
        title: "Fornecedor não criado",
        description: err instanceof Error ? err.message : String((err as { message?: string })?.message ?? err),
        variant: "destructive",
      });
      return;
    }
    onSupplierCreated(supplier.id);
    await invite(supplier);
  };

  const retryInvite = async () => {
    if (!created) return;
    const e = validateNewSupplier(d, true);
    // Só o email e o contacto se podem corrigir aqui; o resto já está gravado.
    const relevant: NewSupplierErrors = { email: e.email, contactName: e.contactName };
    if (relevant.email || relevant.contactName) {
      setErrors((x) => ({ ...x, ...relevant }));
      return;
    }
    setInviteError(null);
    await invite(created);
  };

  const withoutPortal = () => {
    const e = validateNewSupplier(d, false);
    setErrors(e);
    const msg = firstError(e);
    if (msg) {
      toast({ title: "Corrija os campos assinalados", description: msg, variant: "destructive" });
      return;
    }
    onDraft({ ...d });
  };

  const fieldId = (k: NewSupplierField) => `${uid}-${k}`;
  const describedBy = (k: NewSupplierField, hint?: boolean) =>
    [hint && !errors[k] ? `${fieldId(k)}-hint` : null, errors[k] ? `${fieldId(k)}-err` : null].filter(Boolean).join(" ") ||
    undefined;
  const errorText = (k: NewSupplierField) =>
    errors[k] ? (
      <p id={`${fieldId(k)}-err`} className="text-sm text-destructive" role="alert">
        {errors[k]}
      </p>
    ) : null;

  const textField = (
    k: Exclude<NewSupplierField, "organizationId">,
    label: string,
    opts: { type?: string; hint?: React.ReactNode; disabled?: boolean; inputProps?: React.InputHTMLAttributes<HTMLInputElement> } = {},
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={fieldId(k)}>{label} *</Label>
      <Input
        id={fieldId(k)}
        type={opts.type ?? "text"}
        value={d[k]}
        onChange={(e) => set({ [k]: e.target.value } as Partial<NewSupplierInput>)}
        disabled={opts.disabled}
        aria-invalid={!!errors[k]}
        aria-describedby={describedBy(k, !!opts.hint)}
        className={errors[k] ? "border-destructive" : ""}
        autoComplete="off"
        {...opts.inputProps}
      />
      {opts.hint && !errors[k] ? (
        <p id={`${fieldId(k)}-hint`} className="text-xs text-muted-foreground">
          {opts.hint}
        </p>
      ) : null}
      {errorText(k)}
    </div>
  );

  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && busy === null) onClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo fornecedor</DialogTitle>
          <DialogDescription>
            É o fornecedor que preenche a ficha: indique o essencial e envie-lhe o acesso ao portal.
          </DialogDescription>
        </DialogHeader>

        <form
          id={`${uid}-form`}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (created) void retryInvite();
            else if (canInvite) void createAndInvite();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor={fieldId("organizationId")}>Empresa *</Label>
            <Select value={d.organizationId} onValueChange={(v) => set({ organizationId: v })} disabled={locked}>
              <SelectTrigger
                id={fieldId("organizationId")}
                aria-invalid={!!errors.organizationId}
                aria-describedby={describedBy("organizationId")}
                className={errors.organizationId ? "border-destructive" : ""}
              >
                <SelectValue placeholder="Selecione a empresa" />
              </SelectTrigger>
              <SelectContent>
                {organizations.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errorText("organizationId")}
          </div>
          {textField("name", "Nome do fornecedor", { disabled: locked, inputProps: { maxLength: 200 } })}
          {textField("taxId", "NIF", {
            disabled: locked,
            hint: nifOk ? (
              <span className="inline-flex items-center gap-1 text-success">
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                NIF válido
              </span>
            ) : (
              "Obrigatório e válido para convidar (estrangeiros com o prefixo do país, ex.: ESB12345678)."
            ),
            inputProps: { maxLength: 50, placeholder: "9 dígitos" },
          })}
          {textField("email", "Email", {
            type: "email",
            disabled: busy !== null,
            inputProps: { maxLength: 255, placeholder: "compras@fornecedor.pt" },
          })}
          <div className="sm:col-span-2">
            {textField("contactName", "Nome do contacto", {
              disabled: busy !== null,
              hint: "Recebe o convite e fica como primeiro utilizador.",
              inputProps: { maxLength: 200 },
            })}
          </div>
        </form>

        {created && inviteError && (
          <Alert variant="destructive" role="alert">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <AlertDescription>
              <b className="font-semibold">{created.name} foi criado, mas o acesso ao portal não foi enviado.</b> {inviteError}{" "}
              Corrija o email e tente de novo, ou abra a ficha e convide no separador Portal.
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter className="gap-2 sm:gap-2">
          {created ? (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenSupplier(created.id)} disabled={busy !== null}>
                Abrir ficha
              </Button>
              <Button type="submit" form={`${uid}-form`} disabled={busy !== null}>
                {busy === "invite" ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="mr-1 h-4 w-4" aria-hidden="true" />
                )}
                Tentar enviar de novo
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={onClose} disabled={busy !== null}>
                Cancelar
              </Button>
              <Button type="button" variant="outline" onClick={withoutPortal} disabled={busy !== null}>
                Criar sem portal (preencho eu)
              </Button>
              <span title={canInvite ? undefined : NO_PORTAL_PERMISSION} className={cn(!canInvite && "cursor-not-allowed")}>
                <Button
                  type="submit"
                  form={`${uid}-form`}
                  disabled={!canInvite || busy !== null}
                  aria-describedby={canInvite ? undefined : `${uid}-noperm`}
                >
                  {busy !== null ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Send className="mr-1 h-4 w-4" aria-hidden="true" />
                  )}
                  Criar e enviar acesso ao portal
                </Button>
              </span>
            </>
          )}
        </DialogFooter>
        {!canInvite && !created && (
          <p id={`${uid}-noperm`} className="text-xs text-muted-foreground">
            {NO_PORTAL_PERMISSION} Pode criar sem portal e convidar mais tarde.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
