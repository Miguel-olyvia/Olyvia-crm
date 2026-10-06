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
 *
 * O BIC (codigo SWIFT) identifica o banco, nao a conta: nao e sensivel, le-se
 * em claro e corrige-se sozinho, sem repor o IBAN, por `rpc_hr_definir_bic`.
 */
import { useEffect, useRef, useState } from "react";
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
  bicValido,
  chaveDoRotuloDaConta,
  contaValida,
  mascaraDaConta,
  minimoDaConta,
  normalizarBic,
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
  /** Chama `rpc_hr_definir_bic`: corrige so o BIC. Sem ela nao ha edicao isolada. */
  onDefinirBic?: (bic: string | null) => Promise<string | null>;
}

export function PessoaContaBancariaField({
  bancarios,
  podeEditar,
  saving,
  onDefinir,
  onDefinirBic,
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
  const [aEditarBic, setAEditarBic] = useState(false);
  const [bicSozinho, setBicSozinho] = useState("");

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

  const bicMalformado = !bicValido(swift);
  const bicSozinhoMalformado = !bicValido(bicSozinho);

  // Foco da edicao isolada do BIC: entra no campo ao abrir e volta ao botao de
  // abrir ao gravar ou cancelar (o botao desmonta enquanto o editor esta aberto).
  const bicSozinhoRef = useRef<HTMLInputElement>(null);
  const abrirBicRef = useRef<HTMLButtonElement>(null);
  const devolverFocoAoBic = useRef(false);

  useEffect(() => {
    if (aEditarBic) {
      bicSozinhoRef.current?.focus();
    } else if (devolverFocoAoBic.current) {
      devolverFocoAoBic.current = false;
      abrirBicRef.current?.focus();
    }
  }, [aEditarBic]);

  const abrirBic = () => {
    setBicSozinho(bancarios?.swift ?? "");
    setAEditarBic(true);
  };

  const fecharBic = () => {
    devolverFocoAoBic.current = true;
    setAEditarBic(false);
  };

  const gravarBic = async () => {
    if (!onDefinirBic) return;
    const bic = normalizarBic(bicSozinho) || null;
    // Sem linha de dados bancarios e sem BIC nao ha nada a limpar: o servidor
    // nao escreve nada, por isso nao se chama nem se diz "guardado".
    if (bic === null && !bancarios) {
      fecharBic();
      return;
    }
    const mensagem = await onDefinirBic(bic);
    if (mensagem) {
      toast.error(mensagem);
      return;
    }
    toast.success(t("hr.sucesso.guardado"));
    fecharBic();
  };

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
      swift: normalizarBic(swift) || null,
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
            <Input
              id="hr-conta-swift"
              value={swift}
              onChange={(e) => setSwift(normalizarBic(e.target.value).slice(0, 11))}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={bicMalformado ? true : undefined}
              aria-describedby={bicMalformado ? "hr-conta-swift-erro" : "hr-conta-swift-ajuda"}
            />
            {bicMalformado ? (
              <p id="hr-conta-swift-erro" role="alert" className="text-xs text-destructive">
                {t("hr.form.erroBic")}
              </p>
            ) : (
              <p id="hr-conta-swift-ajuda" className="text-xs text-muted-foreground">
                {t("hr.campos.bicAjuda")}
              </p>
            )}
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
              saving ||
              contaNormalizada.length < minimoDaConta(formato) ||
              contaMalformada ||
              bicMalformado
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
            disabled={aEditarBic}
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
      {aEditarBic ? (
        <div className="space-y-1.5 pt-1">
          <Label htmlFor="hr-conta-bic-sozinho">{t("hr.campos.swift")}</Label>
          <Input
            id="hr-conta-bic-sozinho"
            ref={bicSozinhoRef}
            value={bicSozinho}
            onChange={(e) => setBicSozinho(normalizarBic(e.target.value).slice(0, 11))}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={bicSozinhoMalformado ? true : undefined}
            aria-describedby={
              bicSozinhoMalformado ? "hr-conta-bic-sozinho-erro" : "hr-conta-bic-sozinho-ajuda"
            }
          />
          {bicSozinhoMalformado ? (
            <p id="hr-conta-bic-sozinho-erro" role="alert" className="text-xs text-destructive">
              {t("hr.form.erroBic")}
            </p>
          ) : (
            <p id="hr-conta-bic-sozinho-ajuda" className="text-xs text-muted-foreground">
              {t("hr.campos.bicAjuda")}
            </p>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={gravarBic} disabled={saving || bicSozinhoMalformado}>
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {t("employees.form.update")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={fecharBic}
              disabled={saving}
            >
              {t("employees.form.cancel")}
            </Button>
          </div>
        </div>
      ) : (
        (bancarios?.swift || (podeEditar && onDefinirBic)) && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{t("hr.campos.swift")}</span>
            {bancarios?.swift && (
              <span className="font-mono tabular-nums text-foreground">{bancarios.swift}</span>
            )}
            {podeEditar && onDefinirBic && (
              <Button
                ref={abrirBicRef}
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs"
                onClick={abrirBic}
                aria-label={`${t("employees.form.update")} ${t("hr.campos.swift")}`}
              >
                <Pencil className="h-3.5 w-3.5" />
                {t("employees.form.update")}
              </Button>
            )}
          </div>
        )
      )}
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {t("hr.conta.mascarado")}
      </p>
    </div>
  );
}
