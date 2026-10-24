/** «Recursos Humanos > Denúncias»: a gestão das denúncias (anónimas e identificadas) da ORGANIZAÇÃO ativa. Dados em memória. */
import { PaginaGestao } from "@/components/canal-denuncias/gestao/PaginaGestao";
import { useContextoCanal } from "@/components/rh-exemplo/hooks/useCanalDenuncias";

export default function RhDenuncias() {
  const { organizacaoId, organizacaoNome } = useContextoCanal();
  return <PaginaGestao organizacaoId={organizacaoId} organizacaoNome={organizacaoNome} />;
}
