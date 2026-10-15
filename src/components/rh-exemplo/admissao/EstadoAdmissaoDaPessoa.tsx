// O chip de estado de admissão de uma pessoa, na lista de Pessoas: só aparece a quem está em admissão (e já não mostra «acesso
// ativo», que a coluna do acesso já diz). Ícone e texto, nunca só a cor.
import { agoraExemplo } from "@/components/rh-exemplo/dados/hojeExemplo";
import { useAdmissao } from "@/components/rh-exemplo/dados/lojaAdmissao";
import { estadoVisivel } from "@/components/rh-exemplo/lib/admissaoFluxo";
import { EstadoAdmissaoChip } from "./aspeto";

export function EstadoAdmissaoDaPessoa({ pessoaId }: { pessoaId: string }) {
  const adm = useAdmissao(pessoaId);
  if (!adm || adm.estado === "acesso_ativo") return null;
  return <EstadoAdmissaoChip estado={estadoVisivel(adm, agoraExemplo())} />;
}
