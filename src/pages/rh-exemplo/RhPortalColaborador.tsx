/**
 * O PORTAL DO COLABORADOR (de exemplo): a página pública que o link do convite de admissão abre. Sem login (acesso temporário
 * de 7 dias) e fora do layout do CRM, tem uma moldura própria com duas secções: «Ficha de admissão» (preencher e esperar a
 * decisão do RH) e «Documentos» (a troca de documentos nos dois sentidos com o RH). Se o acesso terminou (expirado, revogado,
 * já ativo) ou o link não existe, mostra o ecrã de acesso terminado, sem navegação. Só memória: nada se envia nem se lê.
 */
import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { FaixaPreVisualizacao } from "@/components/rh-exemplo/convite/FaixaPreVisualizacao";
import { abrirLink } from "@/components/rh-exemplo/dados/accoesAdmissao";
import { useAdmissaoPublica } from "@/components/rh-exemplo/hooks/useAdmissaoPublica";
import { temPortal, vistaTerminada } from "@/components/rh-exemplo/lib/portalEstado";
import { PortalAcessoTerminado } from "@/components/rh-exemplo/portal/PortalAcessoTerminado";
import { PortalConectado } from "@/components/rh-exemplo/portal/PortalConectado";

export default function RhPortalColaborador() {
  const { token } = useParams<{ token: string }>();
  const { admissao, vista, nome } = useAdmissaoPublica(token);
  // Abrir o link pela primeira vez: «convite enviado» passa a «a preencher».
  useEffect(() => {
    if (vista === "preencher") abrirLink(token);
  }, [vista, token]);

  return (
    <>
      {/* Só nesta apresentação de exemplo: a faixa de volta à lista de estados (não faz parte do que a pessoa vê de verdade). */}
      <FaixaPreVisualizacao token={token} />
      {admissao && temPortal(vista) ? (
        <PortalConectado key={token} token={token} admissao={admissao} vista={vista} nome={nome} />
      ) : (
        <PortalAcessoTerminado vista={vistaTerminada(vista)} nome={nome} />
      )}
    </>
  );
}
