/**
 * "Mapa do mes" -- a assiduidade de toda a organizacao.
 *
 * Duas metades no mesmo ecra: o MAPA (uma linha por pessoa, uma coluna por
 * dia) e a FILA DE TRABALHO (o que `hr_assiduidade_desvios` propoe). O eixo do
 * menu e a audiencia: este ecra e o "de toda a gente", e o da equipa e outro.
 *
 * O mapa nao vira nem pagina. Com algumas centenas de pessoas fica pesado, e
 * isso esta dito no proprio componente em vez de ser descoberto em producao.
 */
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { EcraMapaAssiduidade } from "@/components/hr/assiduidade/EcraMapaAssiduidade";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissoesAssiduidade } from "@/hooks/usePermissoesAssiduidade";
import { useTranslation } from "@/hooks/useTranslation";

export default function AssiduidadeOrganizacao() {
  const { t } = useTranslation();
  const { activeCompany, isLoading: companyLoading } = useCompany();
  const { permissoes, loading } = usePermissoesAssiduidade();

  if (companyLoading || loading) return <OlyviaLoader />;
  if (!activeCompany) return <NoOrganizationState />;

  return (
    <EcraMapaAssiduidade titulo={t("hr.assiduidade.organizacao.titulo")} permissoes={permissoes} />
  );
}
