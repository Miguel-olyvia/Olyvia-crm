// A ficha de um serviço na V2: uma página (não um modal) que substitui a lista, com
// "Voltar ao Catálogo". A receita em três listas editáveis na linha (mão de obra,
// equipamentos, consumíveis), o custo por medida calculado, o preço ("Tabela" ou
// "Custo + margem", com um só botão primário) e o histórico de preços (em memória).
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Clock, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CATALOGO } from "../catalogo";
import { eur, nfmt, pct, r2, type Estado, type SvcId } from "../motor";
import {
  HOJE, JUSTIFICACOES, LINHA_NOME, alertasServico, consumiveisDesatualizados, aplicarTodos, custoHoraPerfil, custoReceita, dataPT, equipHora, margemSobrePreco, mediaHora,
  minimoServico, precoReceita, receitaDe, taxaEstrutura, type Custos, type ModoPreco, type ReceitaV2,
} from "./custosModelo";
import { lerCustos, mudarCustos } from "./custosStore";
import { CustoServicoInline } from "./CustoServicoInline";
import { Escolha, ListaAlertas, NumeroCelula, Retirar, TextoCelula } from "./pecasCustos";
import { caminho, consumivelDe, noDoServico, opcoesArvore } from "./catalogoModelo";
import { mudarCatalogo, useCatalogo } from "./catalogoStore";

const UNIDADES = ["un", "kg", "m", "m²", "ml", "l", "kit", "tubo", "saco", "pç"];
const TH = "px-2 py-2 text-left text-[15px] font-medium text-muted-foreground";
const TD = "px-2 py-1.5 align-middle";

export function FichaServicoV2({ S, C, run, sid, voltar, anunciar }: {
  S: Estado; C: Custos; run: (fn: () => void) => void; sid: SvcId; voltar: () => void; anunciar: (msg: string) => void;
}) {
  const titulo = useRef<HTMLHeadingElement>(null);
  const K = useCatalogo();
  useEffect(() => { titulo.current?.focus(); }, [sid]);
  const s = S.svc[sid] ?? null, cat = CATALOGO.find((x) => x.id === sid);
  const rec = receitaDe(C, sid, s, S.cfg.alvo)!;
  const un = s?.un ?? cat?.un ?? "un", nome = s?.n ?? cat?.n ?? sid;
  const c = custoReceita(rec, C, S.cfg.estrutura), preco = precoReceita(rec, c.total), min = minimoServico(C, sid, S.cfg.min);
  const A = alertasServico({ rec, c, preco, un, min, alvo: S.cfg.alvo, mesesDesatualizado: C.par.mesesDesatualizado });

  // O preço é um rascunho até "Guardar o preço" (o único botão primário da página).
  const [modo, setModo] = useState<ModoPreco>(rec.modo);
  const [margem, setMargem] = useState(rec.margem);
  const [tabela, setTabela] = useState(String(r2(rec.modo === "tabela" ? rec.precoTabela : preco)).replace(".", ","));
  const tabelaN = parseFloat(tabela.replace(",", "."));
  const novoPreco = modo === "tabela" ? tabelaN : r2(c.total / (1 - margem / 100));
  const mudou = !isNaN(novoPreco) && novoPreco > 0 && (modo !== rec.modo || r2(novoPreco) !== r2(preco) || (modo === "margem" && margem !== rec.margem));

  /** Muda a receita (guarda-a como editada quando mexe na receita) e passa os custos para os serviços em uso. */
  const editar = (fn: (r: ReceitaV2) => void, msg: string, receita = true) => {
    mudarCustos((cc) => {
      const r = structuredClone(receitaDe(cc, sid, S.svc[sid] ?? null, S.cfg.alvo)!);
      fn(r);
      if (receita) r.origem = "editada";
      cc.receitas[sid] = r;
    });
    run(() => aplicarTodos(S, lerCustos()));
    const r2c = custoReceita(lerCustos().receitas[sid], lerCustos(), S.cfg.estrutura);
    anunciar(`${msg}. Custo por ${un}: ${eur(r2c.total)} €.`);
  };
  const guardarPreco = () => {
    if (!mudou) return;
    const p = r2(novoPreco);
    editar((r) => {
      r.modo = modo; r.margem = margem; r.precoTabela = p;
      r.hist.unshift({ data: HOJE, preco: p, nota: modo === "tabela" ? "Preço de tabela" : `Custo + ${margem}% de margem` });
    }, `Preço guardado: ${eur(p)} €/${un}`, false);
  };
  const nid = (pref: string, L: { id: string }[]) => pref + (Math.max(0, ...L.map((x) => Number(x.id.replace(/\D/g, "")) || 0)) + 1);
  const perfisOp = C.perfis.map((p) => ({ v: p.id, t: p.n }));
  const media = mediaHora(C);
  const velhos = new Set(consumiveisDesatualizados(rec, C.par.mesesDesatualizado).map((x) => x.id));

  return (
    <article aria-labelledby="ficha-t">
      <button type="button" onClick={voltar} className="inline-flex min-h-11 items-center gap-2 rounded-lg pr-3 text-[15px] font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-5 w-5" aria-hidden="true" />Voltar ao Catálogo
      </button>
      <h1 id="ficha-t" ref={titulo} tabIndex={-1} className="mt-2 text-3xl font-semibold tracking-tight outline-none">{nome}</h1>
      <p className="mt-2 text-[16px] text-muted-foreground">
        {cat?.cat ?? s?.perfil} · medida: {un} · {s ? "Em uso" : "Não usado"}
        {cat?.linhas?.length ? ` · ${cat.linhas.map((l) => LINHA_NOME[l]).join(" e ")}` : ""}
        {rec.origem === "estimada" ? " · receita por completar" : rec.origem === "editada" ? " · receita editada" : ""}
      </p>

      <label className="mt-4 flex flex-wrap items-center gap-3">
        <span className="text-[15px] font-medium">Classificação</span>
        <Escolha rotulo="Classificação" w="w-72" v={noDoServico(K, sid, cat?.cat ?? s?.perfil ?? "") ?? ""} opcoes={[{ v: "", t: "Sem classificação" }, ...opcoesArvore(K.arvore)]}
          onSet={(v) => { mudarCatalogo((k) => { if (v) k.classe[sid] = v; else delete k.classe[sid]; }); anunciar(`Classificação: ${caminho(K.arvore, v || null)}`); }} />
      </label>

      {A.length > 0 && <div className="mt-6"><ListaAlertas A={A} /></div>}

      <div className="mt-6"><CustoServicoInline S={S} C={C} sid={sid} s={s} /></div>

      {/* ---------------------------------------------------------- mão de obra */}
      <section aria-labelledby="mo-t" className="mt-10">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="mo-t" className="text-lg font-semibold">Mão de obra</h2>
          <span className="text-[15px] tabular-nums">{eur(c.mo)} €/{un}</span>
        </div>
        <p className="mt-1 text-[15px] text-muted-foreground">Passos e horas por {un}, a multiplicar pelo custo/hora do perfil (de Custos › Perfis).</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead><tr className="border-b border-border"><th scope="col" className={TH}>Passo</th><th scope="col" className={TH}>Perfil</th><th scope="col" className={cn(TH, "text-right")}>Horas por {un}</th><th scope="col" className={cn(TH, "text-right")}>€/h</th><th scope="col" className={cn(TH, "text-right")}>Custo</th><th scope="col" className={TH}><span className="sr-only">Retirar</span></th></tr></thead>
            <tbody>
              {rec.mo.map((p) => {
                const pf = C.perfis.find((x) => x.id === p.perfil), eh = pf ? custoHoraPerfil(pf, C.par) : null;
                return (
                  <tr key={p.id} className="border-b border-border">
                    <td className={TD}><TextoCelula rotulo="Passo" v={p.n} onSet={(v) => editar((r) => { r.mo.find((x) => x.id === p.id)!.n = v; }, "Passo renomeado")} /></td>
                    <td className={TD}><Escolha rotulo={`Perfil de ${p.n}`} v={p.perfil} opcoes={perfisOp} onSet={(v) => editar((r) => { r.mo.find((x) => x.id === p.id)!.perfil = v; }, "Perfil mudado")} /></td>
                    <td className={cn(TD, "text-right")}><NumeroCelula rotulo={`Horas por ${un} de ${p.n}`} v={p.h} onSet={(v) => editar((r) => { r.mo.find((x) => x.id === p.id)!.h = v; }, "Horas mudadas")} /></td>
                    <td className={cn(TD, "text-right text-[15px] tabular-nums text-muted-foreground")}>{eur(eh ?? media)}{eh == null && <span className="block text-[15px]">média</span>}</td>
                    <td className={cn(TD, "text-right text-[15px] tabular-nums")}>{eur(p.h * (eh ?? media))} €</td>
                    <td className={TD}><Retirar rotulo={`Retirar o passo ${p.n}`} onClick={() => editar((r) => { r.mo = r.mo.filter((x) => x.id !== p.id); }, `Passo ${p.n} retirado`)} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Button variant="outline" className="mt-3 min-h-11 text-[15px]" onClick={() => editar((r) => { r.mo.push({ id: nid("p", r.mo), n: "Novo passo", perfil: r.mo[0]?.perfil ?? C.perfis[0].id, h: 0.5 }); }, "Passo juntado")}>
          <Plus className="h-4 w-4" aria-hidden="true" />Juntar passo
        </Button>
      </section>

      {/* ---------------------------------------------------------- equipamentos */}
      <section aria-labelledby="eq-t" className="mt-10">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="eq-t" className="text-lg font-semibold">Equipamentos</h2>
          <span className="text-[15px] tabular-nums">{eur(c.eq)} €/{un}</span>
        </div>
        <p className="mt-1 text-[15px] text-muted-foreground">Horas de uso por {un}, a multiplicar pelo €/h do equipamento (amortização e manutenção, em Custos › Equipamentos).</p>
        {rec.equip.length > 0 ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse">
              <thead><tr className="border-b border-border"><th scope="col" className={TH}>Equipamento</th><th scope="col" className={cn(TH, "text-right")}>Horas por {un}</th><th scope="col" className={cn(TH, "text-right")}>€/h</th><th scope="col" className={cn(TH, "text-right")}>Custo</th><th scope="col" className={TH}><span className="sr-only">Retirar</span></th></tr></thead>
              <tbody>
                {rec.equip.map((u) => {
                  const e = C.equip.find((x) => x.id === u.equip), eh = e ? equipHora(e) : 0;
                  return (
                    <tr key={u.id} className="border-b border-border">
                      <td className={TD}><Escolha rotulo="Equipamento" v={u.equip} opcoes={C.equip.map((x) => ({ v: x.id, t: x.n }))} onSet={(v) => editar((r) => { r.equip.find((x) => x.id === u.id)!.equip = v; }, "Equipamento mudado")} /></td>
                      <td className={cn(TD, "text-right")}><NumeroCelula rotulo={`Horas por ${un} de ${e?.n ?? "equipamento"}`} v={u.h} onSet={(v) => editar((r) => { r.equip.find((x) => x.id === u.id)!.h = v; }, "Horas de uso mudadas")} /></td>
                      <td className={cn(TD, "text-right text-[15px] tabular-nums text-muted-foreground")}>{eur(eh)}</td>
                      <td className={cn(TD, "text-right text-[15px] tabular-nums")}>{eur(eh * u.h)} €</td>
                      <td className={TD}><Retirar rotulo={`Retirar ${e?.n ?? "equipamento"}`} onClick={() => editar((r) => { r.equip = r.equip.filter((x) => x.id !== u.id); }, `${e?.n ?? "Equipamento"} retirado`)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="mt-3 text-[15px] text-muted-foreground">Não usa equipamento próprio, só ferramenta de mão.</p>}
        <Button variant="outline" className="mt-3 min-h-11 text-[15px]" disabled={!C.equip.length}
          onClick={() => editar((r) => { const livre = C.equip.find((e) => !r.equip.some((u) => u.equip === e.id)) ?? C.equip[0]; r.equip.push({ id: nid("e", r.equip), equip: livre.id, h: 0.5 }); }, "Equipamento juntado")}>
          <Plus className="h-4 w-4" aria-hidden="true" />Juntar equipamento
        </Button>
      </section>

      {/* ---------------------------------------------------------- consumíveis */}
      <section aria-labelledby="co-t" className="mt-10">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="co-t" className="text-lg font-semibold">Consumíveis</h2>
          <span className="text-[15px] tabular-nums">{eur(c.cons)} €/{un}</span>
        </div>
        <p className="mt-1 text-[15px] text-muted-foreground">Quantidade por {un} × preço. Mudar o preço põe a data de hoje; ao fim de {C.par.mesesDesatualizado} meses o preço fica desatualizado.</p>
        {rec.cons.length > 0 ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse">
              <thead><tr className="border-b border-border"><th scope="col" className={TH}>Produto</th><th scope="col" className={cn(TH, "text-right")}>Quantidade por {un}</th><th scope="col" className={TH}>Unidade</th><th scope="col" className={cn(TH, "text-right")}>Preço €</th><th scope="col" className={TH}>Preço de</th><th scope="col" className={cn(TH, "text-right")}>Custo</th><th scope="col" className={TH}><span className="sr-only">Retirar</span></th></tr></thead>
              <tbody>
                {rec.cons.map((x) => {
                  const velho = velhos.has(x.id);
                  return (
                    <tr key={x.id} className="border-b border-border">
                      <td className={TD}><TextoCelula rotulo="Produto" v={x.n} onSet={(v) => editar((r) => { r.cons.find((y) => y.id === x.id)!.n = v; }, "Produto renomeado")} />
                        <span className="mt-0.5 block text-[15px] text-muted-foreground">{x.fornecedor}</span></td>
                      <td className={cn(TD, "text-right")}><NumeroCelula rotulo={`Quantidade por ${un} de ${x.n}`} v={x.q} onSet={(v) => editar((r) => { r.cons.find((y) => y.id === x.id)!.q = v; }, "Quantidade mudada")} /></td>
                      <td className={TD}><Escolha rotulo={`Unidade de ${x.n}`} w="w-24" v={x.un} opcoes={UNIDADES.includes(x.un) ? UNIDADES : [x.un, ...UNIDADES]} onSet={(v) => editar((r) => { r.cons.find((y) => y.id === x.id)!.un = v; }, "Unidade mudada")} /></td>
                      <td className={cn(TD, "text-right")}><NumeroCelula rotulo={`Preço de ${x.n}`} v={x.preco} onSet={(v) => editar((r) => { const y = r.cons.find((z) => z.id === x.id)!; y.preco = v; y.data = HOJE; }, "Preço do consumível atualizado")} /></td>
                      <td className={cn(TD, "whitespace-nowrap text-[15px] tabular-nums text-muted-foreground")}>
                        <span className="inline-flex items-center gap-1.5">{velho && <Clock className="h-4 w-4 text-warning" aria-hidden="true" />}{dataPT(x.data)}{velho && <span className="sr-only"> (desatualizado)</span>}</span>
                      </td>
                      <td className={cn(TD, "text-right text-[15px] tabular-nums")}>{eur(x.q * x.preco)} €</td>
                      <td className={TD}><Retirar rotulo={`Retirar ${x.n}`} onClick={() => editar((r) => { r.cons = r.cons.filter((y) => y.id !== x.id); }, `${x.n} retirado`)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="mt-3 text-[15px] text-muted-foreground">Sem consumíveis na receita.</p>}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {/* escolher da lista de Materiais e consumíveis (custo, unidade, fornecedor e data vêm de lá) */}
          <Escolha rotulo="Juntar da lista de materiais" w="w-80" v="" opcoes={[{ v: "", t: "Juntar da lista de materiais…" }, ...K.produtos.filter((p) => !rec.cons.some((x) => x.n === p.n)).map((p) => ({ v: p.id, t: `${p.n} · ${eur(p.custo)} €/${p.un}` }))]}
            onSet={(id) => { const p = K.produtos.find((x) => x.id === id); if (p) editar((r) => { r.cons.push(consumivelDe(p, nid("c", r.cons), 1)); }, `${p.n} juntado`); }} />
          <Button variant="outline" className="min-h-11 text-[15px]" onClick={() => editar((r) => { r.cons.push({ id: nid("c", r.cons), n: "Novo consumível", q: 1, un: "un", preco: 1, fornecedor: "Por escolher", data: HOJE }); }, "Consumível juntado")}>
            <Plus className="h-4 w-4" aria-hidden="true" />Juntar consumível
          </Button>
        </div>
      </section>

      {S.cfg.estrutura && (
        <p className="mt-8 flex justify-between gap-3 border-t border-border pt-4 text-[15px]">
          <span className="text-muted-foreground">Estrutura: {nfmt(c.h)} h × {eur(taxaEstrutura(C))} €/h (Custos › Estrutura)</span>
          <span className="tabular-nums">{eur(c.estr)} €/{un}</span>
        </p>
      )}
      <p className={cn("flex justify-between gap-3 border-t border-border pt-4 text-[16px] font-semibold", S.cfg.estrutura ? "mt-3" : "mt-8")}>
        <span>Custo por {un}</span><span className="tabular-nums">{eur(c.total)} €</span>
      </p>

      {/* ---------------------------------------------------------- preço */}
      <section aria-labelledby="pr-t" className="mt-10">
        <h2 id="pr-t" className="text-lg font-semibold">Preço</h2>
        <fieldset className="mt-3">
          <legend className="text-[15px] text-muted-foreground">Como se chega ao preço</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {([["tabela", "Tabela"], ["margem", "Custo + margem"]] as [ModoPreco, string][]).map(([v, t]) => (
              <label key={v} className={cn("inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-[15px]", modo === v ? "border-foreground" : "border-input")}>
                <input type="radio" name={`modo-${sid}`} value={v} checked={modo === v} onChange={() => { setModo(v); if (v === "tabela") setTabela(String(r2(preco)).replace(".", ",")); }} className="h-4 w-4 accent-[hsl(var(--foreground))]" />{t}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          {modo === "tabela" ? (
            <label className="grid gap-1.5">
              <span className="text-[15px] font-medium">Preço de tabela (€/{un})</span>
              <input type="text" inputMode="decimal" value={tabela} onChange={(e) => setTabela(e.target.value)} className="h-11 w-36 rounded-lg border border-input bg-card px-3 text-right text-[15px] tabular-nums outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25" />
            </label>
          ) : (
            <div>
              <span className="text-[15px] font-medium" id={`mg-${sid}`}>Margem sobre o preço</span>
              <div role="group" aria-labelledby={`mg-${sid}`} className="mt-1.5 inline-flex items-center rounded-lg border border-input bg-card p-0.5">
                <button type="button" aria-label="Menos" className="grid h-11 w-11 place-items-center rounded-lg hover:bg-muted" onClick={() => setMargem((m) => Math.max(0, m - 1))}>−</button>
                <output className="w-16 text-center text-[16px] font-medium tabular-nums">{margem}%</output>
                <button type="button" aria-label="Mais" className="grid h-11 w-11 place-items-center rounded-lg hover:bg-muted" onClick={() => setMargem((m) => Math.min(90, m + 1))}>+</button>
              </div>
            </div>
          )}
          <p className="min-h-11 text-[15px] text-muted-foreground" aria-live="polite">
            {!isNaN(novoPreco) && novoPreco > 0 ? <>Fica {eur(novoPreco)} €/{un} · margem {pct(margemSobrePreco(novoPreco, c.total))}</> : "Escreva um preço."}
          </p>
          <Button size="lg" className="min-h-11 text-[15px]" disabled={!mudou} onClick={guardarPreco}>Guardar o preço</Button>
        </div>

        {(A.some((a) => a.id === "justificacao") || rec.justificacao) && (
          <label className="mt-6 grid max-w-md gap-1.5">
            <span className="text-[15px] font-medium">Porquê abaixo da margem-alvo?</span>
            <Escolha rotulo="Justificação da margem" v={rec.justificacao ?? ""} opcoes={[{ v: "", t: "Escolher…" }, ...JUSTIFICACOES]}
              onSet={(v) => editar((r) => { r.justificacao = v || undefined; }, v ? "Justificação registada" : "Justificação retirada", false)} />
          </label>
        )}

        <h3 className="mt-8 text-base font-semibold">Histórico de preços</h3>
        {rec.hist.length ? (
          <ul className="mt-2 divide-y divide-border border-y border-border">
            {rec.hist.map((h, i) => (
              <li key={i} className="flex min-h-11 items-center justify-between gap-3 py-2 text-[15px]">
                <span><span className="tabular-nums">{dataPT(h.data)}</span><span className="text-muted-foreground"> · {h.nota}</span></span>
                <span className="tabular-nums">{eur(h.preco)} €/{un}</span>
              </li>
            ))}
          </ul>
        ) : <p className="mt-2 text-[15px] text-muted-foreground">Ainda sem preço guardado: o preço sai do custo + {rec.margem}% de margem.</p>}
        <p className="mt-3 text-[15px] text-muted-foreground">O histórico vive só neste browser até recarregar (exemplo).</p>
      </section>
    </article>
  );
}
