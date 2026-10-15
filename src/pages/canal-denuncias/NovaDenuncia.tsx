/** Página pública (sem sessão) para denunciar, de forma anónima ou identificada. Dados de exemplo: nada é enviado. */
import { MolduraPublica } from "@/components/canal-denuncias/comum/MolduraPublica";
import { FormularioDenuncia } from "@/components/canal-denuncias/formulario/FormularioDenuncia";

export default function NovaDenuncia() {
  return (
    <MolduraPublica>
      <FormularioDenuncia />
    </MolduraPublica>
  );
}
