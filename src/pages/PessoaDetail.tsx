/**
 * A ligacao direta para a ficha de uma pessoa de RH (`/rh/pessoas/:id`): abre a lista de pessoas com a ficha dessa pessoa
 * aberta num painel lateral. A ficha deixou de ser uma pagina; vive em `components/hr/ficha/FichaPessoaRh` e a lista
 * (`Pessoas`) e quem a abre. Os links antigos com `?tab=` (por exemplo `?tab=contratos`) abrem a ficha nessa aba.
 *
 * Esta pagina serve a rota `/rh/pessoas/:id?` (a lista sem `:id`, a ficha com ele): uma so rota, para abrir e fechar a ficha
 * mudar o endereco sem remontar a lista.
 */
import { useParams } from "react-router-dom";
import Pessoas from "./Pessoas";

export default function PessoaDetail() {
  const { id } = useParams<{ id: string }>();
  return <Pessoas pessoaIdInicial={id} />;
}
