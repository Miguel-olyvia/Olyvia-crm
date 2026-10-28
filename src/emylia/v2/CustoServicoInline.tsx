// O detalhe do custo de um serviço na V2, sem modal: entra na própria página (na ficha
// do serviço). Mostra de onde vem cada cêntimo, com as contas de receitas.ts e dos
// perfis (custosModelo.ts). O CustoServico antigo (modal) fica para a Atual.
import { Lock, TriangleAlert } from "lucide-react";
import { eur, nfmt, pct, type Estado, type Servico, type SvcId } from "../motor";
import { anoPerfil, custoReceita, horaPerfil, margemSobrePreco, minimoServico, origemHora, precoReceita, receitaDe, type Custos } from "./custosModelo";

/** Barras cinzentas (sem cor): a parte de cada custo, do mais escuro ao mais claro. */
const TONS = ["bg-foreground/75", "bg-foreground/50", "bg-foreground/30", "bg-foreground/15"];

export function CustoServicoInline({ S, C, sid, s, q, pu }: { S: Estado; C: Custos; sid: SvcId; s?: Servico | null; q?: number; pu?: number }) {
  const rec = receitaDe(C, sid, s ?? S.svc[sid], S.cfg.alvo);
  if (!rec) return null;
  const c = custoReceita(rec, C, S.cfg.estrutura), preco = pu ?? precoReceita(rec, c.total), m = margemSobrePreco(preco, c.total);
  const min = minimoServico(C, sid, S.cfg.min), un = s?.un ?? S.svc[sid]?.un ?? "un";
  const partes = [
    { n: "Mão de obra", v: c.mo }, { n: "Equipamentos", v: c.eq }, { n: "Consumíveis", v: c.cons },
    ...(S.cfg.estrutura ? [{ n: "Estrutura", v: c.estr }] : []),
  ];
  const direcao = S.role === "direcao";
  const perfis = [...new Set(rec.mo.map((p) => p.perfil))].map((id) => C.perfis.find((p) => p.id === id)).filter((p) => !!p);

  return (
    <section aria-labelledby={`custo-${sid}`} className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <h3 id={`custo-${sid}`} className="text-[17px] font-semibold tracking-tight">Custo por {un}</h3>
      <dl className="mt-3 grid grid-cols-3 gap-3">
        <div><dt className="text-[15px] text-muted-foreground">Custo</dt><dd className="text-xl font-semibold tabular-nums">{eur(c.total)} €</dd></div>
        <div><dt className="text-[15px] text-muted-foreground">Preço</dt><dd className="text-xl font-semibold tabular-nums">{eur(preco)} €</dd></div>
        <div>
          <dt className="text-[15px] text-muted-foreground">Margem</dt>
          <dd className="flex items-center gap-1.5 text-xl font-semibold tabular-nums">
            {m < min / 100 && <TriangleAlert className="h-5 w-5 text-destructive" aria-hidden="true" />}{pct(m)}
            {m < min / 100 && <span className="sr-only"> (abaixo do mínimo)</span>}
          </dd>
          <dd className="text-[15px] text-muted-foreground">mínimo {min}% · alvo {S.cfg.alvo}%</dd>
        </div>
      </dl>
      {c.total > 0 && (
        <>
          <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            {partes.map((p, i) => <span key={p.n} className={TONS[i]} style={{ width: `${(p.v / c.total) * 100}%` }} />)}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[15px] text-muted-foreground">
            {partes.map((p, i) => (
              <li key={p.n} className="inline-flex items-center gap-1.5"><i className={`h-2.5 w-2.5 rounded-full ${TONS[i]}`} aria-hidden="true" />{p.n} {eur(p.v)} € ({pct(p.v / c.total)})</li>
            ))}
          </ul>
        </>
      )}
      {q != null && <p className="mt-3 text-[15px]">Neste orçamento: {nfmt(q)} {un} → custo <b className="tabular-nums">{eur(c.total * q)} €</b>, preço <b className="tabular-nums">{eur(preco * q)} €</b>.</p>}

      {perfis.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-[15px] font-medium">De onde vem o custo/hora</p>
          <ul className="mt-1 space-y-2 text-[15px] text-muted-foreground">
            {perfis.map((p) => {
              const hp = horaPerfil(C, p.id), eh = hp.eh, a = anoPerfil(p, C.par);
              if (eh == null) return <li key={p.id}>{p.n}: sem técnicos no RH nem salário no perfil; a mão de obra conta 0 €.</li>;
              if (hp.fonte === "rh") return <li key={p.id}><span className="text-foreground">{p.n}: {eur(eh)} €/h</span> · {origemHora(hp)}{hp.tecnicos.length ? `: ${hp.tecnicos.map((t) => `${t.n} ${eur(t.custoHora)} €/h`).join(", ")}` : ""}.</li>;
              // 28/10: o salário do cargo técnico do RH (calculado na base)
              if (hp.fonte === "cargo") return <li key={p.id}><span className="text-foreground">{p.n}: {eur(eh)} €/h</span> · {origemHora(hp)}.</li>;
              return (
                <li key={p.id}>
                  <span className="text-foreground">{p.n}: {eur(eh)} €/h</span>
                  {direcao
                    ? <span className="block">{eur(p.salario!)} € × {nfmt(C.par.meses)} meses = {eur(a.base)} €, + TSU {nfmt(C.par.tsu)}% ({eur(a.tsu)} €) + seguros {eur(a.seguros)} €, ÷ {nfmt(a.horas)} h produtivas.</span>
                    : <span className="flex items-center gap-1.5"><Lock className="h-4 w-4 shrink-0" aria-hidden="true" />Custo do ano a dividir pelas horas produtivas. O salário só a Direção vê.</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
