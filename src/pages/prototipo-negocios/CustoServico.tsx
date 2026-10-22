// O detalhe do custo de um serviço: abre ao tocar numa linha do orçamento ou
// no Catálogo. Mostra de onde vem cada cêntimo: técnico, equipamentos
// (amortização), consumíveis e estrutura, e o preço e a margem que ficam.
import { useEffect, useRef, type ReactNode } from "react";
import { Hammer, Lock, Package, UserRound, Building2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { custoUn, estruturaHora, eur, nfmt, pct, type Estado, type Servico } from "./motor";
import { RECEITAS, amortHora, amortUn, consUn } from "./receitas";
import { anoPerfil, custoReceita, custosDe, horaPerfil, origemHora, perfilIdDe, receitaDe, type HoraPerfil } from "./v2/custosModelo";

function Bloco({ icone, cor, titulo, total, children }: { icone: ReactNode; cor: string; titulo: string; total: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <header className="flex items-center gap-3">
        <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", cor)}>{icone}</span>
        <h3 className="flex-1 text-[15px] font-semibold">{titulo}</h3>
        <span className="text-[15px] font-semibold tabular-nums">{total}</span>
      </header>
      <div className="mt-3 space-y-2 text-[15px]">{children}</div>
    </section>
  );
}
const Linha = ({ a, b, sub }: { a: ReactNode; b: ReactNode; sub?: ReactNode }) => (
  <div className="flex items-start justify-between gap-3">
    <span className="min-w-0"><span className="block">{a}</span>{sub && <span className="block text-sm text-muted-foreground">{sub}</span>}</span>
    <span className="shrink-0 tabular-nums text-muted-foreground">{b}</span>
  </div>
);

export function CustoServico({ S, sid, s, q, pu, onClose, children }: { S: Estado; sid: string; s: Servico; q?: number; pu?: number; onClose: () => void; children?: ReactNode }) {
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    caixa.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const R = RECEITAS[sid];
  const mo = s.h * s.eh;
  const eqT = R ? R.equip.reduce((a, e) => a + amortUn(e), 0) : s.eq;
  const coT = R ? R.cons.reduce((a, c) => a + consUn(c), 0) : s.cons;
  const taxa = estruturaHora(S), es = S.cfg.estrutura ? s.h * taxa : 0;
  const c = custoUn(s, S), preco = pu ?? s.preco, m = preco > 0 ? (preco - c) / preco : 0;
  const min = S.cfg.min / 100, alvo = S.cfg.alvo / 100;
  const mc = m < min ? "text-destructive" : m < alvo - 0.005 ? "text-warning" : "text-success";
  const direcao = S.role === "direcao";
  // 22/10: o €/h de cada ofício da receita e de onde vem (a média dos técnicos do RH, ou o salário do perfil sem técnicos)
  const C = custosDe(S), rec = receitaDe(C, sid, s, S.cfg.alvo);
  const oficios: (HoraPerfil & { h: number })[] = rec && rec.mo.length
    ? custoReceita(rec, C, false).oficios.map((o) => ({ ...horaPerfil(C, o.perfil), h: o.h }))
    : [{ ...horaPerfil(C, perfilIdDe(C, s)), h: s.h }];
  const partes = [
    { n: "Técnico", v: mo, cor: "bg-sky-500" }, { n: "Equipamentos", v: eqT, cor: "bg-amber-500" },
    { n: "Consumíveis", v: coT, cor: "bg-emerald-500" }, ...(es ? [{ n: "Estrutura", v: es, cor: "bg-slate-400" }] : []),
  ];

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-foreground/25 animate-in fade-in-0" onClick={onClose}>
      <div ref={caixa} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="custo-t" onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-lg flex-col overflow-y-auto bg-background shadow-2xl outline-none animate-in slide-in-from-right-8 duration-300">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-background/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">Custo do serviço · receita do Catálogo</p>
            <h2 id="custo-t" className="text-xl font-semibold leading-tight">{s.n}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-4 p-5">
          {/* Resumo: custo, preço, margem e a barra das partes */}
          <section className="rounded-2xl bg-primary/[0.06] p-4">
            <div className="grid grid-cols-3 gap-3">
              <div><p className="text-sm text-muted-foreground">Custo</p><p className="text-xl font-semibold tabular-nums">{eur(c)} €</p><p className="text-xs text-muted-foreground">por {s.un}</p></div>
              <div><p className="text-sm text-muted-foreground">Preço</p><p className="text-xl font-semibold tabular-nums">{eur(preco)} €</p><p className="text-xs text-muted-foreground">por {s.un}</p></div>
              <div><p className="text-sm text-muted-foreground">Margem</p><p className={cn("text-xl font-semibold tabular-nums", mc)}>{pct(m)}</p><p className="text-xs text-muted-foreground">alvo {S.cfg.alvo}%</p></div>
            </div>
            <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              {partes.map((p) => <span key={p.n} className={p.cor} style={{ width: `${(p.v / c) * 100}%` }} />)}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {partes.map((p) => <span key={p.n} className="inline-flex items-center gap-1.5"><i className={cn("h-2.5 w-2.5 rounded-full", p.cor)} />{p.n} {pct(p.v / c)}</span>)}
            </div>
            {q != null && <p className="mt-3 text-[15px]">Neste orçamento: {nfmt(q)} {s.un} → custo <b className="tabular-nums">{eur(c * q)} €</b>, preço <b className="tabular-nums">{eur(preco * q)} €</b>.</p>}
          </section>

          {children}

          <Bloco icone={<UserRound className="h-5 w-5 text-sky-700" />} cor="bg-sky-100" titulo="Técnico" total={`${eur(mo)} €`}>
            {oficios.map((o) => (
              <div key={o.perfil} className="space-y-2">
                <Linha a={o.n} b={`${nfmt(o.h)} h × ${o.eh == null ? "—" : eur(o.eh)} €/h`} sub={origemHora(o) + "."} />
                <div className="rounded-xl bg-muted/60 p-3 text-sm">
                  <p className="font-medium">Como se chega aos {o.eh == null ? "—" : eur(o.eh)} €/h</p>
                  {o.fonte === "rh" ? (
                    <div className="mt-1.5 space-y-1 text-muted-foreground">
                      {o.tecnicos.map((t) => <Linha key={t.id} a={t.n} b={`${eur(t.custoHora)} €/h`} sub="Calculado nos Custos do RH (salário, encargos, horas do contrato)" />)}
                      <Linha a={<b className="text-foreground">Média de {o.tecnicos.length} {o.tecnicos.length === 1 ? "técnico" : "técnicos"}</b>} b={<b className="text-foreground">{eur(o.eh!)} €/h</b>} />
                    </div>
                  ) : o.fonte === "salario" ? (
                    direcao ? (() => { const p = C.perfis.find((x) => x.id === o.perfil)!, a = anoPerfil(p, C.par); return (
                      <div className="mt-1.5 space-y-1 text-muted-foreground">
                        <p>Sem técnicos com este ofício no RH: usa o salário do perfil.</p>
                        <Linha a="Salário bruto" b={`${eur(a.base)} €/ano`} sub={`${eur(p.salario ?? 0)} € × ${nfmt(C.par.meses)} meses`} />
                        <Linha a={`TSU da empresa (${nfmt(C.par.tsu)}%)`} b={`${eur(a.tsu)} €`} />
                        <Linha a="Seguros e medicina do trabalho" b={`${eur(a.seguros)} €`} />
                        <Linha a={<b className="text-foreground">Custo por ano ÷ {nfmt(a.horas)} h produtivas</b>} b={<b className="text-foreground">{eur(o.eh!)} €/h</b>} />
                      </div>
                    ); })() : <p className="mt-1 inline-flex items-center gap-1.5 text-muted-foreground"><Lock className="h-3.5 w-3.5" aria-hidden="true" />Sem técnicos com este ofício no RH: usa o salário do perfil, que só a Direção vê.</p>
                  ) : <p className="mt-1 text-destructive">Sem técnicos no RH nem salário no perfil: a mão de obra conta 0 €. Ligue um técnico a este ofício (RH › ficha da pessoa › Obra).</p>}
                </div>
              </div>
            ))}
          </Bloco>

          <Bloco icone={<Hammer className="h-5 w-5 text-amber-700" />} cor="bg-amber-100" titulo="Equipamentos · amortização" total={`${eur(eqT)} €`}>
            {R && R.equip.length ? R.equip.map((e) => (
              <Linha key={e.n} a={e.n} b={`${eur(amortUn(e))} €`}
                sub={`${eur(e.compra)} € ÷ ${nfmt(e.vida)} h de vida = ${eur(amortHora(e))} €/h · usa ${nfmt(e.uso)} h/${s.un}`} />
            )) : <p className="text-muted-foreground">Não usa equipamento próprio, só ferramenta de mão.</p>}
          </Bloco>

          <Bloco icone={<Package className="h-5 w-5 text-emerald-700" />} cor="bg-emerald-100" titulo="Consumíveis" total={`${eur(coT)} €`}>
            {R && R.cons.length ? R.cons.map((x) => (
              <Linha key={x.n} a={x.n} b={`${eur(consUn(x))} €`}
                sub={<>{nfmt(x.q)} {x.un} × {eur(x.preco)} € · {x.fornecedor}{x.data && <span className="text-warning"> · preço de {x.data}</span>}</>} />
            )) : <p className="text-muted-foreground">Sem consumíveis na receita. Falta definir no Catálogo.</p>}
          </Bloco>

          {S.cfg.estrutura && (
            <Bloco icone={<Building2 className="h-5 w-5 text-slate-700" />} cor="bg-slate-200" titulo="Estrutura" total={`${eur(es)} €`}>
              <Linha a="Escritório, viaturas, seguros, gestão" b={`${nfmt(s.h)} h × ${eur(taxa)} €/h`} sub="Os custos de estrutura do mês a dividir pelas horas produtivas da empresa (Catálogo › Custos)." />
            </Bloco>
          )}

          <p className="text-sm text-muted-foreground">Valores de exemplo. O custo/hora de cada ofício é a média dos técnicos dele no RH, a amortização dos equipamentos e o preço dos consumíveis vêm do Catálogo e dos fornecedores.</p>
        </div>
      </div>
    </div>
  );
}
