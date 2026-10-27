/** «A minha área > Denúncias»: denunciar (painel «Nova denúncia»), as identificadas da própria pessoa e o acompanhamento das anónimas. */
import { PaginaDenuncias } from "@/components/canal-denuncias/minhaArea/PaginaDenuncias";
import { useContextoCanal } from "@/components/rh-exemplo/hooks/useCanalDenuncias";
import { CarregandoDenuncias, SemFichaDenuncias } from "./RhSemFichaDenuncias";

export default function RhMinhasDenuncias() {
  const { organizacaoId, organizacaoNome, pessoa, carregando } = useContextoCanal();
  if (carregando) return <CarregandoDenuncias />;
  if (!pessoa) return <SemFichaDenuncias />;
  return <PaginaDenuncias organizacaoId={organizacaoId} organizacaoNome={organizacaoNome} pessoa={pessoa} />;
}
