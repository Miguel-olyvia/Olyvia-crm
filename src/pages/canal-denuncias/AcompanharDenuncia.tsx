/** Página pública (sem sessão) para acompanhar uma denúncia com o código e o PIN. A sessão de acompanhamento vive só em memória. */
import { useState } from "react";
import { FormularioAcesso } from "@/components/canal-denuncias/acompanhar/FormularioAcesso";
import { VistaAcompanhamento } from "@/components/canal-denuncias/acompanhar/VistaAcompanhamento";
import { AvisoCanal } from "@/components/canal-denuncias/comum/AvisoCanal";
import { MolduraPublica } from "@/components/canal-denuncias/comum/MolduraPublica";
import { useOrganizacaoPublica } from "@/components/canal-denuncias/comum/useOrganizacaoPublica";
import { useFonte } from "@/components/canal-denuncias/dados/fonte";

export default function AcompanharDenuncia() {
  const [id, setId] = useState<string | null>(null);
  const { organizacao, sufixo, estado } = useOrganizacaoPublica();
  const fonte = useFonte();
  const sair = (): void => {
    if (id !== null) fonte.sair(id);
    setId(null);
  };
  return (
    <MolduraPublica organizacao={organizacao} sufixo={sufixo}>
      {estado !== "ok" ? (
        <AvisoCanal estado={estado} />
      ) : id === null ? (
        <FormularioAcesso onAcesso={setId} slugPublico={organizacao.id} />
      ) : (
        <VistaAcompanhamento id={id} onSair={sair} />
      )}
    </MolduraPublica>
  );
}
