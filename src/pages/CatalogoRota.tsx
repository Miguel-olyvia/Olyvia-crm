// 17/11: as rotas /catalogo/produtos, /catalogo/servicos/* (Ligações incluída: /catalogo/servicos/ligacoes) e as fichas (/catalogo/produtos/:id, /catalogo/servicos/:sid) montam
// POR AGORA a página atual (CatalogoCustos) com a secção e a ficha que a rota diz. A troca das leituras pesadas fica para as fases seguintes.
// O que não vem da rota (?criar=…, ?consumivel=…) lê-se da pesquisa do endereço: sem o EnderecoAtivo a página guardava-o só em memória, e as
// ligações que o RedirectCatalogo traduz (/catalogo-custos?criar=produto) perdiam-no.
import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { EnderecoAtivo } from "@/lib/paramUrl";
import { type RotaCatalogo, type SeccaoCatalogo } from "@/emylia/catalogoRotas";
import CatalogoCustos from "./CatalogoCustos";

export default function CatalogoRota({ seccao }: { seccao: SeccaoCatalogo }) {
  const navigate = useNavigate();
  const { id, sid } = useParams();
  const rota = useMemo<RotaCatalogo>(
    () => ({ seccao, produto: seccao === "produtos" ? id : undefined, servico: seccao === "servicos" ? sid : undefined, ir: (caminho, op) => navigate(caminho, { replace: op?.substituir === true }) }),
    [seccao, id, sid, navigate],
  );
  return <EnderecoAtivo.Provider value="pesquisa"><CatalogoCustos rota={rota} /></EnderecoAtivo.Provider>;
}
