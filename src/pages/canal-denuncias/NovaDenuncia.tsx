/** Página pública (sem sessão) para denunciar, de forma anónima ou identificada. O canal vem do `?org=`; sem canal ativo diz «indisponível». */
import { AvisoCanal } from "@/components/canal-denuncias/comum/AvisoCanal";
import { MolduraPublica } from "@/components/canal-denuncias/comum/MolduraPublica";
import { useOrganizacaoPublica } from "@/components/canal-denuncias/comum/useOrganizacaoPublica";
import { FormularioDenuncia } from "@/components/canal-denuncias/formulario/FormularioDenuncia";

export default function NovaDenuncia() {
  const { organizacao, sufixo, estado } = useOrganizacaoPublica();
  return (
    <MolduraPublica organizacao={organizacao} sufixo={sufixo}>
      {estado === "ok"
        ? <FormularioDenuncia organizacaoId={organizacao.id} slugPublico={organizacao.id} />
        : <AvisoCanal estado={estado} />}
    </MolduraPublica>
  );
}
