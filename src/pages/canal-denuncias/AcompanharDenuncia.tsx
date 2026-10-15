/** Página pública (sem sessão) para acompanhar uma denúncia com o código e o PIN. Dados de exemplo: nada sai da página. */
import { useState } from "react";
import { FormularioAcesso } from "@/components/canal-denuncias/acompanhar/FormularioAcesso";
import { VistaAcompanhamento } from "@/components/canal-denuncias/acompanhar/VistaAcompanhamento";
import { MolduraPublica } from "@/components/canal-denuncias/comum/MolduraPublica";
import { useOrganizacaoPublica } from "@/components/canal-denuncias/comum/useOrganizacaoPublica";

export default function AcompanharDenuncia() {
  const [id, setId] = useState<string | null>(null);
  const { organizacao, sufixo } = useOrganizacaoPublica();
  return (
    <MolduraPublica organizacao={organizacao} sufixo={sufixo}>
      {id === null ? <FormularioAcesso onAcesso={setId} /> : <VistaAcompanhamento id={id} onSair={() => setId(null)} />}
    </MolduraPublica>
  );
}
