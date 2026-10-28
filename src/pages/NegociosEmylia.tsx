// Negócios (Emylia, Fase 2.3 e 2.4 da migração): o quadro, a lista e a ficha do negócio da Emylia, desde a lead, ligados à base da
// organização ativa. Ao abrir lê o Catálogo (carregarCatalogo) e os negócios (neg_ler_negocios) e monta-os como a Emylia os usa. Cada ação
// do ecrã corre no motor da Emylia (acoes); depois, o que mudou grava-se negócio a negócio (sincronizarNegocios.ts). Um negócio novo nasce
// pela "Nova lead" do CRM. O Pipeline da equipa do RH continua em /pipeline.
// O papel ("A ver como") escolhe-se no topo até os papéis da Emylia estarem ligados aos utilizadores do CRM.
// 28/10 (Fase 3): o Hoje de cada papel (o do técnico é o HojeTecnico) e as Obras (OperacoesSimples: a lista e a página da obra) abrem
// aqui, com o mesmo Estado: o que se faz na obra grava-se pela obra_guardar_negocio, como o resto. O Inventário ainda não.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { acoes, PAPEIS, seed, type Aviso, type Estado, type Papel, type Vista } from "@/emylia/motor";
import { NegociosSimples } from "@/emylia/NegociosSimples";
import { NegocioSimples } from "@/emylia/NegocioSimples";
import { comTemplatesNosPassos } from "@/components/pessoas/negocioEmylia/templatesDosPassos";
import { HojeSimples } from "@/emylia/HojeSimples";
import { HojeTecnico } from "@/emylia/HojeTecnico";
import { OperacoesSimples } from "@/emylia/OperacoesSimples";
import type { Ctx } from "@/emylia/pecas";
import { carregarCatalogo } from "@/emylia/real/carregarCatalogo";
import { garantirServicosDosNegocios } from "@/emylia/real/negocioReal";
import { idsServico, lerNegocios, negocioDoLido, type IdsServico } from "@/emylia/real/negocioBase";
import { fotografarNegocios, gravarMudancas, type RefNegocio } from "@/emylia/real/sincronizarNegocios";
import "@/emylia/prototipo.css";
import "@/emylia/blocosPagina.css";

interface Toast extends Aviso { id: number }
type Gravacao = { k: "parado" } | { k: "a-gravar" } | { k: "gravado"; n: number } | { k: "erro"; t: string };
const VISTAS = new Set(["negocios", "negocio", "hoje", "operacoes"]);
/** As vistas que se escolhem no topo (a ficha do negócio abre-se a partir da lista). */
const SEPARADORES: [Vista, string][] = [["hoje", "Hoje"], ["negocios", "Negócios"], ["operacoes", "Operações"]];
/** As vistas da Emylia que abrem uma página da Olyvia: as Pessoas do CRM, as encomendas de cliente do Inventário e o Catálogo e custos. */
const PAGINA_REAL: Partial<Record<Vista, string>> = {
  pessoas: "/pessoas", leads: "/pessoas", clientes: "/pessoas", inventario: "/client-orders", catalogo: "/catalogo-custos",
};
/** As mesmas ligações, ao lado dos separadores (como o menu do protótipo). */
const LIGACOES: [string, string][] = [["Pessoas", "/pessoas"], ["Inventário", "/client-orders"], ["Catálogo e custos", "/catalogo-custos"]];

export default function NegociosEmylia() {
  const { activeCompany, isLoading } = useCompany();
  const org = activeCompany?.id ?? null;
  // ?vista=operacoes (o "Operações" do menu) ou ?vista=hoje abre logo essa vista; o resto abre os Negócios
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const vistaPedida = params.get("vista");
  const S = useMemo<Estado>(() => {
    const s = seed(); s.deals = []; s.clientes = []; s.deal = null;
    s.view = vistaPedida === "operacoes" || vistaPedida === "hoje" ? vistaPedida : "negocios";
    return s;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- a vista do endereço só conta ao abrir
  const [, setTique] = useState(0);
  const redesenhar = useCallback(() => setTique((t) => t + 1), []);
  // o menu volta a pedir a vista com a página já aberta (ex.: "Operações" estando nos Negócios)
  useEffect(() => {
    if ((vistaPedida === "operacoes" || vistaPedida === "hoje") && S.view !== vistaPedida) { S.view = vistaPedida; S.deal = null; S.op = null; redesenhar(); }
  }, [vistaPedida, S, redesenhar]);
  const [pronto, setPronto] = useState(false);
  const [erroLer, setErroLer] = useState<string | null>(null);
  const [gravacao, setGravacao] = useState<Gravacao>({ k: "parado" });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const tid = useRef(0);
  const refs = useRef(new Map<number, RefNegocio>());
  // os negócios do CRM (com documentos do CRM): lêem-se, mas nunca se gravam por aqui
  const soLeitura = useRef(new Set<number>());
  const foto = useRef(new Map<number, string>());
  const ids = useRef<IdsServico | null>(null);
  const aGravar = useRef(false);
  const deNovo = useRef(false);
  const [q, setQ] = useState("");

  const avisar = useCallback((a: Aviso) => {
    const mostra = () => {
      const id = ++tid.current;
      setToasts((t) => [...t, { ...a, id }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), a.act ? 8000 : 5200);
    };
    if (a.atraso) setTimeout(mostra, a.atraso); else mostra();
  }, []);

  // grava o que mudou; se mudar outra vez enquanto grava, volta a gravar no fim
  const gravar = useCallback(async () => {
    if (!org || !ids.current) return;
    if (aGravar.current) { deNovo.current = true; return; }
    aGravar.current = true;
    setGravacao({ k: "a-gravar" });
    try {
      do {
        deNovo.current = false;
        const r = await gravarMudancas(supabase, org, S, refs.current, foto.current, ids.current, soLeitura.current);
        if (r.erros.length) { setGravacao({ k: "erro", t: r.erros.join(" · ") }); avisar({ msg: "Não gravou", sub: r.erros[0], kind: "bad" }); }
        else setGravacao({ k: "gravado", n: r.gravados });
        for (const a of r.avisos) avisar({ msg: "Gravado, com um aviso", sub: a, kind: "" });
      } while (deNovo.current);
    } finally {
      aGravar.current = false;
      redesenhar();
    }
  }, [org, S, avisar, redesenhar]);

  const run = useCallback((fn: () => void) => {
    fn();
    // 28/10: as vistas da Emylia que já têm página real na Olyvia abrem-na (o que mudou grava-se na mesma, antes de sair)
    const fora = VISTAS.has(S.view) ? null : PAGINA_REAL[S.view] ?? null;
    if (!VISTAS.has(S.view)) {
      if (!fora) avisar({ msg: "Este ecrã ainda não está ligado", sub: "Fica no negócio.", kind: "" });
      S.view = S.deal ? "negocio" : "negocios";
    }
    redesenhar();
    void gravar();
    if (fora) navigate(fora);
  }, [S, avisar, redesenhar, gravar, navigate]);
  const go = useCallback((fn: () => void) => () => run(fn), [run]);
  const A = useMemo(() => acoes(S, avisar, run), [S, avisar, run]);

  useEffect(() => {
    if (!org) return;
    let vivo = true;
    setPronto(false); setErroLer(null);
    (async () => {
      const cat = await carregarCatalogo(supabase, org, S);
      ids.current = idsServico(cat.M.ids.servico);
      const lidos = await lerNegocios(supabase, org, ids.current);
      if (!vivo) return;
      refs.current = new Map(lidos.map((n) => [n.linhas.negocio.numero, { id: n.id, entityId: n.entityId }]));
      soLeitura.current = new Set(lidos.filter((n) => n.docsCrm).map((n) => n.linhas.negocio.numero));
      S.deals = lidos.map(negocioDoLido);
      // os serviços do Catálogo fora do modelo, que os negócios já usam, entram em S.svc
      garantirServicosDosNegocios(S, S.deals);
      S.seq = Math.max(1000, ...S.deals.map((d) => d.id)) + 1;
      foto.current = fotografarNegocios(S.deals);
      setPronto(true);
    })().catch((e: Error) => { if (vivo) setErroLer(e.message); });
    return () => { vivo = false; };
  }, [org, S]);

  // a letra da Emylia (Lexend)
  useEffect(() => {
    if (document.getElementById("pn-lexend")) return;
    const l = document.createElement("link");
    l.id = "pn-lexend"; l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600&display=swap";
    document.head.appendChild(l);
  }, []);

  const ctx: Ctx = { S, A, run, go, q, setQ };
  const doCrm = S.view === "negocio" && S.deal != null && soLeitura.current.has(S.deal);

  if (isLoading) return <div className="p-6 text-muted-foreground">A carregar…</div>;
  if (!org) return <div className="p-6">Escolha uma organização para ver os negócios.</div>;
  return (
    <div className="pn calma pg-root min-h-full bg-background">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-3 text-[15px]">
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground">A ver como</span>
          <select className="min-h-10 rounded-lg border border-input bg-card px-3" value={S.role}
            onChange={(e) => run(() => { S.role = e.target.value as Papel; })}>
            {(Object.keys(PAPEIS) as Papel[]).map((p) => <option key={p} value={p}>{PAPEIS[p].n}</option>)}
          </select>
        </label>
        <nav aria-label="Vistas" className="flex gap-1">
          {SEPARADORES.map(([v, nome]) => {
            const ativo = S.view === v || (v === "negocios" && S.view === "negocio");
            return (
              <button key={v} type="button" aria-current={ativo ? "page" : undefined} onClick={go(() => A.nav(v))}
                className={"min-h-10 rounded-lg px-3 " + (ativo ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:bg-muted")}>
                {nome}
              </button>
            );
          })}
          {LIGACOES.map(([nome, para]) => (
            <button key={para} type="button" onClick={() => navigate(para)} className="min-h-10 rounded-lg px-3 text-muted-foreground hover:bg-muted">{nome}</button>
          ))}
        </nav>
        <span role="status" aria-live="polite">
          {gravacao.k === "a-gravar" && <span className="text-muted-foreground">A gravar…</span>}
          {gravacao.k === "gravado" && <span className="text-muted-foreground">Gravado</span>}
          {gravacao.k === "erro" && <span className="text-destructive">Não gravou: {gravacao.t}</span>}
        </span>
      </div>
      {erroLer ? <p className="p-6 text-destructive">{erroLer}</p>
        : !pronto ? <p className="p-6 text-muted-foreground">A ler os negócios…</p>
        : S.view === "hoje" ? (S.role === "tecnico" ? <HojeTecnico {...ctx} /> : <HojeSimples {...ctx} />)
        : S.view === "operacoes" ? <OperacoesSimples {...ctx} />
        : S.view === "negocio" && S.deal && S.deals.some((d) => d.id === S.deal) ? <>
            {doCrm && (
              <p role="alert" className="mx-4 mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[15px] text-amber-900">
                Este negócio é do CRM: abra-o em Contratos/Propostas. Aqui fica só para consulta; o que mudar neste ecrã não se grava.
              </p>
            )}
            <NegocioSimples {...ctx} ajustarPassos={(passos, d) => comTemplatesNosPassos(passos, { negocioId: refs.current.get(d.id)?.id ?? null, ctx, d, podeEditar: !doCrm })} />
          </>
        : <NegociosSimples {...ctx} />}
      <div className="toasts" aria-live="polite">
        {toasts.slice(-2).map((t) => (
          <div key={t.id} className={"toast " + (t.kind || "")} role="status">
            <i>{t.kind === "ok" ? "✓" : t.kind === "auto" ? "⚡" : t.kind === "bad" ? "!" : "i"}</i>
            <div>{t.msg}{t.sub ? <small>{t.sub}</small> : null}</div>
            {t.act ? <button onClick={() => { t.act!.fn(); setToasts((x) => x.filter((y) => y.id !== t.id)); }}>{t.act.label}</button> : <span />}
          </div>
        ))}
      </div>
    </div>
  );
}
