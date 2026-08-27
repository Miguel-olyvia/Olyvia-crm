import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { Combobox, ConfirmDialog, cx } from "./ui";
import {
  ChevronLeft,
  ChevronRight,
  LogOut,
  ExternalLink,
  Settings,
  DucMark,
  Bell,
  Help,
  Chart,
  FileText,
  Building,
} from "./icons";

const OLYVIA_URL = (import.meta.env.VITE_OLYVIA_URL as string) || "https://olyvia-ai.com";

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
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  // Rotas de detalhe do DUC já têm barra de ações fixa no fundo — evita colisão
  const isDucDetail = location.pathname.startsWith("/duc/");
  const showFooterNav = !isDucDetail;

  // Itens da footer nav (mobile)
  const navItems = [
    { to: "/", label: "Início", Icon: FileText, active: location.pathname === "/" },
    { to: "/dashboard", label: "Dashboard", Icon: Chart, active: location.pathname === "/dashboard" },
    { to: "/notificacoes", label: "Notif.", Icon: Bell, active: location.pathname === "/notificacoes" },
    { to: "/config", label: "Config", Icon: Settings, active: location.pathname === "/config" },
    { to: "/ajuda", label: "Ajuda", Icon: Help, active: location.pathname === "/ajuda" },
  ];

  return (
    <div className="app-canvas min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/85 backdrop-blur print:hidden">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          {/* Esquerda: seletor de organização (pesquisável) */}
          <div className="flex flex-1 items-center">
            {orgs.length > 0 && (
              <Combobox
                className="w-full max-w-[220px]"
                value={activeOrgId ?? ""}
                onChange={setActiveOrgId}
                placeholder="Organização…"
                searchPlaceholder="Pesquisar organização…"
                icon={<Building width={15} height={15} />}
                options={orgs.map((o) => ({ value: o.id, label: o.name }))}
              />
            )}
          </div>

          {/* Centro: marca — ícone desenhado à mão */}
          <Link
            to="/"
            title="Documento Único de Cliente"
            aria-label="Início"
            className="flex shrink-0 items-center gap-2 text-brand transition-transform hover:scale-105"
          >
            <DucMark />
            <span className="text-lg font-semibold tracking-tight text-slate-800">DUC</span>
          </Link>

          {/* Direita: menu do utilizador (dropdown) */}
          <div ref={menuRef} className="relative flex flex-1 items-center justify-end">
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-2 transition-colors hover:bg-slate-100"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-800 ring-1 ring-inset ring-brand-100">
                {initials(userName, userEmail)}
              </span>
              <span className="hidden text-left leading-tight md:block">
                <span className="block text-sm font-medium text-slate-700">{userName}</span>
                <span className="block text-[11px] text-slate-400">{userEmail}</span>
              </span>
              <ChevronRight
                width={15}
                height={15}
                className={cx(
                  "hidden shrink-0 text-slate-400 transition-transform md:block",
                  menuOpen ? "-rotate-90" : "rotate-90"
                )}
              />
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-full z-40 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-elevated animate-in-pop">
                <div className="mb-1 flex items-center gap-2.5 rounded-lg bg-slate-50 px-2.5 py-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-800 ring-1 ring-inset ring-brand-100">
                    {initials(userName, userEmail)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-700">{userName}</p>
                    <p className="truncate text-[11px] text-slate-400">{userEmail}</p>
                  </div>
                </div>

                {[
                  { to: "/dashboard", label: "Dashboard", Icon: Chart },
                  { to: "/notificacoes", label: "Notificações", Icon: Bell },
                  { to: "/ajuda", label: "Ajuda", Icon: Help },
                  { to: "/config", label: "Configurações", Icon: Settings },
                ].map(({ to, label, Icon }) => {
                  const active = location.pathname === to;
                  return (
                    <Link
                      key={to}
                      to={to}
                      onClick={() => setMenuOpen(false)}
                      className={cx(
                        "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                        active ? "bg-brand-50 text-brand-800" : "text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      <Icon width={16} height={16} /> {label}
                    </Link>
                  );
                })}

                <a
                  href={OLYVIA_URL}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50"
                >
                  <ExternalLink width={16} height={16} /> Olyvia
                </a>

                <div className="my-1 h-px bg-slate-100" />

                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmingLogout(true);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-red-600 transition-colors hover:bg-red-50"
                >
                  <LogOut width={16} height={16} /> Sair
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main
        className={
          "mx-auto max-w-6xl px-4 py-6 " +
          // Espaço extra em baixo (mobile) só quando a footer nav está visível
          (showFooterNav ? "pb-20 md:pb-6" : "")
        }
      >
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

      {/* Bottom nav — apenas mobile; escondida no detalhe do DUC para não colidir */}
      {showFooterNav && (
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur pb-[max(0.4rem,env(safe-area-inset-bottom))] md:hidden print:hidden">
          <div className="mx-auto flex max-w-6xl justify-around">
            {navItems.map(({ to, label, Icon, active }) => (
              <Link
                key={to}
                to={to}
                className={
                  "flex flex-col items-center gap-0.5 px-2 py-1.5 text-[10px] transition-colors " +
                  (active ? "text-brand" : "text-slate-400 hover:text-slate-600")
                }
              >
                <Icon width={20} height={20} />
                {label}
              </Link>
            ))}
          </div>
        </nav>
      )}

      {confirmingLogout && (
        <ConfirmDialog
          title="Terminar sessão"
          confirmLabel={
            <>
              <LogOut width={15} height={15} /> Sair
            </>
          }
          tone="brand"
          icon={<LogOut width={18} height={18} />}
          message={
            <>
              Tens a certeza que queres sair da conta{" "}
              <span className="font-medium text-slate-800">{userName ?? userEmail}</span>?
            </>
          }
          onCancel={() => setConfirmingLogout(false)}
          onConfirm={() => {
            setConfirmingLogout(false);
            void signOut();
          }}
        />
      )}
    </div>
  );
}
