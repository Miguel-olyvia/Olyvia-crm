import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { Combobox, ConfirmDialog, cx } from "./ui";
import { ROTULO_FUNCAO } from "../domain/tipos";
import {
  Ajuda,
  Building,
  ChevronLeft,
  ChevronRight,
  Clock,
  Settings,
  Euro,
  ExternalLink,
  Home,
  Layers,
  List,
  LogOut,
  Menu,
  OperacaoMark,
  X,
} from "./icons";
import { ObraCapacete, ObraCronometro, ObraValidar } from "./ObraIcones";
import { podeValidar } from "../domain/obras";

const OLYVIA_URL = (import.meta.env.VITE_OLYVIA_URL as string) || "https://olyvia-ai.com";
const CHAVE_PAINEL = "operacao.menu-aberto";

function iniciais(nome: string | null, email: string | null): string {
  const fonte = (nome || email || "?").trim();
  const partes = fonte.split(/\s+/).filter(Boolean);
  if (partes.length >= 2) return (partes[0][0] + partes[1][0]).toUpperCase();
  return fonte.slice(0, 2).toUpperCase();
}

type Item = {
  to: string;
  rotulo: string;
  Icone: (p: React.SVGProps<SVGSVGElement>) => JSX.Element;
  // Só aparece para quem passa no teste (a base verifica na mesma).
  so?: (funcao: string | null) => boolean;
};

// O mesmo desenho do CRM: uma barra de ícones escura à esquerda e, ao lado,
// o painel do módulo com os destinos agrupados. Nada desliza na horizontal —
// com dez destinos, uma barra em linha deixava de caber.
export const GRUPOS: { titulo: string | null; itens: Item[] }[] = [
  { titulo: null, itens: [{ to: "/", rotulo: "Hoje", Icone: Home }] },
  {
    titulo: "Execução",
    itens: [
      { to: "/minhas-tarefas", rotulo: "As minhas tarefas", Icone: ObraCronometro },
      { to: "/validar", rotulo: "Validar", Icone: ObraValidar, so: podeValidar },
    ],
  },
  {
    titulo: "Trabalho",
    itens: [
      { to: "/ordens", rotulo: "Ordens", Icone: List },
      { to: "/obras", rotulo: "Obras", Icone: ObraCapacete },
      { to: "/planos", rotulo: "Planos", Icone: Clock },
    ],
  },
  {
    titulo: "Dados",
    itens: [
      { to: "/locais", rotulo: "Locais", Icone: Layers },
      { to: "/orcamentos", rotulo: "Orçamentos", Icone: Euro },
    ],
  },
  {
    titulo: "Sistema",
    itens: [
      { to: "/definicoes", rotulo: "Definições", Icone: Settings },
      { to: "/ajuda", rotulo: "Ajuda", Icone: Ajuda },
    ],
  },
];

function lerPainelAberto(): boolean {
  try {
    return localStorage.getItem(CHAVE_PAINEL) !== "0";
  } catch {
    return true;
  }
}

/** A lista do módulo — a mesma no painel do desktop e na gaveta do telemóvel. */
function NavegacaoModulo({
  funcao,
  ativo,
  onNavegar,
}: {
  funcao: string | null;
  ativo: (to: string) => boolean;
  onNavegar?: () => void;
}) {
  const grupos = GRUPOS.map((g) => ({ ...g, itens: g.itens.filter((i) => !i.so || i.so(funcao)) })).filter(
    (g) => g.itens.length > 0
  );
  return (
    <nav aria-label="Operações" className="flex-1 space-y-1 overflow-y-auto p-3">
      {grupos.map((g) => (
        <div key={g.titulo ?? "topo"} className={g.titulo ? "pt-3" : undefined}>
          {g.titulo && (
            <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">{g.titulo}</p>
          )}
          <div className="space-y-0.5">
            {g.itens.map(({ to, rotulo, Icone }) => (
              <Link
                key={to}
                to={to}
                onClick={onNavegar}
                aria-current={ativo(to) ? "page" : undefined}
                className={cx(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                  ativo(to)
                    ? "border-l-2 border-brand bg-brand-50 font-medium text-brand-800"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                )}
              >
                <Icone width={16} height={16} className="shrink-0" />
                <span className="truncate">{rotulo}</span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function OperacaoLayout() {
  const { userName, userEmail, funcao, orgs, activeOrgId, setActiveOrgId, signOut } = useAuth();
  const location = useLocation();
  const [aConfirmarSaida, setAConfirmarSaida] = useState(false);
  const [menuAberto, setMenuAberto] = useState(false);
  const [painelAberto, setPainelAberto] = useState(lerPainelAberto);
  const [gavetaAberta, setGavetaAberta] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuAberto) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuAberto(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuAberto]);

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_PAINEL, painelAberto ? "1" : "0");
    } catch {
      /* sem armazenamento — fica só nesta visita */
    }
  }, [painelAberto]);

  // A gaveta fecha ao mudar de página e com Esc.
  useEffect(() => setGavetaAberta(false), [location.pathname]);
  useEffect(() => {
    if (!gavetaAberta) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setGavetaAberta(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [gavetaAberta]);

  const ativo = (to: string) =>
    to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);

  const rotuloFuncao = funcao
    ? ROTULO_FUNCAO[funcao] ?? (funcao === ("supervisor" as string) ? "Supervisor" : funcao)
    : "—";

  return (
    <div className="app-canvas min-h-screen">
      {/* Cabeçalho — fixo, a toda a largura, como no CRM */}
      <header className="fixed inset-x-0 top-0 z-30 h-14 border-b border-slate-200/80 bg-white/90 backdrop-blur print:hidden">
        <div className="flex h-full items-center gap-2 px-3 sm:gap-4 sm:px-4">
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

          <div className="flex flex-1 items-center justify-end gap-2">
            {/* Voltar ao CRM — uma saída da aplicação, por isso um <a> com
                carregamento de página a sério, visível e não escondido. */}
            <a
              href={OLYVIA_URL}
              title="Voltar ao CRM Olyvia"
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <ChevronLeft width={15} height={15} className="text-slate-400" />
              <span className="hidden sm:inline">CRM</span>
            </a>

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
                  <span className="block truncate text-[11px] text-slate-400">{rotuloFuncao}</span>
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

      {/* Desktop: barra de ícones + painel do módulo */}
      <aside
        aria-label="Módulos"
        className="fixed bottom-0 left-0 top-14 z-20 hidden w-16 flex-col bg-sidebar text-sidebar-foreground md:flex print:hidden"
      >
        <div className="flex flex-1 flex-col gap-1 p-2">
          <button
            type="button"
            title="Operações"
            aria-label="Operações"
            aria-expanded={painelAberto}
            onClick={() => setPainelAberto((a) => !a)}
            className="flex w-full items-center justify-center rounded-xl bg-brand p-3 text-white shadow-md transition-all duration-200"
          >
            <OperacaoMark width={20} height={20} />
          </button>
        </div>
        <div className="shrink-0 border-t border-sidebar-border p-2">
          <a
            href={OLYVIA_URL}
            title="Voltar ao CRM Olyvia"
            aria-label="Voltar ao CRM Olyvia"
            className="flex w-full items-center justify-center rounded-xl p-3 text-sidebar-foreground/80 transition-all duration-200 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <ChevronLeft width={20} height={20} />
          </a>
        </div>
      </aside>

      {painelAberto && (
        <div className="fixed bottom-0 left-16 top-14 z-20 hidden w-64 flex-col border-r border-slate-200 bg-white shadow-xl md:flex print:hidden">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 p-4">
            <h2 className="text-lg font-semibold text-slate-800">Operações</h2>
            <button
              type="button"
              aria-label="Fechar menu"
              onClick={() => setPainelAberto(false)}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <X width={16} height={16} />
            </button>
          </div>
          <NavegacaoModulo funcao={funcao} ativo={ativo} />
        </div>
      )}

      {/* Telemóvel: botão de menu e gaveta à esquerda, como no CRM */}
      <button
        type="button"
        aria-label="Abrir menu"
        onClick={() => setGavetaAberta(true)}
        className="fixed bottom-4 left-4 z-30 flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-elevated md:hidden print:hidden"
      >
        <Menu width={20} height={20} />
      </button>

      {gavetaAberta && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menu de Operações">
          <div className="animate-in-fade absolute inset-0 bg-slate-900/40" onClick={() => setGavetaAberta(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 p-4">
              <span className="flex items-center gap-2 text-lg font-semibold text-slate-800">
                <span className="text-brand">
                  <OperacaoMark width={20} height={20} />
                </span>
                Operações
              </span>
              <button
                type="button"
                aria-label="Fechar menu"
                onClick={() => setGavetaAberta(false)}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <X width={16} height={16} />
              </button>
            </div>
            <NavegacaoModulo funcao={funcao} ativo={ativo} onNavegar={() => setGavetaAberta(false)} />
            <div className="shrink-0 border-t border-slate-200 p-3">
              <a
                href={OLYVIA_URL}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-100"
              >
                <ChevronLeft width={16} height={16} /> Voltar ao CRM
              </a>
            </div>
          </div>
        </div>
      )}

      {/* O conteúdo afasta-se da barra (64px) e do painel (256px) quando aberto */}
      <main
        className={cx(
          "px-4 pb-20 pt-20 transition-[padding] duration-300 md:pb-6 print:p-0",
          painelAberto ? "md:pl-[21rem]" : "md:pl-20"
        )}
      >
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>

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
