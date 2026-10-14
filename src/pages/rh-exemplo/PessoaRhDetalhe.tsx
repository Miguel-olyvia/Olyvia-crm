/**
 * A ligacao direta para a ficha de uma pessoa de RH (`/rh-exemplo/pessoas/:id`): abre a lista de pessoas com a ficha dessa
 * pessoa aberta num painel lateral. A ficha deixou de ser uma pagina; vive em
 * `components/rh-exemplo/ficha/FichaPessoaRh` e a lista (`PessoasRh`) e quem a abre.
 */
import { useParams } from "react-router-dom";
import PessoasRh from "./PessoasRh";

export default function PessoaRhDetalhe() {
  const { id } = useParams<{ id: string }>();
  return <PessoasRh pessoaIdInicial={id} />;
}
