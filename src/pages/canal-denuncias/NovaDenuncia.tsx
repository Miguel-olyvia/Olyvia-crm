/** Página pública (sem sessão) para denunciar, de forma anónima ou identificada. Dados de exemplo: nada é enviado. */
import { MolduraPublica } from "@/components/canal-denuncias/comum/MolduraPublica";
import { useOrganizacaoPublica } from "@/components/canal-denuncias/comum/useOrganizacaoPublica";
import { FormularioDenuncia } from "@/components/canal-denuncias/formulario/FormularioDenuncia";

export default function NovaDenuncia() {
  const { organizacao, sufixo } = useOrganizacaoPublica();
  return (
    <MolduraPublica organizacao={organizacao} sufixo={sufixo}>
      <FormularioDenuncia organizacaoId={organizacao.id} />
    </MolduraPublica>
  );
}
