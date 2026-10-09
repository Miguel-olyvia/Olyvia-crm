/**
 * Configuracao, por organizacao, das regras de fim de contrato: os DEFAULTS
 * com que se avisa antes do fim, se renova (ou nao) sozinho, quantas vezes, por
 * quanto tempo, e o que acontece ao atingir o limite. Cada contrato pode ter
 * depois uma excepcao propria (cartao "Fim do contrato" do separador Contratos).
 *
 * So com `hr.contratos.regras.gerir` -- a rota e o botao ja o exigem; a escrita
 * e re-verificada pela RPC `rpc_hr_regras_fim_contrato_guardar`. Nenhum valor e
 * proposto por este ecra: sem linha gravada a empresa esta DESLIGADA e os
 * campos mostram o que a base tem por omissao, sem o gravar ate se guardar.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { Loader2 } from "lucide-react";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { SemAcessoCard } from "@/components/hr/SemAcessoCard";
import { CamposRegraFimContrato } from "@/components/hr/fimContrato/CamposRegraFimContrato";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useRegrasFimContrato } from "@/hooks/useRegrasFimContrato";
import { useTranslation } from "@/hooks/useTranslation";
import { mensagemDeErroFimContrato } from "@/lib/hr/errosFimContrato";
import {
  inteiroOuNull,
  problemasDaRegra,
  type ErroRegra,
  type FormRegraFimContrato,
  type RegraFimContratoOrg,
} from "@/lib/hr/fimContrato";
import { toast } from "@/lib/toast";

function formDaRegra(regra: RegraFimContratoOrg): FormRegraFimContrato & { ativo: boolean } {
  return {
    ativo: regra.ativo,
    dias_aviso: String(regra.dias_aviso),
    renovacao_automatica: regra.renovacao_automatica ? "sim" : "nao",
    max_renovacoes: String(regra.max_renovacoes),
    duracao_valor: regra.duracao_renovacao_valor === null ? "" : String(regra.duracao_renovacao_valor),
    duracao_unidade: regra.duracao_renovacao_unidade ?? "",
    ao_atingir_limite: regra.ao_atingir_limite,
  };
}

export default function ConfiguracaoRegrasFimContrato() {
  const { t } = useTranslation();
  const { activeCompany, isLoading: companyLoading } = useCompany();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const podeGerir = hasPermission("hr.contratos.regras.gerir");
  const { regra, isLoading, isSaving, guardar, error } = useRegrasFimContrato();

  const [form, setForm] = useState<FormRegraFimContrato>(() => formDaRegra(regra));
  const [erros, setErros] = useState<readonly ErroRegra[]>([]);
  // O formulario segue a base ate alguem comecar a editar (e volta a seguir-a depois de guardar).
  useEffect(() => {
    setForm(formDaRegra(regra));
    setErros([]);
  }, [regra]);

  if (companyLoading || permissionsLoading || isLoading) return <OlyviaLoader />;
  if (!activeCompany) return <NoOrganizationState />;
  if (!podeGerir) return <SemAcessoCard />;

  const submeter = async () => {
    const problemas = problemasDaRegra(form, false);
    setErros(problemas);
    if (problemas.length > 0) return;
    try {
      await guardar({
        ativo: form.ativo,
        diasAviso: inteiroOuNull(form.dias_aviso) as number,
        renovacaoAutomatica: form.renovacao_automatica === "sim",
        maxRenovacoes: inteiroOuNull(form.max_renovacoes) as number,
        duracaoValor: inteiroOuNull(form.duracao_valor),
        duracaoUnidade: form.duracao_unidade === "" ? null : form.duracao_unidade,
        aoAtingirLimite: form.ao_atingir_limite === "" ? regra.ao_atingir_limite : form.ao_atingir_limite,
      });
      toast.success(t("hr.fimContrato.config.guardado"));
    } catch (e) {
      toast.error(await mensagemDeErroFimContrato(e, "hr-regras-fim-contrato-write"));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("hr.fimContrato.config.titulo")}</h1>
        <p className="text-muted-foreground">{t("hr.fimContrato.config.descricao")}</p>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {t("hr.fimContrato.config.erroLeitura")}
        </p>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("hr.fimContrato.config.regrasTitulo")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-start gap-3">
            {/* `aria-labelledby`: o Switch do Radix e um <button>, e o nome
                acessivel de um botao nao vem de uma <label for>. */}
            <Switch
              id="hr-fim-contrato-ativo"
              aria-labelledby="hr-fim-contrato-ativo-rotulo"
              checked={form.ativo}
              onCheckedChange={(ativo) => setForm((anterior) => ({ ...anterior, ativo }))}
            />
            <div className="space-y-1">
              <Label id="hr-fim-contrato-ativo-rotulo" htmlFor="hr-fim-contrato-ativo">
                {t("hr.fimContrato.config.ativo")}
              </Label>
              <p className="text-xs text-muted-foreground">{t("hr.fimContrato.config.ativoAjuda")}</p>
            </div>
          </div>

          <CamposRegraFimContrato
            idPrefixo="hr-fim-contrato"
            valor={form}
            erros={erros}
            onChange={(patch) => setForm((anterior) => ({ ...anterior, ...patch }))}
          />

          <p className="text-xs text-muted-foreground">{t("hr.fimContrato.config.excepcaoNota")}</p>

          <Button onClick={() => void submeter()} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {t("common.save")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
