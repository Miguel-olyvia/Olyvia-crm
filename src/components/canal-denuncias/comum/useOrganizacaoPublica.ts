// A organização de uma página pública (sem sessão, logo sem «organização ativa»): vem do parâmetro `?org=` do endereço
// e, sem ele, é a organização de exemplo. Nada é lido de lado nenhum.
import { useSearchParams } from "react-router-dom";
import type { CanalPublico } from "../dados/fonte";
import { useFonte } from "../dados/fonte";
import type { OrganizacaoExemplo } from "../dados/organizacoes";

export interface OrganizacaoDaPagina {
  /** `id` é o identificador do canal (o `?org=`); `nome` só é fiável quando `estado` é `ok`. */
  organizacao: OrganizacaoExemplo;
  /** `?org=<id>` quando o endereço o trazia (para as ligações o manterem); vazio caso contrário. */
  sufixo: string;
  /** `indisponivel`: sem `?org=`, desconhecido ou desligado. Com a base real nunca se cai noutra organização. */
  estado: CanalPublico["estado"];
}

export function useOrganizacaoPublica(): OrganizacaoDaPagina {
  const [params] = useSearchParams();
  const pedido = params.get("org");
  const canal = useFonte().useCanalPublico(pedido);
  return {
    organizacao: { id: canal.id, nome: canal.nome },
    sufixo: pedido !== null && pedido === canal.id ? `?org=${encodeURIComponent(canal.id)}` : "",
    estado: canal.estado,
  };
}
