// O portal de quem entrou pelo link (acesso temporário válido): a moldura, a navegação e a secção ativa, que vive no
// endereço (`?sec=ficha|documentos`, e `&aba=` em Documentos). «Sair» acaba a sessão do acesso e o mesmo link volta a entrar.
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { usePortalDocumentos } from "@/components/rh-exemplo/dados/lojaPortalDocumentos";
import { pendentesDaPessoa } from "@/components/rh-exemplo/lib/portalDocumentos";
import {
  etiquetaFicha, lerAbaDocumentos, lerSeccao, recebidosVisiveis, seccaoPorOmissao, type AbaDocumentos,
} from "@/components/rh-exemplo/lib/portalEstado";
import type { Admissao, VistaPublica } from "@/components/rh-exemplo/lib/admissaoFluxo";
import { PortalSaiu } from "./PortalAcessoTerminado";
import { PortalDocumentos } from "./PortalDocumentos";
import { PortalFicha } from "./PortalFicha";
import { PortalMoldura } from "./PortalMoldura";
import { PortalNavegacao } from "./PortalNavegacao";

interface PortalConectadoProps {
  token: string | undefined;
  admissao: Admissao;
  vista: VistaPublica;
  nome: string | null;
}

export function PortalConectado({ token, admissao, vista, nome }: PortalConectadoProps) {
  const [params, setParams] = useSearchParams();
  const [saiu, setSaiu] = useState(false);
  const portal = usePortalDocumentos(admissao.pessoaId);
  const recebidos = recebidosVisiveis(portal.recebidos, admissao);
  // A secção por omissão decide-se ao abrir e não muda com o estado (senão, ao assinar, a pessoa saltava de Documentos).
  const [omissao] = useState(() => seccaoPorOmissao(admissao.estado));
  const seccao = lerSeccao(params.get("sec"), omissao);
  const aba = lerAbaDocumentos(params.get("aba"));
  // A secção ativa fica sempre no endereço, também quando se abre o link sem `?sec=`.
  useEffect(() => {
    if (params.get("sec") !== seccao) setParams({ ...Object.fromEntries(params), sec: seccao }, { replace: true });
  }, [params, seccao, setParams]);
  const mudarAba = (nova: AbaDocumentos) => setParams({ sec: "documentos", aba: nova }, { replace: true });

  if (saiu) return <PortalSaiu aoEntrar={() => setSaiu(false)} />;
  return (
    <PortalMoldura
      nome={nome} admissao={admissao} aoSair={() => setSaiu(true)}
      navegacao={
        <PortalNavegacao seccao={seccao} etiqueta={etiquetaFicha(admissao.estado)} pendentes={pendentesDaPessoa(recebidos, portal.pedidosRh)} />
      }
    >
      {seccao === "ficha" ? (
        <PortalFicha token={token} admissao={admissao} nome={nome} editavel={vista === "preencher"} />
      ) : (
        <PortalDocumentos token={token} admissao={admissao} portal={portal} recebidos={recebidos} aba={aba} aoMudarAba={mudarAba} />
      )}
    </PortalMoldura>
  );
}
