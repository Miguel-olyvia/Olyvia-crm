import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { Spinner } from "./ui";
import { OperacaoMark } from "./icons";
import { sairDoEntrarComo, useEntrarComo } from "./EntrarComo";
import { DURACAO_MAX_MS } from "../lib/entrarComo";

/**
 * Barreira de sessão, em três degraus — e cada degrau diz ao utilizador o que
 * fazer a seguir. Um ecrã em branco não é uma resposta.
 *
 *   sem sessão                     → /login
 *   sessão sem perfil anew_users   → não é utilizador da Olyvia
 *   utilizador sem função no módulo→ ninguém lhe deu acesso a Operações
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { loading, session, businessUserId, funcao, perfilCarregado, orgs, activeOrgId } =
    useAuth();
  const verComo = useEntrarComo();

  // "Entrar como" esquecido: volta sozinho à conta do admin ao fim do tempo
  // máximo — também quando o ecrã é um bloqueio (sem a faixa do menu).
  useEffect(() => {
    if (!verComo) return;
    const falta = verComo.desde + DURACAO_MAX_MS - Date.now();
    const id = window.setTimeout(() => void sairDoEntrarComo(), Math.max(0, falta));
    return () => window.clearTimeout(id);
  }, [verComo]);
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="A carregar…" />
      </div>
    );
  }

  // Volta ao mesmo sítio depois do login (ex.: o QR da porta da obra).
  if (!session)
    return <Navigate to="/login" replace state={{ de: location.pathname + location.search }} />;

  if (!businessUserId) {
    return (
      <Bloqueio
        verComo={verComo?.nome ?? null}
        titulo="Conta sem perfil"
        texto="Esta conta não está associada a um utilizador do sistema Olyvia. Contacta o administrador."
      />
    );
  }

  // Enquanto a função não foi lida, ainda não se sabe se há acesso. Mostrar o
  // bloqueio aqui fá-lo-ia piscar antes do ecrã aparecer.
  if (!perfilCarregado) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label="A carregar…" />
      </div>
    );
  }

  if (!funcao) {
    // A função é POR ORGANIZAÇÃO. Quem tem várias pode ter perfil numas e não
    // noutras, e aí o problema resolve-se trocando de organização em vez de
    // pedir acesso a alguém — vale a pena dizê-lo.
    const orgAtiva = orgs.find((o) => o.id === activeOrgId);
    return (
      <Bloqueio
        verComo={verComo?.nome ?? null}
        titulo="Sem acesso a Operações"
        texto={
          orgs.length > 1
            ? `Não tens função atribuída em Operações${
                orgAtiva ? ` na organização "${orgAtiva.name}"` : ""
              }. Experimenta trocar de organização no menu do topo — podes ter acesso noutra. Se não tiveres em nenhuma, um administrador precisa de te adicionar à equipa do módulo.`
            : "A tua conta existe na Olyvia, mas ainda não tem função atribuída em Operações. Um administrador precisa de te adicionar à equipa do módulo."
        }
      />
    );
  }

  return <>{children}</>;
}

function Bloqueio({ titulo, texto, verComo }: { titulo: string; texto: string; verComo?: string | null }) {
  const [aVoltar, setAVoltar] = useState(false);
  return (
    <div className="app-canvas flex min-h-screen items-center justify-center p-6">
      <div className="max-w-md space-y-3 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <OperacaoMark width={26} height={26} />
        </div>
        <h1 className="text-lg font-semibold text-slate-800">{titulo}</h1>
        <p className="text-sm leading-relaxed text-slate-500">{texto}</p>
        {verComo && (
          <div className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            <p>
              Estás a ver a aplicação como <b>{verComo}</b> — é esta pessoa que não tem acesso, não tu.
            </p>
            <button
              type="button"
              disabled={aVoltar}
              onClick={() => {
                setAVoltar(true);
                void sairDoEntrarComo();
              }}
              className="rounded-md bg-amber-950 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-900 disabled:opacity-60"
            >
              {aVoltar ? "A voltar…" : "Voltar à minha conta"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
