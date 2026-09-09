import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { Spinner } from "./ui";

/**
 * Barreira de sessão. Sem sessão → /login. Com sessão mas sem perfil
 * anew_users (não é utilizador do sistema) → mensagem de bloqueio.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { loading, session, businessUserId } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="A carregar…" />
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;

  if (!businessUserId) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-md space-y-2 text-center">
          <h1 className="text-lg font-semibold text-slate-800">Conta sem perfil</h1>
          <p className="text-sm text-slate-500">
            Esta conta não está associada a um utilizador do sistema. Contacte o administrador da Olyvia.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
