/**
 * A conta bancaria: mascara sempre, revelacao nunca.
 *
 * Na base nao existe coluna com o numero em claro -- existe `conta_secret_id`
 * (Vault) e a mascara (`formato_conta`, `conta_pais`, `conta_ultimos4`). E nao
 * existe RPC de leitura em claro, de propósito: quem processa salarios le
 * `vault.decrypted_secrets` por `service_role`, fora da aplicacao. Por isso
 * este campo NAO tem botao de mostrar -- nao ha nada que ele pudesse chamar.
 *
 * SEIS FORMATOS, UM SO CAMINHO DE DADOS
 * -------------------------------------
 * IBAN, conta + codigo de ordenacao, conta + codigo de roteamento, CLABE,
 * banco + numero, ou outro. O formato NAO abre uma segunda coluna em claro ao
 * lado do IBAN cifrado -- uma CLABE e tao sensivel quanto um IBAN. Muda apenas
 * o que se valida: `iban` passa pelo mod-97, os outros pelo padrao
 * alfanumerico de 4 a 34 caracteres. Chamava-se `PessoaIbanField` enquanto so
 * havia um formato.
 *
 * A escrita passa por `rpc_hr_definir_conta`. Depois de gravar, o campo volta
 * a mascara: o valor escrito nao fica em estado nenhum.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Info, Loader2, Pencil } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import {
  chaveDoRotuloDaConta,
  contaValida,
  mascaraDaConta,
  minimoDaConta,
  normalizarConta,
} from "@/lib/hr/conta";
import { FORMATOS_CONTA, type FormatoConta, type PessoaDadosBancarios } from "@/types/hr";

interface PessoaContaBancariaFieldProps {
  bancarios: PessoaDadosBancarios | null;
  /** `hr.pessoas.bancarios.edit` na organizacao da pessoa. */
  podeEditar: boolean;
  saving: boolean;
  /** Chama `rpc_hr_definir_conta`. Devolve `null` em sucesso, ou a mensagem. */
  onDefinir: (args: {
    formato: FormatoConta;
    conta: string;
    titular?: string | null;
    banco?: string | null;
    agencia?: string | null;
    swift?: string | null;
  }) => Promise<string | null>;
}

export function PessoaContaBancariaField({
  bancarios,
  podeEditar,
  saving,
  onDefinir,
}: PessoaContaBancariaFieldProps) {
  const { t } = useTranslation();
  const [aEditar, setAEditar] = useState(false);
  const [formato, setFormato] = useState<FormatoConta>("iban");
  const [conta, setConta] = useState("");
  const [tocado, setTocado] = useState(false);
  const [titular, setTitular] = useState("");
  const [banco, setBanco] = useState("");
  const [agencia, setAgencia] = useState("");
  const [swift, setSwift] = useState("");

  const formatoGravado = bancarios?.formato_conta ?? "iban";
  const mascara = mascaraDaConta(
    formatoGravado,
    bancarios?.conta_ultimos4 ?? null,
    bancarios?.conta_pais ?? null,
  );

  const contaNormalizada = normalizarConta(conta);
  const contaMalformada = contaNormalizada !== "" && !contaValida(formato, contaNormalizada);
  const erro = tocado && contaMalformada
    ? t(formato === "iban" ? "hr.form.erroIban" : "hr.form.erroConta")
    : null;

  const abrir = () => {
    // O numero antigo NAO e pre-preenchido: a aplicacao nao o conhece.
    setConta("");
    setTocado(false);
    setFormato(formatoGravado);
    setTitular(bancarios?.titular ?? "");
    setBanco(bancarios?.banco ?? "");
    setAgencia(bancarios?.agencia ?? "");
    setSwift(bancarios?.swift ?? "");
    setAEditar(true);
  };

  const gravar = async () => {
    const mensagem = await onDefinir({
      formato,
      conta: contaNormalizada,
      titular: titular.trim() || null,
      banco: banco.trim() || null,
      agencia: agencia.trim() || null,
      swift: swift.trim().toUpperCase() || null,
    });
    if (mensagem) {
      toast.error(mensagem);
      return;
    }
    toast.success(t("hr.sucesso.guardado"));
    setConta("");
    setAEditar(false);
  };

  if (aEditar) {
    return (
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="hr-conta-formato">{t("hr.campos.formatoConta")}</Label>
            <Select
              value={formato}
              onValueChange={(v) => setFormato(v as FormatoConta)}
            >
              {/* O `id` vai no GATILHO: e ele o controlo que a etiqueta identifica. */}
              <SelectTrigger id="hr-conta-formato">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FORMATOS_CONTA.map((opcao) => (
                  <SelectItem key={opcao} value={opcao}>
                    {t(`hr.formatoConta.${opcao}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            {/* O rotulo acompanha o formato escolhido. */}
            <Label htmlFor="hr-conta-numero">{t(chaveDoRotuloDaConta(formato))}</Label>
            <Input
              id="hr-conta-numero"
              value={conta}
              onChange={(e) => setConta(e.target.value)}
              onBlur={() => setTocado(true)}
              placeholder={formato === "iban" ? "PT50 0000 0000 0000 0000 0000 0" : undefined}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={erro ? true : undefined}
              aria-describedby={erro ? "hr-conta-numero-erro" : undefined}
            />
            {erro && (
              <p id="hr-conta-numero-erro" className="text-xs text-destructive">
                {erro}
              </p>
            )}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="hr-conta-titular">{t("hr.campos.titular")}</Label>
            <Input
              id="hr-conta-titular"
              value={titular}
              onChange={(e) => setTitular(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hr-conta-banco">{t("hr.campos.banco")}</Label>
            <Input id="hr-conta-banco" value={banco} onChange={(e) => setBanco(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hr-conta-agencia">{t("hr.campos.agencia")}</Label>
            <Input
              id="hr-conta-agencia"
              value={agencia}
              onChange={(e) => setAgencia(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hr-conta-swift">{t("hr.campos.swift")}</Label>
            <Input id="hr-conta-swift" value={swift} onChange={(e) => setSwift(e.target.value)} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={gravar}
            // O minimo depende do formato: 15 para um IBAN (o mais curto do
            // mundo tem 15), 4 para os outros -- com menos, os "ultimos quatro"
            // da mascara seriam o numero inteiro.
            disabled={
              saving || contaNormalizada.length < minimoDaConta(formato) || contaMalformada
            }
          >
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
        {t("hr.campos.conta")}
      </Label>
      <div className="flex items-center gap-2">
        <span className="font-mono text-sm tabular-nums">
          {mascara ?? (
            <span className="font-sans text-muted-foreground">{t("hr.conta.semValor")}</span>
          )}
        </span>
        {mascara && (
          <span className="text-xs text-muted-foreground">
            {t(`hr.formatoConta.${formatoGravado}`)}
          </span>
        )}
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
      {bancarios?.banco && (
        <p className="text-sm text-muted-foreground">
          {bancarios.banco}
          {bancarios.agencia && ` · ${bancarios.agencia}`}
        </p>
      )}
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {t("hr.conta.mascarado")}
      </p>
    </div>
  );
}
