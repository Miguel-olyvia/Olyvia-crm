// O chip de estado de admissão de uma pessoa, na lista de Pessoas: só aparece a quem tem um processo de admissão em curso
// (ou terminado sem sucesso). Não mostra «concluída» (a coluna do acesso já o diz) nem «desconhecido» (não se inventa).
// O estado vem do mapa que a lista pede UMA vez à base (`useEstadoAdmissaoPorPessoa`); aqui não há pedidos. Texto e variante
// são os reais dos selos da ficha; nunca só a cor.
import { Badge } from "@/components/ui/badge";
import { varianteDaAdmissao, type EstadoAdmissao } from "@/components/rh-exemplo/hooks/aspectoSelosAdmissao";
import { useTranslation } from "@/hooks/useTranslation";

export function EstadoAdmissaoDaPessoa({ estado }: { estado: EstadoAdmissao | undefined }) {
  const { t } = useTranslation();
  if (!estado || estado === "concluida" || estado === "desconhecido") return null;
  return (
    <Badge variant={varianteDaAdmissao(estado)} className="font-normal">
      {t(`hr.convite.estadoAdmissao.${estado}`)}
    </Badge>
  );
}
