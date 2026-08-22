import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { Building, ChevronLeft, FileSolid, LogOut, ExternalLink, Settings } from "./icons";

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
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white shadow-sm">
              <FileSolid width={18} height={18} />
            </span>
            <span className="hidden leading-tight sm:block">
              <span className="block text-sm font-semibold text-slate-800">DUC</span>
              <span className="block text-[11px] text-slate-400">Documento Único de Cliente</span>
            </span>
          </Link>

          <div className="ml-auto flex items-center gap-3">
            {orgs.length > 0 && (
              <div className="hidden items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm sm:flex">
                <Building width={15} height={15} className="text-slate-400" />
                <select
                  value={activeOrgId ?? ""}
                  onChange={(e) => setActiveOrgId(e.target.value)}
                  className="max-w-[180px] cursor-pointer border-0 bg-transparent text-sm text-slate-700 outline-none"
                  title="Organização ativa"
                >
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

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
