// A organização de uma página pública (sem sessão, logo sem «organização ativa»): vem do parâmetro `?org=` do endereço
// e, sem ele, é a organização de exemplo. Nada é lido de lado nenhum.
import { useSearchParams } from "react-router-dom";
import { organizacaoPublica, type OrganizacaoExemplo } from "../dados/organizacoes";

export interface OrganizacaoDaPagina {
  organizacao: OrganizacaoExemplo;
  /** `?org=<id>` quando o endereço o trazia (para as ligações o manterem); vazio caso contrário. */
  sufixo: string;
}

export function useOrganizacaoPublica(): OrganizacaoDaPagina {
  const [params] = useSearchParams();
  const pedido = params.get("org");
  const organizacao = organizacaoPublica(pedido);
  return { organizacao, sufixo: pedido === organizacao.id ? `?org=${encodeURIComponent(organizacao.id)}` : "" };
}
