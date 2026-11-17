import { Navigate, useLocation } from "react-router-dom";
import { destinoCatalogoAntigo } from "@/emylia/catalogoRotas";

/**
 * 17/11/2026: o Catálogo foi dividido em páginas (/catalogo/…, com menu lateral) e /catalogo-custos deixou de montar a página: traduz
 * ?sec=, ?servico=, ?produto=, ?consumivel=, ?criar= e ?atributos= para a rota nova e mantém o hash, para que as ligações guardadas
 * (e-mails, favoritos, links da Olyvia) continuem a abrir o mesmo sítio. Quem decide o acesso é a rota de destino (services.view).
 */
export function RedirectCatalogo() {
  const location = useLocation();
  const [pathname, pesquisa = ""] = destinoCatalogoAntigo(location.search).split("?");
  return <Navigate replace to={{ pathname, search: pesquisa ? `?${pesquisa}` : "", hash: location.hash }} />;
}
