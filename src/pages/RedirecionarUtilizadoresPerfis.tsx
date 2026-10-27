import { Navigate, useLocation } from "react-router-dom";

interface RedirecionarUtilizadoresPerfisProps {
  aba: "utilizadores" | "roles";
}

/**
 * /users e /roles já não têm página própria: levam ao separador certo de /utilizadores-perfis, para que os
 * links antigos (favoritos, e-mails, atalhos) continuem a funcionar. Os parâmetros que já traziam, como ?edit=, mantêm-se.
 * A guarda de permissão é a da rota de destino.
 */
const RedirecionarUtilizadoresPerfis = ({ aba }: RedirecionarUtilizadoresPerfisProps) => {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  params.set("aba", aba);
  return <Navigate to={`/utilizadores-perfis?${params.toString()}`} replace />;
};

export default RedirecionarUtilizadoresPerfis;
