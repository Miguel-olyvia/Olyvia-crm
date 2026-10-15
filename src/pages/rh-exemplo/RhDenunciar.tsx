/** «A minha área > Denunciar»: o assistente do canal de denúncias, dentro da app, para a organização ativa. Dados em memória. */
import { PaginaDenunciar } from "@/components/canal-denuncias/minhaArea/PaginaDenunciar";
import { useContextoCanal } from "@/components/rh-exemplo/hooks/useCanalDenuncias";
import { SemFichaDenuncias } from "./RhSemFichaDenuncias";

export default function RhDenunciar() {
  const { organizacaoId, organizacaoNome, pessoa } = useContextoCanal();
  if (!pessoa) return <SemFichaDenuncias />;
  return <PaginaDenunciar organizacaoId={organizacaoId} organizacaoNome={organizacaoNome} pessoa={pessoa} />;
}
