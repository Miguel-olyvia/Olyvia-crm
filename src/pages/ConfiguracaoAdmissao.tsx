/**
 * Configuracao, por organizacao, de quais campos de admissao sao obrigatorios
 * (20261201050000). Lista os codigos que `hr_admissao_campos_obrigatorios()`
 * declara (29, via `hr_admissao_campos_obrigatorios_org`) e deixa
 * ligar/desligar cada um -- o omissao e SEMPRE obrigatorio; so um "Opcional"
 * explicito grava um `false` em `organization_admissao_settings`.
 *
 * A sindicalizacao (sindicalizado, sindicato) e a carta de conducao NAO
 * aparecem aqui, de proposito: ja estao de fora da lista de obrigatorios por
 * decisao de RGPD (20261130150000) e nao ha nada que este ecra deva oferecer
 * sobre elas.
 */
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { SemAcessoCard } from "@/components/hr/SemAcessoCard";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useTranslation } from "@/hooks/useTranslation";
import {
  useConfiguracaoObrigatoriosAdmissao,
  type CampoObrigatorioOrg,
} from "@/hooks/useConfiguracaoObrigatoriosAdmissao";
import { toast } from "@/lib/toast";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";

/**
 * codigo -> chave de traducao existente, reaproveitada do formulario de
 * admissao (`ConviteAdmissao.tsx`) e da ficha de pessoa. Nenhuma chave nova
 * foi criada para os RÓTULOS dos campos -- so para o texto proprio deste
 * ecra (`hr.admissao.config*`).
 */
const ETIQUETA_POR_CODIGO: Record<string, string> = {
  data_nascimento: "employees.form.birthDate",
  genero: "hr.campos.genero",
  nacionalidade: "hr.campos.nacionalidade",
  telefone_pessoal: "hr.campos.telefonePessoal",
  email_pessoal: "hr.campos.emailPessoal",
  estado_civil: "hr.campos.estadoCivil",
  dependentes: "hr.campos.dependentes",
  dependentes_deficientes: "hr.campos.dependentesDeficientes",
  conjuge_situacao_profissional: "hr.campos.conjugeSituacaoProfissional",
  naturalidade_freguesia: "hr.campos.naturalidadeFreguesia",
  naturalidade_concelho: "hr.campos.naturalidadeConcelho",
  naturalidade_pais: "hr.campos.naturalidadePais",
  habilitacao_academica: "hr.campos.habilitacaoAcademica",
  habilitacao_data_conclusao: "hr.campos.habilitacaoDataConclusao",
  nif: "hr.campos.nif",
  niss: "hr.campos.niss",
  tipo_documento: "hr.campos.tipoDocumento",
  numero_documento: "hr.campos.numeroDocumento",
  validade_documento: "hr.campos.validadeDocumento",
  linha1: "hr.campos.linha1",
  codigo_postal: "employees.form.postalCode",
  localidade: "hr.campos.localidade",
  tamanho_cima: "hr.fardamento.tamanhoCima",
  tamanho_baixo: "hr.fardamento.tamanhoBaixo",
  tamanho_blazer: "hr.fardamento.tamanhoBlazer",
  conta_numero: "hr.campos.numeroConta",
  conta_titular: "hr.campos.titularConta",
  conta_banco: "hr.campos.banco",
  data_admissao: "employees.form.hireDate",
};

export default function ConfiguracaoAdmissao() {
  const { t } = useTranslation();
  const { activeCompany, isLoading: companyLoading } = useCompany();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const podeGerir = hasPermission("hr.admissao.obrigatorios.gerir");

  const { campos, isLoading, isSaving, definirObrigatorio } = useConfiguracaoObrigatoriosAdmissao();

  // Pagina 1 (a pessoa preenche antes de submeter) primeiro, depois o que o
  // RH preenche na retaguarda -- a ordem em que a folha de cadastro os pede.
  const camposOrdenados = useMemo(
    () =>
      [...campos].sort((a: CampoObrigatorioOrg, b: CampoObrigatorioOrg) => {
        if (a.origem !== b.origem) return a.origem === "pessoa" ? -1 : 1;
        return a.codigo.localeCompare(b.codigo);
      }),
    [campos],
  );

  const alternar = async (campo: CampoObrigatorioOrg) => {
    try {
      await definirObrigatorio(campo.codigo, !campo.obrigatorio);
      toast.success(t("hr.admissao.configGuardado"));
    } catch (erro) {
      toast.error(await getFriendlyErrorMessage(erro));
    }
  };

  if (companyLoading || permissionsLoading) return <OlyviaLoader />;
  if (!activeCompany) return <NoOrganizationState />;
  if (!podeGerir) return <SemAcessoCard className="m-6" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("hr.admissao.configTitulo")}</h1>
        <p className="text-muted-foreground">{t("hr.admissao.configSubtitulo")}</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("hr.convite.tituloPagina")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <OlyviaLoader size={32} />
            </div>
          ) : (
            camposOrdenados.map((campo) => {
              const etiquetaChave = ETIQUETA_POR_CODIGO[campo.codigo];
              const etiqueta = etiquetaChave ? t(etiquetaChave) : campo.codigo;
              const inputId = `admissao-obrigatorio-${campo.codigo}`;
              return (
                <div
                  key={campo.codigo}
                  className="flex items-center justify-between gap-4 border-b py-3 last:border-b-0"
                >
                  <div>
                    <Label htmlFor={inputId} className="font-normal">
                      {etiqueta}
                    </Label>
                    {campo.origem === "rh" && (
                      <p className="text-xs text-muted-foreground">
                        {t("hr.admissao.origemRh")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={campo.obrigatorio ? "default" : "secondary"}>
                      {campo.obrigatorio
                        ? t("hr.admissao.configObrigatorio")
                        : t("hr.admissao.configOpcional")}
                    </Badge>
                    <Switch
                      id={inputId}
                      checked={campo.obrigatorio}
                      disabled={isSaving}
                      onCheckedChange={() => alternar(campo)}
                    />
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
