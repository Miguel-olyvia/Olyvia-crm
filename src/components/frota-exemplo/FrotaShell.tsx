// A moldura dos ecrãs da Frota de exemplo na app real: o contexto (base de exemplo da organização + permissão real), o
// aviso de que os dados são de exemplo (com "Repor dados de exemplo"), a pesquisa da frota, o aviso das ações
// (aria-live), a ficha da viatura (folha lateral), os diálogos e as confirmações. Cada ecrã (/frota/…) é desenhado dentro dela.
//
// Permissões (reais, as existentes): ver = inventory.view (na rota), registar/alterar = inventory.edit. Sem inventory.edit
// os ecrãs são só de consulta: os botões de escrita ficam desativados e dizem porquê. Enquanto as permissões carregam,
// os botões dizem "A carregar permissões…" e não se mostra "Só consulta". Não há seletor "A ver como".
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { FlaskConical, RotateCcw, Search } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";
import { permissionReason, usePermissionGate } from "@/components/frota-exemplo/inventarioUi";
import {
  ContextoFrotaExemplo, PERMISSAO_AGIR_FROTA, useFrotaCtx, type AbaFicha, type AvisoFrota, type CtxFrotaExemplo, type DadosDlg, type PedidoConfirmacao, type TipoDlg,
} from "./contexto";
import { DialogoFrota } from "./DialogosFrota";
import { ViaturaFicha } from "./ViaturaFicha";
import { AvisoRegiao } from "./pecas";
import { OBRAS_EXEMPLO, stockCarrinhaExemplo } from "./dados/exemplo";
import { definirOrganizacaoFrotaExemplo, executarFrotaExemplo, reporFrotaExemplo, useFrotaExemplo } from "./dados/loja";
import { condutor, viaturaDe } from "./dados";

const A_CARREGAR = "A carregar permissões…";
const OPCAO = "flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none";

/**
 * A pesquisa da frota (topo do protótipo): matrícula, modelo ou condutor. Cada resultado abre a viatura. É uma caixa
 * combinada (role=combobox, aria-expanded, aria-controls → listbox); ↓ entra nos resultados, ↑/↓ percorrem, Esc fecha e
 * volta à caixa; fecha também ao clicar fora.
 */
function PesquisaFrota() {
  const { F, abrir } = useFrotaCtx();
  const [q, setQ] = useState("");
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null), campo = useRef<HTMLInputElement>(null);
  const idLista = useId();
  const t = q.trim().toLowerCase();
  const vs = t.length >= 2 ? F.viaturas.filter((v) => (v.mat + " " + v.marca + " " + v.modelo).toLowerCase().replace(/-/g, "").includes(t.replace(/-/g, ""))) : [];
  const ps = t.length >= 2 ? F.pessoas.filter((p) => p.nome.toLowerCase().includes(t) && viaturaDe(F, p.id)) : [];
  const mostrar = aberto && t.length >= 2;

  useEffect(() => {
    if (!mostrar) return;
    const fora = (e: MouseEvent): void => { if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false); };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [mostrar]);

  const escolher = (vid: string): void => { setQ(""); setAberto(false); abrir(vid); };
  const opcoes = (): HTMLElement[] => [...(caixa.current?.querySelectorAll<HTMLElement>("[role=option]") ?? [])];
  const teclaCampo = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Escape") { setAberto(false); return; }
    if (e.key === "ArrowDown" && mostrar) { e.preventDefault(); opcoes()[0]?.focus(); }
  };
  const teclaOpcao = (e: KeyboardEvent<HTMLElement>): void => {
    const l = opcoes(), i = l.indexOf(e.currentTarget);
    if (e.key === "ArrowDown") { e.preventDefault(); l[Math.min(i + 1, l.length - 1)]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (i <= 0) campo.current?.focus(); else l[i - 1]?.focus(); }
    else if (e.key === "Escape") { e.preventDefault(); setAberto(false); campo.current?.focus(); }
  };
  return (
    <div ref={caixa} className="relative w-full max-w-sm" role="search">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <Input ref={campo} type="search" role="combobox" aria-label="Procurar na frota" aria-expanded={mostrar} aria-controls={idLista} aria-autocomplete="list" aria-haspopup="listbox"
        autoComplete="off" placeholder="Procurar matrícula, modelo ou condutor" className="pl-9"
        value={q} onChange={(e) => { setQ(e.target.value); setAberto(true); }} onFocus={() => setAberto(true)} onKeyDown={teclaCampo} />
      <div id={idLista} role="listbox" aria-label="Resultados da pesquisa" hidden={!mostrar}
        className="absolute right-0 top-full z-20 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
        {mostrar ? <>
          {vs.map((v) => (
            <button key={v.id} type="button" role="option" aria-selected="false" className={OPCAO} onClick={() => escolher(v.id)} onKeyDown={teclaOpcao}>
              <span><span className="text-xs text-muted-foreground">Viatura · </span><b>{v.mat}</b></span>
              <span className="text-xs text-muted-foreground">{v.marca} {v.modelo} · {condutor(F, v.id)?.nome ?? "sem condutor"}</span>
            </button>
          ))}
          {ps.map((p) => { const v = viaturaDe(F, p.id)!; return (
            <button key={p.id} type="button" role="option" aria-selected="false" className={OPCAO} onClick={() => escolher(v.id)} onKeyDown={teclaOpcao}>
              <span><span className="text-xs text-muted-foreground">Condutor · </span><b>{p.nome}</b></span>
              <span className="text-xs text-muted-foreground">{p.funcao} · {v.mat}</span>
            </button>
          ); })}
          {!vs.length && !ps.length ? <p className="px-3 py-3 text-sm text-muted-foreground">Nada encontrado para “{q.trim()}”.</p> : null}
        </> : null}
      </div>
    </div>
  );
}

/** O aviso fixo de que a Frota usa dados de exemplo, com o "Repor dados de exemplo". */
function AvisoExemplo() {
  const { repor, confirmar } = useFrotaCtx();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed bg-muted/40 px-4 py-3" data-testid="frota-aviso-exemplo">
      <p className="flex items-start gap-2 text-sm">
        <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span><b>Dados de exemplo.</b> A Frota ainda não tem tabelas na base de dados: o que registares aqui fica só neste navegador e não toca em dados reais.</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <PesquisaFrota />
        <Button type="button" size="sm" variant="outline" className="gap-1.5"
          onClick={() => confirmar({ titulo: "Repor os dados de exemplo", texto: "Apaga tudo o que fizeste na Frota neste navegador e volta aos dados de exemplo de 14/10/2026. Nada mais muda.", ok: "Repor", perigo: true, aoConfirmar: repor })}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" />Repor dados de exemplo
        </Button>
      </div>
    </div>
  );
}

export function FrotaShell({ children }: { children: ReactNode }) {
  // a base de exemplo é por organização: a chave muda antes de ler a base, no mesmo render
  const { activeCompany } = useCompany();
  definirOrganizacaoFrotaExemplo(activeCompany?.id ?? null);
  const F = useFrotaExemplo();
  const gate = usePermissionGate();
  const { loading: aCarregar } = usePermissions();
  const podeAgir = !aCarregar && gate(PERMISSAO_AGIR_FROTA).allowed;
  const semPermissao = aCarregar ? A_CARREGAR : permissionReason([PERMISSAO_AGIR_FROTA]);
  const [params] = useSearchParams();
  // ?viatura=v1 abre a ficha logo ao entrar (ligação direta a uma viatura)
  const [folha, setFolha] = useState<{ vid: string; aba: AbaFicha } | null>(() => {
    const vid = params.get("viatura");
    return vid ? { vid, aba: "resumo" } : null;
  });
  const [dlgAberto, setDlg] = useState<{ tipo: TipoDlg; dados: DadosDlg; n: number } | null>(null);
  const [pedido, setPedido] = useState<PedidoConfirmacao | null>(null);
  const [aviso, setAviso] = useState<AvisoFrota | null>(null);

  const avisar = useCallback((texto: string, erro = false): void => setAviso((a) => ({ texto, erro, n: (a?.n ?? 0) + 1 })), []);
  const agir = useCallback<CtxFrotaExemplo["agir"]>((fn, ok) => {
    if (!podeAgir) {
      avisar(semPermissao, true);
      return { ok: false, valor: undefined as never, erro: semPermissao };
    }
    const r = executarFrotaExemplo(fn);
    if (r.ok) { const t = typeof ok === "function" ? ok(r.valor) : ok; if (t) avisar(t); } else avisar(r.erro, true);
    return r;
  }, [podeAgir, semPermissao, avisar]);
  const stock = useCallback((vid: string) => stockCarrinhaExemplo(F.viaturas.find((v) => v.id === vid)), [F]);
  const repor = useCallback((): void => { reporFrotaExemplo(); setFolha(null); setDlg(null); avisar("Dados de exemplo repostos."); }, [avisar]);

  useEffect(() => { const antes = document.title; document.title = "Olyvia · Frota (exemplo)"; return () => { document.title = antes; }; }, []);

  const ctx = useMemo<CtxFrotaExemplo>(() => ({
    F, podeAgir, semPermissao, stock, obras: OBRAS_EXEMPLO, agir, avisar, aviso,
    abrir: (vid, a) => setFolha({ vid, aba: a ?? "resumo" }), fechar: () => setFolha(null),
    dlg: (tipo, dados) => setDlg((d) => ({ tipo, dados: dados ?? {}, n: (d?.n ?? 0) + 1 })),
    confirmar: setPedido,
    repor,
  }), [F, podeAgir, semPermissao, stock, agir, avisar, aviso, repor]);

  return (
    <ContextoFrotaExemplo.Provider value={ctx}>
      <div className="space-y-5" data-testid="frota-exemplo">
        <AvisoExemplo />
        {!aCarregar && !podeAgir ? <p className="text-sm text-muted-foreground">Só consulta: para registar na Frota é preciso a permissão {PERMISSAO_AGIR_FROTA}.</p> : null}
        <AvisoRegiao testId="aviso-frota" />
        {children}
      </div>
      {folha && <ViaturaFicha key={folha.vid} vid={folha.vid} aba={folha.aba} mudarAba={(a) => setFolha({ ...folha, aba: a })} aoFechar={() => setFolha(null)} />}
      {dlgAberto && <DialogoFrota key={dlgAberto.n} tipo={dlgAberto.tipo} dados={dlgAberto.dados} aoFechar={() => setDlg(null)} aoCriar={(vid) => setFolha({ vid, aba: "resumo" })} />}
      <AlertDialog open={!!pedido} onOpenChange={(a) => { if (!a) setPedido(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pedido?.titulo}</AlertDialogTitle>
            <AlertDialogDescription>{pedido?.texto}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction className={cn(pedido?.perigo && buttonVariants({ variant: "destructive" }))} onClick={() => { const p = pedido; setPedido(null); p?.aoConfirmar(); }}>
              {pedido?.ok}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ContextoFrotaExemplo.Provider>
  );
}
