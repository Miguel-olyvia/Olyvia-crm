/**
 * O PORTAL DO COLABORADOR: a página pública que o link do convite de admissão abre. Sem login e fora do layout do CRM.
 *
 * Dois caminhos, decididos pelo token:
 *  - LINK REAL (qualquer token que não seja de demonstração): fala com a Edge Function `convite-admissao` (consulta limitada,
 *    código OTP por e-mail, sessão em memória, leitura do portal, NISS/IBAN, sair). Ver `PortalReal`.
 *  - LINK DE DEMONSTRAÇÃO (os tokens das fichas de exemplo, como «exemplo» ou «contrato»): a pré-visualização em memória dos
 *    estados da admissão, com a troca de documentos com o RH, que ainda não tem tabela nem ação na Edge. Nada se envia nem se lê.
 */
import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { FaixaPreVisualizacao } from "@/components/rh-exemplo/convite/FaixaPreVisualizacao";
import { abrirLink } from "@/components/rh-exemplo/dados/accoesAdmissao";
import { useAdmissaoPublica } from "@/components/rh-exemplo/hooks/useAdmissaoPublica";
import { temPortal, vistaTerminada } from "@/components/rh-exemplo/lib/portalEstado";
import { PortalAcessoTerminado } from "@/components/rh-exemplo/portal/PortalAcessoTerminado";
import { PortalConectado } from "@/components/rh-exemplo/portal/PortalConectado";
import { PortalReal } from "@/components/rh-exemplo/portal/PortalReal";

export default function RhPortalColaborador() {
  const { token } = useParams<{ token: string }>();
  const { admissao } = useAdmissaoPublica(token);
  return admissao ? <PortalDemonstracao token={token} /> : <PortalReal key={token} token={token} />;
}

function PortalDemonstracao({ token }: { token: string | undefined }) {
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
