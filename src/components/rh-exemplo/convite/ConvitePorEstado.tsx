// A página pública do link, por estado: a pessoa entra com o login temporário (o link, sem conta nem palavra-passe) e vê o que
// corresponde à fase da admissão: o formulário (ou só os campos devolvidos), «Recebemos a tua ficha», o contrato para assinar,
// «Contrato assinado», ou um aviso de login expirado / link revogado. Um token desconhecido cai no formulário, que mostra o
// cartão de ligação inválida. Só memória.
import { useEffect, type ReactNode } from "react";
import { abrirLink } from "@/components/rh-exemplo/dados/accoesAdmissao";
import { useAdmissaoPublica } from "@/components/rh-exemplo/hooks/useAdmissaoPublica";
import { camposEditaveis } from "@/components/rh-exemplo/lib/admissaoFluxo";
import { ConviteContratoPublico } from "./ConviteContratoPublico";
import { ConviteDevolvida } from "./ConviteDevolvida";
import { ConviteEstadoCartao } from "./ConviteEstadoCartao";
import { ConviteFaixaPrazo } from "./ConviteFaixaPrazo";

export function ConvitePorEstado({ token, formulario }: { token: string | undefined; formulario: ReactNode }) {
  const { admissao, vista, nome } = useAdmissaoPublica(token);
  // Abrir o link pela primeira vez: «convite enviado» passa a «a preencher».
  useEffect(() => {
    if (vista === "preencher") abrirLink(token);
  }, [vista, token]);

  if (!admissao || vista === "invalida") return <>{formulario}</>;
  if (vista === "contrato") return <ConviteContratoPublico token={token} admissao={admissao} nome={nome} />;
  if (vista === "preencher") {
    if (camposEditaveis(admissao) !== null) return <ConviteDevolvida token={token} admissao={admissao} nome={nome} />;
    return (
      <>
        <div className="mx-auto max-w-2xl px-4 pt-6"><ConviteFaixaPrazo admissao={admissao} comRascunho /></div>
        {formulario}
      </>
    );
  }
  return <ConviteEstadoCartao vista={vista} admissao={admissao} nome={nome} />;
}
