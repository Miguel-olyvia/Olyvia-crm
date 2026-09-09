/**
 * O IBAN: mascara sempre, revelacao nunca.
 *
 * Na base nao existe coluna de IBAN em claro -- existe `iban_secret_id` (Vault)
 * e a mascara (`iban_pais`, `iban_ultimos4`). E nao existe RPC de leitura em
 * claro nesta ronda, de propósito: quem processa salarios le
 * `vault.decrypted_secrets` por `service_role`, fora da aplicacao. Por isso
 * este campo NAO tem botao de mostrar -- nao ha nada que ele pudesse chamar.
 *
 * A escrita passa por `rpc_hr_definir_iban`, que valida o mod-97 e guarda o
 * segredo. Depois de gravar, o campo volta a mascara: o valor escrito nao fica
 * em estado nenhum.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Info, Loader2, Pencil } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import type { PessoaDadosBancarios } from "@/types/hr";

interface PessoaIbanFieldProps {
  bancarios: PessoaDadosBancarios | null;
  /** `hr.pessoas.bancarios.edit` na organizacao da pessoa. */
  podeEditar: boolean;
  saving: boolean;
  /** Chama `rpc_hr_definir_iban`. Devolve `null` em sucesso, ou a mensagem. */
  onDefinir: (args: {
    iban: string;
    titular?: string | null;
    banco?: string | null;
    swift?: string | null;
  }) => Promise<string | null>;
}

export function PessoaIbanField({
  bancarios,
  podeEditar,
  saving,
  onDefinir,
}: PessoaIbanFieldProps) {
  const { t } = useTranslation();
  const [aEditar, setAEditar] = useState(false);
  const [iban, setIban] = useState("");
  const [titular, setTitular] = useState("");
  const [banco, setBanco] = useState("");
  const [swift, setSwift] = useState("");

  const mascara = bancarios?.iban_ultimos4
    ? `${bancarios.iban_pais ?? "??"}•• •••• •••• •••• ${bancarios.iban_ultimos4}`
    : null;

  const abrir = () => {
    // O IBAN antigo NAO e pre-preenchido: a aplicacao nao o conhece.
    setIban("");
    setTitular(bancarios?.titular ?? "");
    setBanco(bancarios?.banco ?? "");
    setSwift(bancarios?.swift ?? "");
    setAEditar(true);
  };

  const gravar = async () => {
    const erro = await onDefinir({
      iban: iban.replace(/\s+/g, "").toUpperCase(),
      titular: titular.trim() || null,
      banco: banco.trim() || null,
      swift: swift.trim().toUpperCase() || null,
    });
    if (erro) {
      toast.error(erro);
      return;
    }
    toast.success(t("hr.sucesso.guardado"));
    setIban("");
    setAEditar(false);
  };

  if (aEditar) {
    return (
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="hr-iban">{t("hr.iban.novo")}</Label>
          <Input
            id="hr-iban"
            value={iban}
            onChange={(e) => setIban(e.target.value)}
            placeholder="PT50 0000 0000 0000 0000 0000 0"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="hr-iban-titular">{t("hr.campos.titular")}</Label>
            <Input id="hr-iban-titular" value={titular} onChange={(e) => setTitular(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hr-iban-banco">{t("hr.campos.banco")}</Label>
            <Input id="hr-iban-banco" value={banco} onChange={(e) => setBanco(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hr-iban-swift">{t("hr.campos.swift")}</Label>
            <Input id="hr-iban-swift" value={swift} onChange={(e) => setSwift(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={gravar} disabled={saving || iban.trim().length < 15}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {t("employees.form.update")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAEditar(false)} disabled={saving}>
            {t("employees.form.cancel")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
        {t("hr.campos.iban")}
      </Label>
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm tabular-nums">
          {mascara ?? (
            <span className="font-sans text-muted-foreground">{t("hr.iban.semValor")}</span>
          )}
        </span>
        {podeEditar && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
            onClick={abrir}
          >
            <Pencil className="h-3.5 w-3.5" />
            {t("employees.form.update")}
          </Button>
        )}
      </div>
      {bancarios?.titular && <p className="text-sm">{bancarios.titular}</p>}
      {bancarios?.banco && <p className="text-sm text-muted-foreground">{bancarios.banco}</p>}
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {t("hr.iban.mascarado")}
      </p>
    </div>
  );
}
