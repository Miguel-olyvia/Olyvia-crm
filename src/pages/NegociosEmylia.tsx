// Negócios (Emylia, Fase 2.3 e 2.4 da migração): o quadro, a lista e a ficha do negócio da Emylia, desde a lead, ligados à base da
// organização ativa. Ao abrir lê o Catálogo (carregarCatalogo) e os negócios (neg_ler_negocios) e monta-os como a Emylia os usa. Cada ação
// do ecrã corre no motor da Emylia (acoes); depois, o que mudou grava-se negócio a negócio (sincronizarNegocios.ts). Um negócio novo nasce
// pela "Nova lead" do CRM. O Pipeline da equipa do RH continua em /pipeline.
// O papel ("A ver como") escolhe-se no topo até os papéis da Emylia estarem ligados aos utilizadores do CRM.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { acoes, PAPEIS, seed, type Aviso, type Estado, type Papel } from "@/emylia/motor";
import { NegociosSimples } from "@/emylia/NegociosSimples";
import { NegocioSimples } from "@/emylia/NegocioSimples";
import type { Ctx } from "@/emylia/pecas";
import { carregarCatalogo } from "@/emylia/real/carregarCatalogo";
import { deLinhas } from "@/emylia/real/negocioReal";
import { idsServico, lerNegocios, type IdsServico } from "@/emylia/real/negocioBase";
import { fotografarNegocios, gravarMudancas, type RefNegocio } from "@/emylia/real/sincronizarNegocios";
import "@/emylia/prototipo.css";
import "@/emylia/blocosPagina.css";

interface Toast extends Aviso { id: number }
type Gravacao = { k: "parado" } | { k: "a-gravar" } | { k: "gravado"; n: number } | { k: "erro"; t: string };
const VISTAS = new Set(["negocios", "negocio"]);

export default function NegociosEmylia() {
  const { activeCompany, isLoading } = useCompany();
  const org = activeCompany?.id ?? null;
  const S = useMemo<Estado>(() => { const s = seed(); s.deals = []; s.clientes = []; s.view = "negocios"; s.deal = null; return s; }, []);
  const [, setTique] = useState(0);
  const redesenhar = useCallback(() => setTique((t) => t + 1), []);
  const [pronto, setPronto] = useState(false);
  const [erroLer, setErroLer] = useState<string | null>(null);
  const [gravacao, setGravacao] = useState<Gravacao>({ k: "parado" });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const tid = useRef(0);
  const refs = useRef(new Map<number, RefNegocio>());
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
        const r = await gravarMudancas(supabase, org, S, refs.current, foto.current, ids.current);
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
    if (!VISTAS.has(S.view)) {
      avisar({ msg: "Este ecrã ainda não está ligado", sub: "As Operações, o Inventário e o resto chegam nas próximas fases. Fica no negócio.", kind: "" });
      S.view = S.deal ? "negocio" : "negocios";
    }
    redesenhar();
    void gravar();
  }, [S, avisar, redesenhar, gravar]);
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
      S.deals = lidos.map((n) => deLinhas(n.linhas));
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
        <span role="status" aria-live="polite">
          {gravacao.k === "a-gravar" && <span className="text-muted-foreground">A gravar…</span>}
          {gravacao.k === "gravado" && <span className="text-muted-foreground">Gravado</span>}
          {gravacao.k === "erro" && <span className="text-destructive">Não gravou: {gravacao.t}</span>}
        </span>
      </div>
      {erroLer ? <p className="p-6 text-destructive">{erroLer}</p>
        : !pronto ? <p className="p-6 text-muted-foreground">A ler os negócios…</p>
        : S.view === "negocio" && S.deal && S.deals.some((d) => d.id === S.deal) ? <NegocioSimples {...ctx} />
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
