// A moldura dos ecrãs da Frota (app real): o contexto (dados da BD da organização ativa + permissões fleet.*), a pesquisa
// da frota, o aviso das ações (aria-live + toast), a ficha da viatura (folha lateral), os diálogos e as confirmações.
// Cada ecrã (/frota/…) é desenhado dentro dela.
//
// Permissões: ver = fleet.view (gestão) ou fleet.self (o condutor vê o seu; o RLS filtra), agir = fleet.manage,
// custos = fleet.costs. Sem a permissão de uma ação o botão fica desativado e diz porquê; a RPC volta a verificar.
// Enquanto as permissões carregam, os botões dizem "A carregar permissões…".
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { permissionReason } from "./inventarioUi";
import {
  ContextoFrota, PERM, PERMS_REQUISITO, useFrotaCtx, type AbaFicha, type AvisoFrota, type CtxFrota, type DadosDlg, type LigacaoAviso, type PedidoConfirmacao,
  type Requisito, type TipoDlg,
} from "./contexto";
import { DialogoFrota } from "./DialogosFrota";
import { ViaturaFicha } from "./ViaturaFicha";
import { AvisoRegiao, Carregando, ErroLeitura } from "./pecas";
import { condutorEm, invalidarFrota, mensagemErroFrota, stockDe, useDadosFrota, viaturaDoCondutor } from "./dados";

const A_CARREGAR = "A carregar permissões…";
const OPCAO = "flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none";

/**
 * A pesquisa da frota: matrícula, modelo ou condutor. Cada resultado abre a viatura. É uma caixa combinada
 * (role=combobox, aria-expanded, aria-controls → listbox); ↓ entra nos resultados, ↑/↓ percorrem, Esc fecha e volta à
 * caixa; fecha também ao clicar fora.
 */
function PesquisaFrota() {
  const { F, abrir } = useFrotaCtx();
  const [q, setQ] = useState("");
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null), campo = useRef<HTMLInputElement>(null);
  const idLista = useId();
  const t = q.trim().toLowerCase();
  const vs = t.length >= 2 ? F.viaturas.filter((v) => (v.plate + " " + v.make + " " + v.model).toLowerCase().replace(/-/g, "").includes(t.replace(/-/g, ""))) : [];
  const ps = t.length >= 2 ? F.condutores.filter((p) => p.full_name.toLowerCase().includes(t) && viaturaDoCondutor(F, p.id)) : [];
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
              <span><span className="text-xs text-muted-foreground">Viatura · </span><b>{v.plate}</b></span>
              <span className="text-xs text-muted-foreground">{v.make} {v.model} · {condutorEm(F, v.id)?.full_name ?? "sem condutor"}</span>
            </button>
          ))}
          {ps.map((p) => { const v = viaturaDoCondutor(F, p.id)!; return (
            <button key={p.id} type="button" role="option" aria-selected="false" className={OPCAO} onClick={() => escolher(v.id)} onKeyDown={teclaOpcao}>
              <span><span className="text-xs text-muted-foreground">Condutor · </span><b>{p.full_name}</b></span>
              <span className="text-xs text-muted-foreground">{p.job_title ?? "Condutor"} · {v.plate}</span>
            </button>
          ); })}
          {!vs.length && !ps.length ? <p className="px-3 py-3 text-sm text-muted-foreground">Nada encontrado para “{q.trim()}”.</p> : null}
        </> : null}
      </div>
    </div>
  );
}

export function FrotaShell({ children }: { children: ReactNode }) {
  const dados = useDadosFrota();
  const { F, org } = dados;
  const qc = useQueryClient();
  const { hasPermission, loading: aCarregar } = usePermissions();
  const tem = useCallback((p: string) => !aCarregar && hasPermission(p), [aCarregar, hasPermission]);
  const pode = useCallback((r: Requisito) => {
    if (aCarregar) return { ok: false, porque: A_CARREGAR };
    const { lista, todas } = PERMS_REQUISITO[r];
    const ok = todas ? lista.every((p) => hasPermission(p)) : lista.some((p) => hasPermission(p));
    return ok ? { ok, porque: "" } : { ok, porque: todas ? `Sem permissão: requer ${lista.join(" e ")}. Peça acesso a um administrador.` : permissionReason(lista) };
  }, [aCarregar, hasPermission]);
  const soConsulta = !aCarregar && ![PERM.gerir, PERM.custos, PERM.self].some((p) => hasPermission(p));

  const [params] = useSearchParams();
  // ?viatura=<id> abre a ficha logo ao entrar (ligação direta a uma viatura, por exemplo a partir de um aviso)
  const [folha, setFolha] = useState<{ vid: string; aba: AbaFicha } | null>(() => {
    const vid = params.get("viatura");
    return vid ? { vid, aba: "resumo" } : null;
  });
  const [dlgAberto, setDlg] = useState<{ tipo: TipoDlg; dados: DadosDlg; n: number } | null>(null);
  const [pedido, setPedido] = useState<PedidoConfirmacao | null>(null);
  const [aviso, setAviso] = useState<AvisoFrota | null>(null);

  // o resultado de cada ação vê-se sempre: na região aria-live da página (e da ficha) e num toast
  const avisar = useCallback((texto: string, erro = false, link?: LigacaoAviso): void => {
    setAviso((a) => ({ texto, erro, link, n: (a?.n ?? 0) + 1 }));
    toast({ title: erro ? "Não foi possível" : "Frota", description: texto, variant: erro ? "destructive" : "default" });
  }, []);
  const agir = useCallback<CtxFrota["agir"]>(async (acao, chamada, msg) => {
    if (!org) { avisar("Escolhe uma organização.", true); return { ok: false, valor: undefined, erro: "Escolhe uma organização." }; }
    let valor;
    try {
      valor = await chamada();
    } catch (e) {
      const erro = mensagemErroFrota(e);
      avisar(erro, true);
      return { ok: false, valor: undefined, erro };
    }
    // a RPC gravou: todos os ecrãs que leem as tabelas mexidas voltam a ler (Hoje, ficha, listas, calendário, menu…)
    await invalidarFrota(qc, org, acao);
    const t = typeof msg.ok === "function" ? msg.ok(valor) : msg.ok;
    avisar(t, false, typeof msg.link === "function" ? msg.link(valor) : msg.link);
    return { ok: true, valor, erro: "" };
  }, [org, qc, avisar]);
  const stock = useCallback((vid: string) => stockDe(F, F.viaturas.find((v) => v.id === vid)), [F]);

  useEffect(() => { const antes = document.title; document.title = "Olyvia · Frota"; return () => { document.title = antes; }; }, []);

  const ctx = useMemo<CtxFrota>(() => ({
    F, dados, pode, tem, stock, agir, avisar, aviso,
    abrir: (vid, a) => setFolha({ vid, aba: a ?? "resumo" }), fechar: () => setFolha(null),
    dlg: (tipo, d) => setDlg((x) => ({ tipo, dados: d ?? {}, n: (x?.n ?? 0) + 1 })),
    confirmar: setPedido,
  }), [F, dados, pode, tem, stock, agir, avisar, aviso]);

  return (
    <ContextoFrota.Provider value={ctx}>
      <div className="space-y-5" data-testid="frota">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <PesquisaFrota />
        </div>
        {soConsulta ? <p className="text-sm text-muted-foreground">Só consulta: para registar na Frota é preciso a permissão {PERM.gerir} (ou {PERM.self} na própria viatura).</p> : null}
        {dados.falhas.length ? <ErroLeitura texto={dados.erro ?? ""} aoTentar={dados.recarregar} /> : null}
        <AvisoRegiao testId="aviso-frota" />
        {dados.carregando ? <Carregando /> : children}
      </div>
      {folha && !dados.carregando && <ViaturaFicha key={folha.vid} vid={folha.vid} aba={folha.aba} mudarAba={(a) => setFolha({ ...folha, aba: a })} aoFechar={() => setFolha(null)} />}
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
    </ContextoFrota.Provider>
  );
}
