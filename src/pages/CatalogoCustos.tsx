// Catálogo e custos (Emylia, Fase 1 da migração): o Catálogo da Emylia (CatalogoV1) ligado às tabelas da organização ativa.
// Ao abrir lê da base (cat_ler_catalogo) e monta os objetos que os ecrãs da Emylia usam (real/catalogoReal.ts). O que se muda
// nos ecrãs grava-se sozinho, entidade a entidade, pelas funções cat_* (real/gravarCatalogo.ts), e a página volta a ler da base.
// Substitui os Produtos e os Serviços antigos no menu (as páginas antigas ficam até à limpeza).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { seed, type Estado } from "@/emylia/motor";
import { aplicarTodos } from "@/emylia/v2/custosModelo";
import { catalogo0 } from "@/emylia/v2/catalogoModelo";
import { ligarCustos, lerCustos, useCustos } from "@/emylia/v2/custosStore";
import { lerCatalogo as lerCatalogoStore, porCatalogo, useCatalogo } from "@/emylia/v2/catalogoStore";
import { substituirCatalogoTodo } from "@/emylia/catalogo";
import { usarTecnicos } from "@/emylia/equipa/tecnicos";
import { CatalogoV1 } from "@/emylia/CatalogoV1";
import type { Ctx } from "@/emylia/pecas";
import { montarCatalogo, type CatalogoMontado, type LinhaProduto } from "@/emylia/real/catalogoReal";
import { lerCatalogo } from "@/emylia/real/lerCatalogo";
import { diferencasCatalogo, executarCatalogo, fotografar, type FotoCatalogo, type Rpc } from "@/emylia/real/gravarCatalogo";
import "@/emylia/prototipo.css";
import "@/emylia/blocosPagina.css";

type Gravacao = { k: "parado" } | { k: "a-gravar"; n: number } | { k: "gravado"; n: number } | { k: "erro"; t: string };

const rpc: Rpc = async (fn, args) => {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  return { data, error };
};

interface Base { org: string; M: CatalogoMontado; produtos: LinhaProduto[]; foto: FotoCatalogo }

/** Põe o Catálogo lido nas stores e no Estado da página; devolve o "antes" das comparações. */
function aplicar(org: string, M: CatalogoMontado, produtos: LinhaProduto[], S: Estado): Base {
  substituirCatalogoTodo(M.itens);
  usarTecnicos(M.tecnicos);
  for (const k of Object.keys(S.svc)) if (!M.svc[k]) delete S.svc[k];
  Object.assign(S.svc, M.svc);
  S.cfg.min = M.margens.min;
  S.cfg.alvo = M.margens.alvo;
  const dono = { custos: M.C };
  ligarCustos(dono);
  porCatalogo(M.K);
  aplicarTodos(S, M.C);
  return { org, M, produtos, foto: fotografar({ C: M.C, K: M.K, svc: S.svc, margens: M.margens }) };
}

export default function CatalogoCustos() {
  const { activeCompany, isLoading } = useCompany();
  const org = activeCompany?.id ?? null;
  const S = useMemo<Estado>(() => { const s = seed(); s.deals = []; return s; }, []);
  const [, setTique] = useState(0);
  const [erroLer, setErroLer] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);
  const [gravacao, setGravacao] = useState<Gravacao>({ k: "parado" });
  const base = useRef<Base | null>(null);
  const aGravar = useRef(false);

  const carregar = useCallback(async (o: string) => {
    const L = await lerCatalogo(supabase, o);
    const M = montarCatalogo(L, catalogo0(), seed().svc);
    base.current = aplicar(o, M, L.produtos, S);
    setTique((t) => t + 1);
  }, [S]);

  useEffect(() => {
    if (!org) return;
    let vivo = true;
    setPronto(false); setErroLer(null);
    carregar(org).then(() => { if (vivo) setPronto(true); }).catch((e: Error) => { if (vivo) setErroLer(e.message); });
    return () => { vivo = false; };
  }, [org, carregar]);

  // o que os ecrãs mudam: as stores (useCustos/useCatalogo) e S.svc (pelo run)
  const C = useCustos();
  const K = useCatalogo();
  const [mexido, setMexido] = useState(0);
  const run = useCallback((fn: () => void) => { fn(); setMexido((m) => m + 1); setTique((t) => t + 1); }, []);
  const go = useCallback((fn: () => void) => () => run(fn), [run]);

  useEffect(() => {
    const b = base.current;
    if (!pronto || !b || aGravar.current) return undefined;
    const t = window.setTimeout(async () => {
      const depois = fotografar({ C: lerCustos(), K: lerCatalogoStore(), svc: S.svc, margens: { min: S.cfg.min, alvo: S.cfg.alvo } });
      const chamadas = diferencasCatalogo(b.org, b.foto, depois, { ids: b.M.ids, produtos: b.produtos });
      if (!chamadas.length) return;
      aGravar.current = true;
      setGravacao({ k: "a-gravar", n: chamadas.length });
      const r = await executarCatalogo(chamadas, rpc);
      try { await carregar(b.org); } catch { /* fica o que está; o erro da gravação diz o resto */ }
      aGravar.current = false;
      setGravacao(r.erro ? { k: "erro", t: r.erro } : { k: "gravado", n: r.feitas });
    }, 900);
    return () => window.clearTimeout(t);
  }, [C, K, mexido, pronto, S, carregar]);

  const ctx = { S, A: {} as Ctx["A"], run, go, q: "" } as Ctx;

  if (isLoading || (!org && !erroLer)) return <div className="p-6 text-muted-foreground">A carregar…</div>;
  if (!org) return <div className="p-6">Escolha uma organização para ver o Catálogo e custos.</div>;
  return (
    <div className="pn calma pg-root min-h-full bg-background">
      <div className="flex min-h-10 items-center justify-end gap-2 px-4 pt-2 text-[15px]" role="status" aria-live="polite">
        {gravacao.k === "a-gravar" && <span className="text-muted-foreground">A gravar {gravacao.n === 1 ? "1 mudança" : `${gravacao.n} mudanças`}…</span>}
        {gravacao.k === "gravado" && <span className="text-muted-foreground">Gravado</span>}
        {gravacao.k === "erro" && <span className="text-destructive">Não gravou: {gravacao.t}</span>}
      </div>
      {erroLer ? <p className="p-6 text-destructive">{erroLer}</p>
        : !pronto ? <p className="p-6 text-muted-foreground">A ler o Catálogo…</p>
        : <CatalogoV1 {...ctx} />}
    </div>
  );
}
