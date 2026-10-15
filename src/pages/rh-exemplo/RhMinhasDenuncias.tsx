/** «A minha área > As minhas denúncias»: as identificadas da própria pessoa e o acompanhamento das anónimas por código e PIN. */
import { PaginaMinhasDenuncias } from "@/components/canal-denuncias/minhaArea/PaginaMinhasDenuncias";
import { useContextoCanal } from "@/components/rh-exemplo/hooks/useCanalDenuncias";
import { SemFichaDenuncias } from "./RhSemFichaDenuncias";

export default function RhMinhasDenuncias() {
  const { organizacaoId, organizacaoNome, pessoa } = useContextoCanal();
  if (!pessoa) return <SemFichaDenuncias />;
  return <PaginaMinhasDenuncias organizacaoId={organizacaoId} organizacaoNome={organizacaoNome} pessoaId={pessoa.id} />;
}
