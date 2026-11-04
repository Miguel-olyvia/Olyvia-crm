import { Navigate, useLocation, useParams } from "react-router-dom";

/**
 * 03/11/2026: as rotas antigas do RH (/rh/*) deixaram de montar as páginas antigas e levam para o equivalente em /rh-exemplo/*.
 * Mantém o `:id` (quando o destino tem `:id`), a query string e o hash, para que as ligações guardadas (notificações, e-mails,
 * favoritos, `/rh/pessoas/<id>?tab=laborais`) continuem a abrir o mesmo sítio. Se `para` já trouxer uma query, os parâmetros
 * do endereço antigo juntam-se a ela (os do destino ganham). Quem decide o acesso é a rota de destino.
 */
export function RedirectRh({ para }: { para: string }) {
  const location = useLocation();
  const { id } = useParams();
  // O `?` de `/:id?` é do parâmetro opcional, não da query: substitui-se antes de partir o destino.
  const destino = para.replace("/:id?", id ? `/${encodeURIComponent(id)}` : "");
  const [pathname = "", pesquisaDestino = ""] = destino.split("?");
  const pesquisa = new URLSearchParams(location.search);
  new URLSearchParams(pesquisaDestino).forEach((valor, chave) => pesquisa.set(chave, valor));
  const search = pesquisa.toString();
  return <Navigate replace to={{ pathname, search: search ? `?${search}` : "", hash: location.hash }} />;
}
