/**
 * "O ponto da equipa" -- a vista de quem chefia.
 *
 * O conteudo e toda a cadeia abaixo, e quem a resolve e a base:
 * `hr_ausencias_pessoa_na_minha_cadeia` da o ramo de leitura a RLS das
 * picagens, das horas e das faltas. A interface nao replica a regra nem sabe
 * quem esta na cadeia -- le, e o que vier e o que ha.
 *
 * A CHEFIA NAO DECIDE JUSTIFICACOES NEM VALIDA HORAS por ter esta permissao:
 * `hr.assiduidade.equipa.view` da ver, e mais nada. Os botoes so aparecem se
 * as permissoes respectivas existirem, e por isso e o mesmo objecto de
 * permissoes que vai para os dois ecras.
 */
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { EcraMapaAssiduidade } from "@/components/hr/assiduidade/EcraMapaAssiduidade";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissoesAssiduidade } from "@/hooks/usePermissoesAssiduidade";
import { useTranslation } from "@/hooks/useTranslation";

export default function AssiduidadeEquipa() {
  const { t } = useTranslation();
  const { activeCompany, isLoading: companyLoading } = useCompany();
  const { permissoes, loading } = usePermissoesAssiduidade();

  if (companyLoading || loading) return <OlyviaLoader />;
  if (!activeCompany) return <NoOrganizationState />;

  return (
    <EcraMapaAssiduidade titulo={t("hr.assiduidade.equipa.titulo")} permissoes={permissoes} />
  );
}
