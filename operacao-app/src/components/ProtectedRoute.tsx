import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { Spinner } from "./ui";
import { OperacaoMark } from "./icons";

/**
 * Barreira de sessão, em três degraus — e cada degrau diz ao utilizador o que
 * fazer a seguir. Um ecrã em branco não é uma resposta.
 *
 *   sem sessão                     → /login
 *   sessão sem perfil anew_users   → não é utilizador da Olyvia
 *   utilizador sem função no módulo→ ninguém lhe deu acesso a Operações
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { loading, session, businessUserId, funcao, userEmail } = useAuth();

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
      <Bloqueio
        titulo="Conta sem perfil"
        texto="Esta conta não está associada a um utilizador do sistema Olyvia. Contacta o administrador."
      />
    );
  }

  if (!funcao) {
    return (
      <Bloqueio
        titulo="Sem acesso a Operações"
        texto={
          `A conta ${userEmail ?? ""} existe na Olyvia, mas ainda não tem função atribuída ` +
          "em Operações. Um administrador precisa de te adicionar à equipa do módulo."
        }
      />
    );
  }

  return <>{children}</>;
}

function Bloqueio({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="app-canvas flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md space-y-3 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <OperacaoMark width={26} height={26} />
        </div>
        <h1 className="text-lg font-semibold text-slate-800">{titulo}</h1>
        <p className="text-sm leading-relaxed text-slate-500">{texto}</p>
      </div>
    </div>
  );
}
