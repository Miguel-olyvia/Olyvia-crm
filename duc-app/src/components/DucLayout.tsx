import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { Combobox } from "./ui";
import { ChevronLeft, LogOut, ExternalLink, Settings, DucMark } from "./icons";

const OLYVIA_URL = (import.meta.env.VITE_OLYVIA_URL as string) || "https://olyvia.pt";

function initials(name: string | null, email: string | null): string {
  const src = (name || email || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export function DucLayout() {
  const { userName, userEmail, orgs, activeOrgId, setActiveOrgId, signOut } = useAuth();
  const location = useLocation();
  const isDetail = location.pathname !== "/";

  return (
    <div className="app-canvas min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/85 backdrop-blur print:hidden">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          {/* Esquerda: seletor de organização (pesquisável) */}
          <div className="flex flex-1 items-center">
            {orgs.length > 0 && (
              <Combobox
                className="w-full max-w-[210px]"
                value={activeOrgId ?? ""}
                onChange={setActiveOrgId}
                placeholder="Organização…"
                searchPlaceholder="Pesquisar organização…"
                options={orgs.map((o) => ({ value: o.id, label: o.name }))}
              />
            )}
          </div>

          {/* Centro: marca — ícone desenhado à mão */}
          <Link
            to="/"
            title="Documento Único de Cliente"
            aria-label="Início"
            className="shrink-0 text-brand transition-transform hover:-rotate-2 hover:scale-105"
          >
            <DucMark />
          </Link>

          {/* Direita: ações */}
          <div className="flex flex-1 items-center justify-end gap-2.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-800 ring-1 ring-inset ring-brand-100">
                {initials(userName, userEmail)}
              </div>
              <div className="hidden text-right leading-tight md:block">
                <div className="text-sm font-medium text-slate-700">{userName}</div>
                <div className="text-[11px] text-slate-400">{userEmail}</div>
              </div>
            </div>

            <Link
              to="/config"
              title="Configurações do DUC"
              className={
                "inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-slate-100 " +
                (location.pathname === "/config" ? "text-brand" : "text-slate-400 hover:text-slate-700")
              }
            >
              <Settings width={17} height={17} />
            </Link>

            <a
              href={OLYVIA_URL}
              target="_blank"
              rel="noreferrer"
              title="Ir para a Olyvia"
              className="hidden h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-brand sm:inline-flex"
            >
              Olyvia <ExternalLink width={14} height={14} />
            </a>

            <button
              onClick={() => void signOut()}
              title="Sair"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <LogOut width={17} height={17} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {isDetail && (
          <Link
            to="/"
            className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition-colors hover:text-brand print:hidden"
          >
            <ChevronLeft width={16} height={16} /> Todos os DUCs
          </Link>
        )}
        <Outlet />
      </main>
    </div>
  );
}
