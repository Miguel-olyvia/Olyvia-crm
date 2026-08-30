import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { Combobox, ConfirmDialog, cx } from "./ui";
import { ROTULO_FUNCAO } from "../domain/tipos";
import {
  Building,
  ChevronLeft,
  ChevronRight,
  Euro,
  ExternalLink,
  Home,
  Layers,
  List,
  LogOut,
  OperacaoMark,
} from "./icons";

const OLYVIA_URL = (import.meta.env.VITE_OLYVIA_URL as string) || "https://olyvia-ai.com";

function iniciais(nome: string | null, email: string | null): string {
  const fonte = (nome || email || "?").trim();
  const partes = fonte.split(/\s+/).filter(Boolean);
  if (partes.length >= 2) return (partes[0][0] + partes[1][0]).toUpperCase();
  return fonte.slice(0, 2).toUpperCase();
}

const NAVEGACAO = [
  { to: "/", rotulo: "Hoje", Icone: Home },
  { to: "/ordens", rotulo: "Ordens", Icone: List },
  { to: "/locais", rotulo: "Locais", Icone: Layers },
  { to: "/orcamentos", rotulo: "Orçamentos", Icone: Euro },
];

export function OperacaoLayout() {
  const { userName, userEmail, funcao, orgs, activeOrgId, setActiveOrgId, signOut } = useAuth();
  const location = useLocation();
  const [aConfirmarSaida, setAConfirmarSaida] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuAberto) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuAberto(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuAberto]);

  const ativo = (to: string) =>
    to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);

  return (
    <div className="app-canvas min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/85 backdrop-blur print:hidden">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-3 sm:gap-4 sm:px-4">
          {/* Marca */}
          <Link
            to="/"
            aria-label="Operações"
            className="flex shrink-0 items-center gap-2 text-brand transition-transform hover:scale-105"
          >
            <OperacaoMark />
            <span className="hidden text-lg font-semibold tracking-tight text-slate-800 min-[420px]:inline">
              Operações
            </span>
          </Link>

          {/* Navegação principal — desktop */}
          <nav className="hidden flex-1 items-center gap-1 md:flex">
            {NAVEGACAO.map(({ to, rotulo, Icone }) => (
              <Link
                key={to}
                to={to}
                aria-current={ativo(to) ? "page" : undefined}
                className={cx(
                  "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                  ativo(to)
                    ? "bg-brand-50 font-medium text-brand-800"
                    : "text-slate-600 hover:bg-slate-100"
                )}
              >
                <Icone width={16} height={16} />
                {rotulo}
              </Link>
            ))}
          </nav>

          <div className="flex flex-1 items-center justify-end gap-2 md:flex-none">
            {/* Voltar ao CRM.
                É uma saída da aplicação, não navegação dentro dela — por isso
                é um <a> com carregamento de página a sério, e não um <Link>.
                Fica visível no cabeçalho, e não dentro do menu do utilizador:
                uma porta escondida num dropdown é o mesmo que não existir. */}
            <a
              href={OLYVIA_URL}
              title="Voltar ao CRM Olyvia"
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <ChevronLeft width={15} height={15} className="text-slate-400" />
              <span className="hidden sm:inline">CRM</span>
            </a>

            {/* Organização — só aparece se houver mais do que uma */}
            {orgs.length > 1 && (
              <Combobox
                className="w-full max-w-[150px] sm:max-w-[200px]"
                value={activeOrgId ?? ""}
                onChange={setActiveOrgId}
                placeholder="Organização…"
                searchPlaceholder="Pesquisar organização…"
                icon={<Building width={15} height={15} />}
                options={orgs.map((o) => ({ value: o.id, label: o.name }))}
              />
            )}

            {/* Menu do utilizador */}
            <div ref={menuRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setMenuAberto((o) => !o)}
                className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-1 transition-colors hover:bg-slate-100 sm:pr-2"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-800 ring-1 ring-inset ring-brand-100">
                  {iniciais(userName, userEmail)}
                </span>
                <span className="hidden min-w-0 max-w-[170px] text-left leading-tight lg:block">
                  <span className="block truncate text-sm font-medium text-slate-700">{userName}</span>
                  <span className="block truncate text-[11px] text-slate-400">
                    {funcao ? ROTULO_FUNCAO[funcao] : "—"}
                  </span>
                </span>
                <ChevronRight
                  width={15}
                  height={15}
                  className={cx(
                    "hidden shrink-0 text-slate-400 transition-transform lg:block",
                    menuAberto ? "-rotate-90" : "rotate-90"
                  )}
                />
              </button>

              {menuAberto && (
                <div className="animate-in-pop absolute right-0 top-full z-40 mt-2 w-[min(15rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-elevated">
                  <div className="mb-1 flex items-center gap-2.5 rounded-lg bg-slate-50 px-2.5 py-2">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-800 ring-1 ring-inset ring-brand-100">
                      {iniciais(userName, userEmail)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-700">{userName}</p>
                      <p className="truncate text-[11px] text-slate-400">{userEmail}</p>
                    </div>
                  </div>

                  <a
                    href={OLYVIA_URL}
                    onClick={() => setMenuAberto(false)}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm text-slate-600 transition-colors hover:bg-slate-50 sm:py-2"
                  >
                    <ExternalLink width={16} height={16} /> Voltar à Olyvia
                  </a>

                  <div className="my-1 h-px bg-slate-100" />

                  <button
                    type="button"
                    onClick={() => {
                      setMenuAberto(false);
                      setAConfirmarSaida(true);
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm text-red-600 transition-colors hover:bg-red-50 sm:py-2"
                  >
                    <LogOut width={16} height={16} /> Sair
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 pb-20 md:pb-6">
        <Outlet />
      </main>

      {/* Navegação — mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[max(0.35rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden print:hidden">
        <div className="mx-auto flex max-w-6xl items-stretch justify-around">
          {NAVEGACAO.map(({ to, rotulo, Icone }) => (
            <Link
              key={to}
              to={to}
              aria-current={ativo(to) ? "page" : undefined}
              className={cx(
                "flex min-h-[46px] flex-1 basis-0 flex-col items-center justify-center gap-0.5 px-1 pt-1.5 text-[10px] transition-colors",
                ativo(to) ? "font-semibold text-brand" : "text-slate-400 hover:text-slate-600"
              )}
            >
              <Icone width={20} height={20} />
              <span className="max-w-full truncate">{rotulo}</span>
            </Link>
          ))}
        </div>
      </nav>

      {aConfirmarSaida && (
        <ConfirmDialog
          title="Terminar sessão"
          confirmLabel="Sair"
          message={
            <>
              Queres mesmo sair da conta{" "}
              <span className="font-medium text-slate-800">{userName ?? userEmail}</span>?
            </>
          }
          onCancel={() => setAConfirmarSaida(false)}
          onConfirm={() => {
            setAConfirmarSaida(false);
            void signOut();
          }}
        />
      )}
    </div>
  );
}
