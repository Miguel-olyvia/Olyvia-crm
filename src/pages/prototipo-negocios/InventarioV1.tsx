// O Inventário no V1 (19/10/2026). O do Rafael (inventario/) tem 9 ecrãs num submenu, separadores por cima, tabelas de 9 colunas, listas
// que abrem, cartões de números e palavras como FIFO, PO, EC e SKU. Aqui as mesmas áreas, cada uma com um nome claro e um ecrã próprio
// (o menu lateral mostra-as debaixo de "Inventário"; no telemóvel, uma fila no topo da página):
// · Início: o caminho do material (fornecedores → armazém → obras) com os números de cada passo, e o que fazer agora (um só primário);
// · as secções (InventarioV1Listas.tsx): Stock, Obras, Encomendas a fornecedores, Fornecedores, Movimentos e Carrinhas;
// · as fichas (InventarioV1Fichas.tsx): a obra, a encomenda, o material e o fornecedor;
// · os passos guiados (InventarioV1Forms.tsx): contar o armazém, fazer uma encomenda, criar um material ou um fornecedor.
// As regras e as ações são as do Inventário do Rafael, sem mudanças (inventarioV1Acoes.ts); o que mostrar está em inventarioV1Docs.ts.
import { useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowDown, ArrowRight, HardHat, Truck, Warehouse, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { poPorId } from "./inventario/base";
import { tirarPedidoEcInv, useInventario } from "./inventario/loja";
import { armazemInv, encomendasInv, eur, fornecedorInv, materialInv, obrasInv, plural, tarefasInv, valorStock } from "./inventarioV1Docs";
import { EncomendaV1, FornecedorV1, MaterialV1, ObraV1 } from "./InventarioV1Fichas";
import { ContagemV1, NovaEncomendaV1, NovoFornecedorV1, NovoMaterialV1 } from "./InventarioV1Forms";
import { Secao } from "./InventarioV1Listas";
import { abrirSecaoInv, lerNav, mudarNav, useNavInv, type Ficha, type SecInv } from "./inventarioV1Nav";
import { Agora, FILA, FILTRO, Feito, LIGACAO, LINHA, LISTA, SECOES, SETA, fichaDaTarefa, useFeito, type Comum } from "./InventarioV1Pecas";
import type { Ctx } from "./pecas";
import { tirarPedidoObraInv } from "./pedidoInvV1";

export { abrirSecaoInv, esquecerInventarioV1, useNavInv, type SecInv } from "./inventarioV1Nav";
export { SECOES } from "./InventarioV1Pecas";

/** As secções no menu lateral, debaixo de "Inventário" (com o Inventário aberto). */
export function MenuInventarioV1({ aoAbrir }: { aoAbrir: (s: SecInv) => void }) {
  const n = useNavInv();
  return (
    <ul className="ml-[22px] flex flex-col gap-0.5 border-l border-border pl-2" aria-label="Secções do Inventário">
      {SECOES.filter((x) => x.id !== "inicio").map((x) => (
        <li key={x.id}>
          <button type="button" onClick={() => aoAbrir(x.id)} aria-current={n.sec === x.id ? "page" : undefined}
            className={cn("flex min-h-11 w-full items-center rounded-lg px-3 text-left text-[15px] transition-colors", n.sec === x.id ? "bg-primary/10 font-semibold text-primary" : "text-foreground/80 hover:bg-muted hover:text-foreground")}>
            {x.t}
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------------- a página */

export function InventarioV1(ctx: Ctx) {
  const { S } = ctx;
  const db = useInventario();
  // "Abrir no Inventário" no negócio: abre a obra (antes do primeiro desenho, para não piscar o Início)
  const pedido = useRef<number | null | undefined>(undefined);
  if (pedido.current === undefined) {
    pedido.current = tirarPedidoObraInv(); tirarPedidoEcInv();
    if (pedido.current != null && S.deals.some((d) => d.id === pedido.current)) mudarNav({ sec: "obras", ficha: { k: "obra", id: pedido.current } }, false);
  }
  useEffect(() => { if (pedido.current != null) mudarNav({ ...lerNav() }); }, []); // o menu lateral fica a saber
  const n = useNavInv();
  const [msg0, feito] = useFeito();
  // a mensagem do que ficou feito vale no ecrã onde se fez e no seguinte (criar um material e abrir a ficha dele); depois some
  const ondeMsg = useRef<{ msg: string; nav: object | null; passos: number }>({ msg: "", nav: null, passos: 0 });
  if (ondeMsg.current.msg !== msg0) ondeMsg.current = { msg: msg0, nav: n, passos: 0 };
  else if (ondeMsg.current.nav !== n) ondeMsg.current = { ...ondeMsg.current, nav: n, passos: ondeMsg.current.passos + 1 };
  const msg = ondeMsg.current.passos <= 1 ? msg0 : "";
  const origem = useRef<string | null>(null);
  const ir = (x: Ficha, de?: string) => { if (de) origem.current = de; mudarNav({ sec: lerNav().sec, ficha: x }); };
  const voltar = () => {
    mudarNav({ sec: lerNav().sec, ficha: null });
    const id = origem.current;
    setTimeout(() => (id ? document.getElementById(id) : null)?.focus(), 30); // A4: o foco volta à linha que abriu
  };
  // O título ganha o foco quando o ecrã muda (A4)
  const titulo = useRef<HTMLHeadingElement>(null);
  const primeira = useRef(true);
  useEffect(() => {
    if (primeira.current) { primeira.current = false; if (!n.ficha) return; }
    titulo.current?.focus({ preventScroll: true }); document.getElementById("inv-v1-topo")?.scrollIntoView?.({ block: "start" });
  }, [n]);

  const comum: Comum = { ctx, db, ir, voltar, feito, msg, titulo, sec: n.sec };
  const f = n.ficha;
  const corpo = f?.k === "obra" && S.deals.some((d) => d.id === f.id) ? <ObraV1 {...comum} id={f.id} />
    : f?.k === "po" && poPorId(db, f.id) ? <EncomendaV1 {...comum} id={f.id} />
    : f?.k === "material" && materialInv(S, db, f.sku) ? <MaterialV1 {...comum} sku={f.sku} />
    : f?.k === "forn" && fornecedorInv(S, db, f.id) ? <FornecedorV1 {...comum} id={f.id} />
    : f?.k === "contagem" ? <ContagemV1 {...comum} />
    : f?.k === "novaPo" ? <NovaEncomendaV1 {...comum} sup={f.sup} />
    : f?.k === "novoMat" ? <NovoMaterialV1 {...comum} />
    : f?.k === "novoForn" ? <NovoFornecedorV1 {...comum} />
    : n.sec === "inicio" ? <Inicio {...comum} />
    : <Secao {...comum} />;
  // as listas usam a largura (tabelas no computador); o Início e as fichas leem-se melhor mais estreitos
  const largura = !f && n.sec !== "inicio" ? "max-w-6xl" : "max-w-4xl";
  return (
    <div id="inv-v1-topo" className={cn("mx-auto w-full scroll-mt-4 px-4 pb-24 pt-6 sm:px-8 sm:pt-10", largura)}>
      {/* no telemóvel não há menu lateral: as secções numa fila que desliza (L8) */}
      {!f && (
        <nav aria-label="Secções do Inventário" className={cn(FILA, "mb-6 md:hidden")}>
          {SECOES.map((x) => <button key={x.id} type="button" aria-current={n.sec === x.id ? "page" : undefined} onClick={() => abrirSecaoInv(x.id)} className={FILTRO(n.sec === x.id)}>{x.t}</button>)}
        </nav>
      )}
      <div key={n.sec + (f ? JSON.stringify(f) : "")} className="animate-in fade-in-0 duration-200">{corpo}</div>
    </div>
  );
}

/* ---------------------------------------------------------------- o Início */

/** Um passo do caminho do material: o nome, o número que importa, o que pede atenção e a secção que abre. */
function Passo({ Ic, t, num, sub, alerta, abrir }: { Ic: LucideIcon; t: string; num: string; sub: string; alerta?: string; abrir: () => void }) {
  return (
    <li className="min-w-0">
      <button type="button" onClick={abrir} className="group flex h-full w-full flex-col rounded-2xl border border-border bg-card p-4 text-left shadow-[var(--shadow-sm)] transition-shadow hover:shadow-[var(--shadow-md)] sm:p-5">
        <span className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary" aria-hidden="true"><Ic className="h-[18px] w-[18px]" /></span>
          <span className="min-w-0 flex-1 text-base font-semibold group-hover:underline">{t}</span>
          {/* no telemóvel o número fica na linha do título (os três passos cabem sem deslizar) */}
          <span className="text-lg font-semibold tabular-nums sm:hidden">{num}</span>
        </span>
        <span className="mt-3 hidden text-2xl font-semibold tabular-nums sm:block">{num}</span>
        <span className="mt-1 block text-[15px] text-muted-foreground sm:mt-0">{sub}</span>
        {alerta && <span className="mt-2 flex items-start gap-1.5 text-[15px]"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />{alerta}</span>}
      </button>
    </li>
  );
}
const Entre = () => (
  <li className="-my-1 grid place-items-center text-muted-foreground sm:my-0" aria-hidden="true">
    <ArrowDown className="h-4 w-4 sm:hidden" /><ArrowRight className="hidden h-5 w-5 sm:block" />
  </li>
);

function Inicio({ ctx, db, ir, feito, msg, titulo }: Comum) {
  const { S } = ctx;
  const T = tarefasInv(S, db), [primeira, ...resto] = T;
  const [todas, setTodas] = useState(false);
  const G = encomendasInv(S, db), M = armazemInv(S, db), O = obrasInv(S, db).filter((o) => o.estado !== "concluida");
  const baixos = M.filter((m) => m.baixo).length, aSair = O.filter((o) => o.fases.some((f) => f.aSair)).length;
  return (
    <>
      <h1 ref={titulo} tabIndex={-1} className="text-3xl font-semibold tracking-tight outline-none">Inventário</h1>
      <p className="mt-1 text-base text-muted-foreground">O material da empresa: chega dos fornecedores, fica no armazém e sai para as obras.</p>

      <section aria-labelledby="inv-caminho" className="mt-6">
        <h2 id="inv-caminho" className="sr-only">O caminho do material</h2>
        <ol className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-3">
          <Passo Ic={Truck} t="Fornecedores" abrir={() => abrirSecaoInv("encomendas")}
            num={plural(G.aCaminho.length, "encomenda", "encomendas")} sub="a caminho do armazém"
            alerta={G.porAprovar.length ? `${plural(G.porAprovar.length, "encomenda", "encomendas")} por aprovar` : undefined} />
          <Entre />
          <Passo Ic={Warehouse} t="Armazém" abrir={() => abrirSecaoInv("stock")}
            num={plural(M.length, "material", "materiais")} sub={`${eur(valorStock(db))} em stock`}
            alerta={baixos ? `${plural(baixos, "material", "materiais")} abaixo do mínimo` : undefined} />
          <Entre />
          <Passo Ic={HardHat} t="Obras" abrir={() => abrirSecaoInv("obras")}
            num={plural(O.length, "obra", "obras")} sub="a receber material"
            alerta={aSair ? `${plural(aSair, "obra com material", "obras com material")} por levar` : undefined} />
        </ol>
      </section>

      <Feito msg={msg} />
      <Agora S={S} t={primeira} feito={feito} ir={ir} vazio="Nada por fazer. As encomendas a aprovar, o que chega e o material das obras aparecem aqui."
        ver={(t) => t.obra != null && t.acao.k !== "sair" && t.acao.k !== "pedir" ? <p className="mt-1"><button type="button" className={LIGACAO} onClick={() => ir({ k: "obra", id: t.obra! })}>Ver a obra<ArrowRight className="h-4 w-4" aria-hidden="true" /></button></p> : null} />

      {resto.length > 0 && (
        <section aria-labelledby="inv-depois" className="mt-10">
          <h2 id="inv-depois" className="text-lg font-semibold">Depois</h2>
          <ul className={cn("mt-3", LISTA)}>
            {(todas ? resto : resto.slice(0, 4)).map((t) => (
              <li key={t.id}>
                <button id={"t-" + t.id} type="button" onClick={() => ir(fichaDaTarefa(t), "t-" + t.id)} className={LINHA}>
                  {t.urgente ? <AlertCircle className="h-5 w-5 shrink-0 text-destructive" aria-hidden="true" /> : <span className="h-5 w-5 shrink-0" aria-hidden="true" />}
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-medium group-hover:underline">{t.t}{t.urgente && <span className="sr-only"> (urgente)</span>}</span>
                    <span className="block text-[15px] text-muted-foreground">{t.sub}</span>
                  </span>
                  {SETA}
                </button>
              </li>
            ))}
          </ul>
          {resto.length > 4 && <Button variant="outline" className="mt-3 min-h-11" aria-expanded={todas} onClick={() => setTodas(!todas)}>{todas ? "Mostrar menos" : `Mostrar mais ${resto.length - 4}`}</Button>}
        </section>
      )}

      <section aria-labelledby="inv-mais" className="mt-10">
        <h2 id="inv-mais" className="text-lg font-semibold">Também no Inventário</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-3">
          {SECOES.filter((x) => ["fornecedores", "movimentos", "carrinhas"].includes(x.id)).map((x) => (
            <li key={x.id}>
              <button type="button" onClick={() => abrirSecaoInv(x.id)} className="group flex h-full w-full flex-col gap-2 rounded-2xl border border-border bg-card p-4 text-left shadow-[var(--shadow-sm)] transition-shadow hover:shadow-[var(--shadow-md)]">
                <span className="flex items-center gap-2.5"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted text-foreground" aria-hidden="true"><x.Ic className="h-[18px] w-[18px]" /></span><span className="text-base font-semibold group-hover:underline">{x.t}</span></span>
                <span className="text-[15px] text-muted-foreground">{x.sub}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
