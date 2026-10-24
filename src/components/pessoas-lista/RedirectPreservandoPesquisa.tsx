import { Navigate, useLocation } from "react-router-dom";

/**
 * Redireciona as rotas antigas (leads, clientes, contactos) para /pessoas
 * mantendo a query string e o hash, para que links como /leads?open=<id>
 * (notificações, e-mails, favoritos) continuem a abrir a ficha.
 */
export function RedirectPreservandoPesquisa() {
  const location = useLocation();
  return <Navigate replace to={{ pathname: "/pessoas", search: location.search, hash: location.hash }} />;
}
