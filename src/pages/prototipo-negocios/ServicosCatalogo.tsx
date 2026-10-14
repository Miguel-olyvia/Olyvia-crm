// "Serviços" na etapa Necessidades do cliente (redesenhada a 14/10/2026): mosaicos com ícone e nome curto,
// agrupados por ofício. Os do pacote vêm marcados (as quantidades saem das medidas); toca-se para juntar ou tirar.
// Por omissão, cada ofício mostra os escolhidos e os mais pedidos desta linha; "Ver mais serviços" abre o resto,
// e a pesquisa procura em todos (o Catálogo vai ter ~400 serviços).
import { useId, useState } from "react";
import { Check, Link2, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATALOGO } from "./catalogo";
import { aValidar } from "./CamposFase";
import { eur, nfmt, servicosVisita, type MedKey, type Negocio, type SvcId } from "./motor";
import { obrigacoes } from "./produtosVisita";
import { useCatalogo } from "./v2/catalogoStore";
import { useCustos } from "./v2/custosStore";
import { type Ctx } from "./pecas";
import { ContadorQtd } from "./ContadorQtd";
import { IconeServico, iconeDoOficio } from "./ilustracoes";
import { gruposServicos, medidaDaSugestao, procurarServicos, sugestaoQtd, tilesServicos, type TileServico } from "./necessidades";

const POR_GRUPO = 12;
const POR_PESQUISA = 24;

/** Os serviços que vão para o orçamento, tirados da visita. */
export function orcLinhas(d: Negocio, S: Ctx["S"]): SvcId[] {
  // do pacote, postos à mão e trazidos pelos produtos escolhidos
  return servicosVisita(d).filter((sid) => !!S.svc[sid] || CATALOGO.some((c) => c.id === sid));
}

const MED_TXT: Record<MedKey, string> = { pav: "do pavimento", par: "das paredes", pts: "dos pontos de água", pcs: "das medidas" };

export function ServicosCatalogo({ S, A, run, d, simples }: Ctx & { d: Negocio; simples?: boolean }) {
  const K = useCatalogo(), C = useCustos();
  const v = d.visita, ro = v.fechada;
  const [q, setQ] = useState("");
  const [todos, setTodos] = useState(false);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const [nBusca, setNBusca] = useState(POR_PESQUISA);
  const uid = useId();
  const validar = aValidar(d, "nec");

  // a medida de onde vem a quantidade do serviço (ReceitaV2.medida, quando o Catálogo a tem)
  const medidaDe = (sid: SvcId) => (C.receitas?.[sid] as { medida?: MedKey | null } | undefined)?.medida ?? null;
  const tiles = tilesServicos(S, K, d);
  const obr = Object.fromEntries(obrigacoes(K, servicosVisita(d), v, d.f.materiais_cliente === "Sim").map((o) => [o.sid, o]));
  const nenhum = !tiles.some((t) => t.on);

  const tocar = (t: TileServico) => run(() => {
    if (t.origem === "pacote") return A.servico(d.id, t.sid);
    if ((v.extra[t.sid] || 0) > 0) return A.extra(d.id, t.sid, 0);
    const c = CATALOGO.find((x) => x.id === t.sid) ?? { id: t.sid, n: t.n, un: t.un, qm: 1 };
    A.extra(d.id, t.sid, sugestaoQtd(c, d, medidaDe(t.sid)));
  });

  const mosaico = (t: TileServico) => (
    <Mosaico key={t.sid} t={t} d={d} ro={ro} simples={simples} manual={(v.extra[t.sid] || 0) > 0}
      falta={validar && !!obr[t.sid] && !obr[t.sid].cumprida}
      daMedida={t.origem === "catalogo" ? medidaDaSugestao(t, d, medidaDe(t.sid)) : null}
      onTocar={() => tocar(t)} onQtd={(n) => run(() => A.extra(d.id, t.sid, n))} />
  );

  const grelha = "grid gap-2 min-[520px]:grid-cols-2 xl:grid-cols-3";
  const procura = q.trim() ? procurarServicos(tiles, q) : null;
  const grupos = gruposServicos(ro ? tiles.filter((t) => t.on) : tiles, K.arvore, d.linha, { todos: todos && !ro });
  const escondidos = tiles.length - gruposServicos(tiles, K.arvore, d.linha).reduce((a, g) => a + g.tiles.length, 0);

  return (
    <div className="space-y-6">
      {validar && nenhum && <p className="text-[15px] font-medium text-destructive">Escolha pelo menos um serviço.</p>}

      {!ro && (
        <label className="relative block max-w-xl">
          <span className="sr-only">Procurar serviço</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setNBusca(POR_PESQUISA); }} placeholder="Procurar serviço: nicho, toalheiro, gás…"
            className="h-12 w-full rounded-xl border border-input bg-card pl-10 pr-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25" />
        </label>
      )}

      {procura ? (
        <div>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {procura.length ? `${procura.length} serviço${procura.length === 1 ? "" : "s"}` : "Nenhum serviço com esse nome."}
          </p>
          <ul className={cn(grelha, "mt-2")} aria-label="Resultados da pesquisa">{procura.slice(0, nBusca).map(mosaico)}</ul>
          {procura.length > nBusca && (
            <button type="button" onClick={() => setNBusca((n) => n + POR_PESQUISA)} className="mt-3 min-h-11 text-[15px] font-medium text-primary underline-offset-4 hover:underline">
              Mostrar mais {Math.min(POR_PESQUISA, procura.length - nBusca)}
            </button>
          )}
        </div>
      ) : (
        <>
          {grupos.map((g) => {
            const hid = `${uid}-of-${g.oficio}`.replace(/\s+/g, "-");
            const limite = todos && !abertos[g.oficio] ? POR_GRUPO : Infinity;
            return (
              <section key={g.oficio} aria-labelledby={hid}>
                <h4 id={hid} className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
                  <IconeServico k={iconeDoOficio(g.oficio)} className="h-4 w-4 text-muted-foreground" />{g.oficio}
                </h4>
                <ul className={cn(grelha, "mt-2")}>{g.tiles.slice(0, limite).map(mosaico)}</ul>
                {g.tiles.length > limite && (
                  <button type="button" onClick={() => setAbertos((a) => ({ ...a, [g.oficio]: true }))}
                    className="mt-2 min-h-11 text-[15px] font-medium text-primary underline-offset-4 hover:underline">
                    Ver os {g.tiles.length} de {g.oficio}
                  </button>
                )}
              </section>
            );
          })}
          {ro && !grupos.length && <p className="text-[15px] text-muted-foreground">Nenhum serviço escolhido.</p>}
          {!ro && escondidos > 0 && (
            <button type="button" aria-expanded={todos} onClick={() => { setTodos(!todos); setAbertos({}); }}
              className="inline-flex min-h-11 items-center rounded-xl border border-input bg-card px-4 text-[15px] font-medium text-foreground transition-colors hover:border-foreground/40">
              {todos ? "Ver só os mais pedidos" : `Ver mais serviços (${escondidos})`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** Um serviço: toca-se para juntar ou tirar. O do pacote sem medida não se liga; o que só vem com um produto não se toca. */
function Mosaico({ t, d, ro, simples, manual, falta, daMedida, onTocar, onQtd }: {
  t: TileServico; d: Negocio; ro: boolean; simples?: boolean; manual: boolean; falta: boolean; daMedida: MedKey | null;
  onTocar: () => void; onQtd: (n: number) => void;
}) {
  const so = !!t.de && !manual; // só vem com o produto
  const sub = t.origem === "pacote"
    ? (t.semMedida ? "Pacote · falta a medida" : t.on ? `Pacote · ${nfmt(t.qt)} ${t.un} ${MED_TXT[t.medida ?? "pcs"]}` : "Pacote · não entra")
    : so ? `Vem com ${t.de!.join(", ")}`
      : t.on ? (daMedida && t.qt === d.visita.med[daMedida] ? `${eur(t.preco)} €/${t.un} · ${nfmt(t.qt)} ${t.un} ${MED_TXT[daMedida]}` : `${eur(t.preco)} €/${t.un}`)
        : null;
  const corpo = (
    <>
      <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-lg transition-colors", t.on ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
        <IconeServico k={t.icone} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block font-medium leading-snug text-foreground", simples ? "text-[15px]" : "text-sm")}>{t.curto}</span>
        {sub && <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">{sub}</span>}
        {falta && <span className="mt-0.5 block text-sm font-medium text-destructive">Falta o produto, em Produtos</span>}
      </span>
    </>
  );
  const marca = (
    <span aria-hidden="true" className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full border transition-colors",
      so ? "border-transparent text-primary" : t.on ? "border-primary bg-primary text-primary-foreground" : "border-input text-muted-foreground")}>
      {so ? <Link2 className="h-4 w-4" /> : t.on ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <Plus className="h-3.5 w-3.5" />}
    </span>
  );
  return (
    <li className={cn("flex flex-col rounded-xl border bg-card transition-colors duration-150",
      t.on ? "border-primary/70 bg-primary/[0.04]" : "border-border", falta && "border-destructive")}>
      {ro || so ? (
        <div className="flex min-h-[68px] items-center gap-3 p-3">{corpo}{t.on && marca}</div>
      ) : (
        <button type="button" aria-pressed={t.on} disabled={t.semMedida} onClick={onTocar}
          className="flex min-h-[68px] w-full items-center gap-3 rounded-xl p-3 text-left disabled:cursor-not-allowed">
          {corpo}{marca}
        </button>
      )}
      {!ro && t.on && manual && (
        <div className="flex items-center justify-between gap-3 border-t border-primary/15 px-3 py-2 animate-in fade-in-0 duration-150">
          <ContadorQtd id={`q-${t.sid}-${d.id}`} valor={t.qt} un={t.un} nome={t.curto} onMudar={onQtd} min={t.qt < 1 ? t.qt : 1} />
          <span className="text-[15px] tabular-nums text-foreground">{eur(t.qt * t.preco)} €</span>
        </div>
      )}
    </li>
  );
}
