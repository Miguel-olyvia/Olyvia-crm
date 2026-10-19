// As fichas do Inventário do V1 (19/10/2026): a obra, a encomenda a fornecedor, o material e o fornecedor.
// Cada ficha tem o "O que fazer agora" dela (um só primário), a informação em blocos e as ações raras como ligações com confirmação no sítio (C23).
import { useState } from "react";
import { AlertCircle, ArrowRight, Hourglass, Mail, Phone, Plus, Search, Star, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { normal } from "./catalogo";
import { ContadorQtd } from "./ContadorQtd";
import { poPorId } from "./inventario/base";
import { ARMAZEM_OBRAS } from "./inventario/ponteNegocios";
import type { Resultado } from "./inventario/loja";
import {
  MOTIVOS, MOTIVOS_RESTO_V1, anularOResto, corrigir, decidirPrecoNovo, desfazerSaida, devolver, entradaAvulsa, juntarArtigo, levarParaCarrinha, mudarMinimo, recusar,
  simularConfirmacao, type MotivoCorrecao,
} from "./inventarioV1Acoes";
import {
  carrinhasInv, dia, eur, fornecedorInv, materialInv, movimentosInv, obraInv, plural, poInv, porUn, qtd, tarefasInv, textoHistorico,
} from "./inventarioV1Docs";
import { Livro } from "./InventarioV1Listas";
import {
  Agora, BLOCO, CAMPO, Campo, Confirmar, Erro, Escolhas, EstadoMaterial, Feito, Iniciais, LIGACAO, LIGACAO_RARA, LINHA, LISTA, SETA, TABELA, TD, TH, Voltar, ligar, nomeSec, type Comum,
} from "./InventarioV1Pecas";

const numero = (s: string): number | null => { const n = parseFloat(s.replace(",", ".")); return Number.isNaN(n) ? null : n; };
const H1 = "mt-2 text-3xl font-semibold tracking-tight outline-none";

/* ---------------------------------------------------------------- a obra */

export function ObraV1({ ctx, db, ir, voltar, feito, msg, titulo, sec, id }: Comum & { id: number }) {
  const { S, A, go } = ctx;
  const d = S.deals.find((x) => x.id === id)!;
  const o = obraInv(db, d);
  const T = tarefasInv(S, db).filter((t) => t.obra === id);
  const [desfazer, setDesfazer] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const correr = (r: Resultado<string>) => { if (r.ok) { setErro(""); setDesfazer(null); feito(r.valor); } else setErro(r.erro); };
  return (
    <>
      <Voltar onClick={voltar}>{nomeSec(sec)}</Voltar>
      <div className="mt-2 flex items-start gap-4">
        <Iniciais nome={o.nome} className="mt-1 h-12 w-12" />
        <div className="min-w-0 flex-1">
          <h1 ref={titulo} tabIndex={-1} className="text-3xl font-semibold tracking-tight outline-none">Obra de {o.nome}</h1>
          <p className="mt-1 text-base text-muted-foreground">{o.sub} · {o.quando}{o.ec ? ` · encomenda de cliente ${o.ec}` : ""}</p>
          <p><button type="button" className={LIGACAO} onClick={go(() => A.abrir(id))}>Abrir o negócio<ArrowRight className="h-4 w-4" aria-hidden="true" /></button></p>
        </div>
      </div>
      <Feito msg={msg} />
      {o.estado === "pagamento" ? (
        <section aria-label="O que falta" className={cn("mt-6 p-5", BLOCO)}>
          <p className="flex items-start gap-2 text-lg"><Hourglass className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />À espera do pagamento.</p>
          <p className="mt-1 text-[15px] text-muted-foreground">Quando o Financeiro validar o pagamento, a encomenda de cliente chega aqui: o que há no armazém fica guardado para esta obra e o que falta vai numa encomenda ao fornecedor, por aprovar. Não há nada a fazer no Inventário até lá.</p>
        </section>
      ) : (
        <Agora S={S} t={T[0]} feito={feito} ir={ir} vazio={o.estado === "concluida" ? "A obra acabou. Todo o material saiu." : "Nada por fazer nesta obra agora."} />
      )}
      {o.tot.materiais > 0 && (
        <dl className={cn("mt-8 grid grid-cols-2 sm:grid-cols-4", BLOCO)}>
          {([["Materiais", o.tot.materiais], ["Prontos no armazém", o.tot.prontos], ["A chegar", o.tot.aChegar], ["Já na obra", o.tot.naObra]] as [string, number][]).map(([t, v], i) => (
            <div key={t} className={cn("p-4 sm:p-5", i % 2 === 1 && "border-l border-border", i >= 2 && "border-t border-border sm:border-t-0", i === 2 && "sm:border-l")}>
              <dt className="text-[15px] text-muted-foreground">{t}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {erro && <div className="mt-4"><Erro>{erro}</Erro></div>}
      {o.fases.map((f) => (
        <section key={f.fase} aria-labelledby={"fase-" + f.fase} className="mt-10">
          <h2 id={"fase-" + f.fase} className="text-lg font-semibold">Fase {f.fase} · {f.nome}</h2>
          <p className="text-[15px] text-muted-foreground">{f.quando ? `Começa ${f.quando}` : o.estado === "em curso" ? "Obra em curso" : o.estado === "concluida" ? "Obra acabada" : "Quando a obra arrancar"}{f.aSair ? ` · ${plural(f.aSair, "material pronto", "materiais prontos")} a sair` : ""}</p>
          <ul className={cn("mt-3", LISTA)}>
            {f.itens.map((m) => (
              <li key={m.n}>
                <div className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-1 py-3 sm:px-2">
                  <span className="min-w-0 flex-1">
                    {m.sku ? <button type="button" onClick={() => ir({ k: "material", sku: m.sku! })} className="text-left text-base font-medium underline-offset-4 hover:underline">{m.n}</button> : <span className="block text-base font-medium">{m.n}</span>}
                    <span className="block text-[15px] tabular-nums text-muted-foreground">{qtd(m.q, m.un)}{m.forn ? ` · ${m.forn}` : ""}</span>
                  </span>
                  <span className="basis-full sm:basis-auto"><EstadoMaterial m={m} /></span>
                  {m.estado === "na obra" && m.linhaEc && o.ec && o.estado !== "concluida" && (
                    <button type="button" className={cn(LIGACAO_RARA, "basis-full sm:basis-auto")} aria-expanded={desfazer === m.linhaEc} onClick={() => setDesfazer(desfazer === m.linhaEc ? null : m.linhaEc!)}>Voltou ao armazém?</button>
                  )}
                </div>
                {desfazer === m.linhaEc && o.ec && (
                  <div className="pb-4">
                    <Confirmar texto={`Desfazer a saída de ${m.n.toLowerCase()}? Volta ao armazém, guardado para esta obra, e fica no livro de movimentos.`} sim="Desfazer a saída" perigo={false}
                      aoNao={() => setDesfazer(null)} aoSim={() => correr(desfazerSaida(o.ec!, m.linhaEc!))} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {o.estado !== "pagamento" && !o.fases.length && <p className="mt-8 text-[15px] text-muted-foreground">Esta obra não leva materiais do armazém.</p>}
    </>
  );
}

/* ---------------------------------------------------------------- a encomenda a fornecedor */

const MOTIVOS_RECUSA = ["Já não é preciso", "Vou pedir a outro fornecedor", "O preço está alto"];

export function EncomendaV1({ ctx, db, ir, voltar, feito, msg, titulo, sec, id }: Comum & { id: string }) {
  const { S } = ctx;
  const p = poInv(S, db, poPorId(db, id)!), raw = poPorId(db, id)!;
  const T = tarefasInv(S, db).filter((t) => (t.acao.k === "aprovar" || t.acao.k === "receber") && t.acao.po === id);
  const passos: [string, boolean][] = [
    ["Aprovada", p.estado !== "por aprovar"],
    [p.portal ? "No portal do fornecedor" : "Enviada por email", p.estado !== "por aprovar"],
    ["Data confirmada", !!p.prometida],
    ["Recebida", p.estado === "recebida"],
  ];
  const atual = passos.findIndex(([, ok]) => !ok);
  const [erro, setErro] = useState("");
  const [rara, setRara] = useState<"recusar" | "resto" | null>(null);
  const [motivo, setMotivo] = useState("");
  const correr = (r: Resultado<string>) => { if (r.ok) { setErro(""); setRara(null); setMotivo(""); feito(r.valor); } else setErro(r.erro); };
  const aberta = ["no fornecedor", "confirmada", "chegou em parte"].includes(p.estado);
  return (
    <>
      <Voltar onClick={voltar}>{nomeSec(sec)}</Voltar>
      <h1 ref={titulo} tabIndex={-1} className={H1}>Encomenda a {p.forn}</h1>
      <p className="mt-1 text-base text-muted-foreground">{p.id} · {p.deal ? <button type="button" className="font-medium text-foreground underline-offset-4 hover:underline" onClick={() => ir({ k: "obra", id: p.deal! })}>{p.para}</button> : p.para} · {p.resumo}</p>
      <ol aria-label="Percurso da encomenda" className="mt-6 grid grid-cols-4 gap-1.5">
        {passos.map(([t, ok], i) => (
          <li key={t} aria-current={i === atual ? "step" : undefined}>
            <span className={cn("block h-2 rounded-full", ok ? "bg-primary" : i === atual ? "bg-primary/50" : "bg-muted")} />
            <span className={cn("mt-1.5 hidden text-sm sm:block", i === atual ? "font-medium text-foreground" : "text-muted-foreground")}>{t}<span className="sr-only">{ok ? " (feito)" : i === atual ? " (agora)" : " (ainda não)"}</span></span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[15px] sm:hidden">{atual < 0 ? "Recebida." : `Passo ${atual + 1} de 4: ${passos[atual][0]}`}</p>
      <Feito msg={msg} />
      <Agora S={S} t={T[0]} feito={feito} ir={ir} primario={!rara} vazio={p.estado === "recebida" ? "Recebida. Nada mais a fazer." : p.estado === "cancelada" ? "Cancelada." : "Nada por fazer."} />
      {T.length > 0 && <p className="mt-3 text-[15px] text-muted-foreground">{p.frase}</p>}
      {p.estado === "no fornecedor" && p.portal && (
        <p className="mt-1 text-[15px] text-muted-foreground">
          Protótipo:{" "}
          <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={() => correr(simularConfirmacao(id))}>simular a resposta do fornecedor</button>.
        </p>
      )}
      {/* as ações raras: ligações cinzentas, com a confirmação no sítio */}
      <div className="mt-2 flex flex-wrap gap-x-6">
        {p.estado === "por aprovar" && <button type="button" className={LIGACAO_RARA} aria-expanded={rara === "recusar"} onClick={() => { setRara(rara === "recusar" ? null : "recusar"); setMotivo(""); }}>Não aprovar esta encomenda</button>}
        {aberta && <button type="button" className={LIGACAO_RARA} aria-expanded={rara === "resto"} onClick={() => { setRara(rara === "resto" ? null : "resto"); setMotivo(""); }}>O fornecedor não vai entregar {p.estado === "chegou em parte" ? "o resto" : "esta encomenda"}</button>}
      </div>
      {rara && (
        <Confirmar
          texto={rara === "recusar"
            ? `Não aprovar a encomenda a ${p.forn}? Não segue para o fornecedor e fica no histórico.${p.deal ? " O material volta a faltar na obra e pede-se de novo lá." : ""}`
            : `Fechar a encomenda sem o que falta? Deixa de se esperar por esse material.${p.deal ? " Se era de uma obra, volta a faltar lá e pede-se de novo." : ""}`}
          sim={rara === "recusar" ? "Não aprovar" : "Fechar sem o resto"} aoNao={() => setRara(null)}
          aoSim={() => { if (!motivo) { setErro("Escolha o motivo."); return; } correr(rara === "recusar" ? recusar(id, motivo) : anularOResto(id, motivo)); }}>
          <Escolhas rotulo="Porquê" valor={motivo} mudar={(v) => { setMotivo(v); setErro(""); }} erro={erro && !motivo ? "Escolha o motivo." : undefined}
            opcoes={(rara === "recusar" ? MOTIVOS_RECUSA : MOTIVOS_RESTO_V1).map((m) => ({ v: m, t: m === "Encontrei stock/outra solução" ? "Arranjei de outra forma" : m === "Fornecedor sem produto" ? "O fornecedor não tem" : m }))} />
        </Confirmar>
      )}
      {erro && !(rara && !motivo) && <div className="mt-2"><Erro>{erro}</Erro></div>}

      <section aria-labelledby="po-linhas" className="mt-10">
        <h2 id="po-linhas" className="text-lg font-semibold">O que se pediu</h2>
        <div className={cn("mt-3", TABELA)}>
          <table className="w-full text-[15px]">
            <thead><tr><th className={TH}>Material</th><th className={cn(TH, "text-right")}>Pedido</th><th className={cn(TH, "text-right")}>Chegou</th><th className={cn(TH, "text-right")}>Falta</th></tr></thead>
            <tbody>
              {p.linhas.map((l) => (
                <tr key={l.id} className="border-t border-border">
                  <td className={TD}><button type="button" onClick={() => ir({ k: "material", sku: l.sku })} className="text-left font-medium underline-offset-4 hover:underline">{l.n}</button></td>
                  <td className={cn(TD, "text-right tabular-nums")}>{qtd(l.pedido, l.un)}</td>
                  <td className={cn(TD, "text-right tabular-nums")}>{l.recebido ? qtd(l.recebido, l.un) : "—"}</td>
                  <td className={cn(TD, "text-right tabular-nums", !l.falta && "text-muted-foreground")}>{l.falta ? qtd(l.falta, l.un) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className={cn("mt-3 lg:hidden", LISTA)}>
          {p.linhas.map((l) => (
            <li key={l.id}>
              <button type="button" onClick={() => ir({ k: "material", sku: l.sku })} className={LINHA}>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-medium group-hover:underline">{l.n}</span>
                  <span className="block text-[15px] tabular-nums text-muted-foreground">pedido {qtd(l.pedido, l.un)}{l.recebido ? ` · chegou ${qtd(l.recebido, l.un)}` : ""}{l.falta && l.recebido ? ` · faltam ${qtd(l.falta, l.un)}` : ""}</span>
                </span>
                {SETA}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="po-hist" className="mt-10">
        <h2 id="po-hist" className="text-lg font-semibold">Histórico</h2>
        <ol className={cn("mt-3", LISTA)}>
          {[...raw.log].reverse().map((h, i) => (
            <li key={i} className="flex min-h-14 flex-wrap items-baseline gap-x-3 py-3 sm:px-2">
              <span className="min-w-0 flex-1 text-[15px]">{textoHistorico(db, h.t)}</span>
              <span className="shrink-0 text-[15px] tabular-nums text-muted-foreground">{dia(h.at)}</span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

/* ---------------------------------------------------------------- o material */

type Registo = "entrada" | "devolver" | "carrinha" | "corrigir" | "minimo";
const REGISTOS: { v: Registo; t: string }[] = [
  { v: "entrada", t: "Entrou sem encomenda" }, { v: "corrigir", t: "Corrigir a quantidade" }, { v: "carrinha", t: "Levar para uma carrinha" },
  { v: "devolver", t: "Devolver ao fornecedor" }, { v: "minimo", t: "Mudar o mínimo" },
];

export function MaterialV1({ ctx, db, ir, voltar, feito, msg, titulo, sec, sku }: Comum & { sku: string }) {
  const { S } = ctx;
  const m = materialInv(S, db, sku)!;
  const T = tarefasInv(S, db).filter((t) => t.acao.k === "encomendar" && t.acao.sku === sku);
  const [reg, setReg] = useState<Registo | null>(null);
  const [n, setN] = useState(m.qty);
  const [motivo, setMotivo] = useState<MotivoCorrecao | "">("");
  const [sup, setSup] = useState("");
  const [car, setCar] = useState("");
  const [custo, setCusto] = useState("");
  const [erro, setErro] = useState("");
  const forn = db.items.filter((i) => i.sku === sku).map((i) => ({ v: i.sup, t: db.suppliers.find((s) => s.id === i.sup)?.name ?? i.sup }));
  const carrinhas = carrinhasInv(db).map((c) => ({ v: c.id, t: c.nome.replace("Carrinha ", "") + " · " + c.quem }));
  const abrirReg = (r: Registo) => {
    setReg(reg === r ? null : r); setErro(""); setMotivo(""); setCusto("");
    setN(r === "corrigir" ? m.qty : r === "minimo" ? m.rop : 1);
    setSup(forn.find((f) => db.items.find((i) => i.sup === f.v && i.sku === sku)?.pref)?.v ?? forn[0]?.v ?? "");
    setCar("");
  };
  const correr = (r: Resultado<string>) => { if (r.ok) { setErro(""); setReg(null); feito(r.valor); } else { setErro(r.erro); setTimeout(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 30); } };
  const guardar = () => {
    if (reg === "corrigir") { if (!motivo) return correr({ ok: false, valor: "", erro: "Escolha o motivo." }); return correr(corrigir(sku, m.wh, n, motivo)); }
    if (reg === "entrada") return correr(entradaAvulsa(sku, n, sup, custo.trim() ? numero(custo) : null));
    if (reg === "devolver") return correr(devolver(sku, n, sup));
    if (reg === "carrinha") return correr(levarParaCarrinha(sku, n, car));
    if (reg === "minimo") return correr(mudarMinimo(sku, n));
  };
  const BOTAO: Record<Registo, string> = { entrada: `Dar entrada de ${qtd(n, m.un)}`, corrigir: "Guardar a correção", carrinha: `Levar ${qtd(n, m.un)}`, devolver: `Devolver ${qtd(n, m.un)}`, minimo: "Guardar o mínimo" };
  const numeros: [string, string][] = [["No armazém", qtd(m.qty, m.un)], ["Para obras", qtd(m.reservado, m.un)], ["Livre", qtd(Math.max(0, m.livre), m.un)], ["A chegar", qtd(m.aChegar, m.un)]];
  return (
    <>
      <Voltar onClick={voltar}>{nomeSec(sec)}</Voltar>
      <h1 ref={titulo} tabIndex={-1} className={H1}>{m.n}</h1>
      <p className="mt-1 text-base text-muted-foreground">{m.cat} · Armazém Central{m.loc ? ` · prateleira ${m.loc}` : ""} · {m.rop ? `mínimo ${qtd(m.rop, m.un)}` : "sem mínimo"}</p>
      <Feito msg={msg} />
      {T.length > 0 && <Agora S={S} t={T[0]} feito={feito} ir={ir} primario={!reg} vazio="" />}

      <dl className={cn("mt-8 grid grid-cols-2 sm:grid-cols-4", BLOCO)}>
        {numeros.map(([t, val], i) => (
          <div key={t} className={cn("p-4 sm:p-5", i % 2 === 1 && "border-l border-border", i >= 2 && "border-t border-border sm:border-t-0", i === 2 && "sm:border-l")}>
            <dt className="text-[15px] text-muted-foreground">{t}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{val}</dd>
          </div>
        ))}
      </dl>
      {m.baixo && <p className="mt-3 flex items-start gap-2 text-[15px]"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />Abaixo do mínimo: quando o livre fica abaixo de {qtd(m.rop, m.un)}, encomenda-se.{m.aChegar > 0 ? " Já está encomendado." : ""}</p>}

      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        <section aria-labelledby="mat-obras">
          <h2 id="mat-obras" className="text-lg font-semibold">Guardado para</h2>
          {m.obras.length === 0
            ? <p className="mt-2 text-[15px] text-muted-foreground">Nenhuma obra. Quando uma obra precisa deste material, fica guardado para ela e deixa de estar livre.</p>
            : <ul className={cn("mt-3", LISTA)}>{m.obras.map((o, i) => (
              <li key={i}>
                {o.deal != null
                  ? <button type="button" onClick={() => ir({ k: "obra", id: o.deal! })} className={LINHA}><span className="min-w-0 flex-1 text-base font-medium group-hover:underline">Obra de {o.nome}</span><span className="tabular-nums text-[15px] text-muted-foreground">{qtd(o.q, m.un)}</span>{SETA}</button>
                  : <div className="flex min-h-16 items-center gap-4 py-3 sm:px-2"><span className="min-w-0 flex-1 text-base">{o.nome}</span><span className="tabular-nums text-[15px] text-muted-foreground">{qtd(o.q, m.un)}</span></div>}
              </li>
            ))}</ul>}
        </section>
        <section aria-labelledby="mat-forn">
          <h2 id="mat-forn" className="text-lg font-semibold">Quem vende</h2>
          {forn.length === 0
            ? <p className="mt-2 text-[15px] text-muted-foreground">Nenhum fornecedor. Junte-o na ficha de um fornecedor.</p>
            : <ul className={cn("mt-3", LISTA)}>{db.items.filter((i) => i.sku === sku).map((i) => (
              <li key={i.id}>
                <button type="button" onClick={() => ir({ k: "forn", id: i.sup })} className={LINHA}>
                  <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5 text-base font-medium group-hover:underline">{db.suppliers.find((s) => s.id === i.sup)?.name}{i.pref && <Star className="h-4 w-4 fill-primary text-primary" aria-label="preferido" />}</span><span className="block text-[15px] text-muted-foreground">entrega em {plural(i.lead, "dia", "dias")}</span></span>
                  <span className="tabular-nums text-[15px]">{eur(i.price / i.packN)}/{porUn(m.un)}</span>{SETA}
                </button>
              </li>
            ))}</ul>}
        </section>
      </div>

      <section aria-labelledby="mat-registar" className="mt-10">
        <h2 id="mat-registar" className="text-lg font-semibold">Registar</h2>
        <div role="group" aria-label="O que registar" className="mt-3 flex flex-wrap gap-2">
          {REGISTOS.filter((r) => r.v !== "devolver" || forn.length).map((r) => (
            <button key={r.v} type="button" aria-pressed={reg === r.v} aria-expanded={reg === r.v} onClick={() => abrirReg(r.v)}
              className={cn("min-h-11 rounded-lg border px-4 text-[15px] transition-colors", reg === r.v ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:border-foreground/40")}>{r.t}</button>
          ))}
        </div>
        {reg && (
          <div className={cn("mt-4 grid gap-5 p-5 animate-in fade-in-0 slide-in-from-top-1", BLOCO)}>
            {reg === "corrigir" && <Escolhas rotulo="Porquê" opcoes={MOTIVOS} valor={motivo} mudar={(v) => { setMotivo(v); setErro(""); }} erro={erro && !motivo ? erro : undefined} />}
            {(reg === "entrada" || reg === "devolver") && forn.length > 0 && <Escolhas rotulo={reg === "entrada" ? "De quem (opcional)" : "A quem"} opcoes={forn} valor={sup} mudar={setSup} />}
            {reg === "carrinha" && <Escolhas rotulo="Para que carrinha" opcoes={carrinhas} valor={car} mudar={(v) => { setCar(v); setErro(""); }} erro={erro && !car ? erro : undefined} />}
            <div className="grid gap-1.5">
              <span className="text-[15px] font-medium">
                {{ corrigir: "Quanto há agora", entrada: "Quanto entrou", devolver: "Quanto se devolve", carrinha: "Quanto se leva", minimo: "Mínimo" }[reg]}
                <span className="font-normal text-muted-foreground"> {{ corrigir: `(o sistema diz ${qtd(m.qty, m.un)})`, entrada: "", devolver: `(há ${qtd(m.qty, m.un)})`, carrinha: `(livres ${qtd(Math.max(0, m.livre), m.un)})`, minimo: "(abaixo disto, o Inventário pede para encomendar; 0 é sem mínimo)" }[reg]}</span>
              </span>
              <ContadorQtd id={"reg-" + sku} valor={n} un={m.un} nome={m.n} min={reg === "corrigir" || reg === "minimo" ? 0 : 1} onMudar={(x) => setN(Math.round(x))} />
            </div>
            {reg === "entrada" && (
              <Campo id="reg-custo" rotulo="Quanto custou cada um" nota="(opcional, em €)">
                <input inputMode="decimal" value={custo} onChange={(e) => setCusto(e.target.value.replace(/[^\d,.]/g, ""))} {...ligar("reg-custo")} className={cn(CAMPO, "text-right sm:w-40")} />
              </Campo>
            )}
            {erro && (reg !== "corrigir" || motivo) && (reg !== "carrinha" || car) && <Erro>{erro}</Erro>}
            <div><Button size="lg" className="w-full sm:w-auto" onClick={guardar}>{BOTAO[reg]}</Button></div>
          </div>
        )}
      </section>

      <section aria-labelledby="mat-mov" className="mt-10">
        <h2 id="mat-mov" className="text-lg font-semibold">Movimentos</h2>
        <Livro L={movimentosInv(S, db, sku, 30)} comMaterial={false} />
      </section>
    </>
  );
}

/* ---------------------------------------------------------------- o fornecedor */

export function FornecedorV1({ ctx, db, ir, voltar, feito, msg, titulo, sec, id }: Comum & { id: string }) {
  const { S } = ctx;
  const f = fornecedorInv(S, db, id)!;
  const T = tarefasInv(S, db).filter((t) => t.acao.k === "preco" && t.acao.sup === id);
  const [juntar, setJuntar] = useState(false);
  const [q, setQ] = useState("");
  const [sku, setSku] = useState("");
  const [preco, setPreco] = useState("");
  const [erro, setErro] = useState("");
  const jaTem = new Set(f.artigos.map((a) => a.sku));
  const candidatos = db.products.filter((p) => !p.deleted && !p.kit && !jaTem.has(p.sku) && db.stocks.some((s) => s.sku === p.sku && s.wh === ARMAZEM_OBRAS) && (!q.trim() || normal(p.name).includes(normal(q.trim())))).slice(0, 8);
  const correr = (r: Resultado<string>) => { if (r.ok) { setErro(""); setJuntar(false); setSku(""); setPreco(""); setQ(""); feito(r.valor); } else setErro(r.erro); };
  return (
    <>
      <Voltar onClick={voltar}>{nomeSec(sec)}</Voltar>
      <div className="mt-2 flex items-start gap-4">
        <Iniciais nome={f.nome} className="mt-1 h-12 w-12" />
        <div className="min-w-0 flex-1">
          <h1 ref={titulo} tabIndex={-1} className="text-3xl font-semibold tracking-tight outline-none">{f.nome}</h1>
          <p className="mt-1 text-base text-muted-foreground">{f.cidade || "—"} · entrega em {plural(f.prazo, "dia", "dias")} · {f.portal ? "recebe as encomendas no portal" : "recebe as encomendas por email"}</p>
          <div className="flex flex-wrap gap-x-5">
            {f.telefone && <a href={"tel:" + f.telefone.replace(/\s/g, "")} className={LIGACAO}><Phone className="h-4 w-4" aria-hidden="true" />{f.telefone}</a>}
            {f.email && <a href={"mailto:" + f.email} className={cn(LIGACAO, "break-all")}><Mail className="h-4 w-4 shrink-0" aria-hidden="true" />{f.email}</a>}
          </div>
        </div>
      </div>
      <Feito msg={msg} />
      {T.length > 0 && <Agora S={S} t={T[0]} feito={feito} ir={ir} primario={!juntar} vazio="" />}
      {f.precos.length > 1 && (
        <section aria-labelledby="f-precos" className="mt-8">
          <h2 id="f-precos" className="text-lg font-semibold">Preços novos por rever</h2>
          <ul className={cn("mt-3", LISTA)}>
            {f.precos.map((p) => (
              <li key={p.id} className="flex min-h-16 flex-wrap items-center gap-x-4 gap-y-2 py-3 sm:px-2">
                <span className="min-w-0 flex-1"><span className="block text-base font-medium">{p.n}</span><span className="block text-[15px] tabular-nums text-muted-foreground">de {eur(p.de)} para {eur(p.para)} por {porUn(p.un)}</span></span>
                <Button variant="outline" className="min-h-11" onClick={() => correr(decidirPrecoNovo(p.id, true))}>Aceitar</Button>
                <Button variant="ghost" className="min-h-11" onClick={() => correr(decidirPrecoNovo(p.id, false))}>Recusar</Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="f-artigos" className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="f-artigos" className="text-lg font-semibold">O que vende <span className="font-normal text-muted-foreground">· {f.artigos.length}</span></h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="min-h-11" onClick={() => ir({ k: "novaPo", sup: id })}><Truck className="h-4 w-4" aria-hidden="true" />Fazer uma encomenda</Button>
            <Button variant="outline" className="min-h-11" aria-expanded={juntar} onClick={() => { setJuntar(!juntar); setErro(""); }}><Plus className="h-4 w-4" aria-hidden="true" />Juntar um material</Button>
          </div>
        </div>
        {juntar && (
          <div className={cn("mt-4 grid gap-4 p-5 animate-in fade-in-0 slide-in-from-top-1", BLOCO)}>
            <label className="relative block">
              <span className="sr-only">Procurar material</span>
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar o material (ex.: silicone)" className={cn(CAMPO, "pl-10")} />
            </label>
            <Escolhas rotulo="Material" opcoes={candidatos.map((p) => ({ v: p.sku, t: p.name }))} valor={sku} mudar={(v) => { setSku(v); setErro(""); }} erro={erro && !sku ? erro : undefined} />
            {!candidatos.length && <p className="text-[15px] text-muted-foreground">Nenhum material com esse nome. Os materiais novos criam-se em Stock › Novo material.</p>}
            <Campo id="f-preco" rotulo="Preço por unidade" nota="(em €, sem IVA)" erro={erro && sku ? erro : undefined}>
              <input inputMode="decimal" value={preco} onChange={(e) => { setPreco(e.target.value.replace(/[^\d,.]/g, "")); setErro(""); }} {...ligar("f-preco", erro && sku ? erro : undefined)} className={cn(CAMPO, "text-right sm:w-40")} />
            </Campo>
            <div><Button size="lg" className="w-full sm:w-auto" onClick={() => correr(juntarArtigo(id, sku, numero(preco)))}>Juntar o material</Button></div>
          </div>
        )}
        {f.artigos.length === 0 ? <p className="mt-3 text-[15px] text-muted-foreground">Ainda não tem materiais. Junte os que lhe compra, com o preço.</p> : (
          <>
            <div className={cn("mt-3", TABELA)}>
              <table className="w-full text-[15px]">
                <thead><tr><th className={TH}>Material</th><th className={cn(TH, "text-right")}>Preço</th><th className={TH}>Embalagem</th><th className={TH}>Preferido</th></tr></thead>
                <tbody>
                  {f.artigos.map((a) => (
                    <tr key={a.id} className="border-t border-border">
                      <td className={TD}><button type="button" onClick={() => ir({ k: "material", sku: a.sku })} className="text-left font-medium underline-offset-4 hover:underline">{a.n}</button></td>
                      <td className={cn(TD, "text-right tabular-nums")}>{eur(a.preco)}/{porUn(a.un)}</td>
                      <td className={cn(TD, "text-muted-foreground")}>{a.emb || "à unidade"}</td>
                      <td className={TD}>{a.pref ? <span className="inline-flex items-center gap-1.5"><Star className="h-4 w-4 fill-primary text-primary" aria-hidden="true" />compra-se aqui</span> : <span className="text-muted-foreground">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className={cn("mt-3 lg:hidden", LISTA)}>
              {f.artigos.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => ir({ k: "material", sku: a.sku })} className={LINHA}>
                    <span className="min-w-0 flex-1"><span className="flex items-center gap-1.5 text-base font-medium group-hover:underline">{a.n}{a.pref && <Star className="h-4 w-4 fill-primary text-primary" aria-label="compra-se aqui" />}</span><span className="block text-[15px] text-muted-foreground">{a.emb || "à unidade"}</span></span>
                    <span className="shrink-0 tabular-nums text-[15px] font-medium">{eur(a.preco)}/{porUn(a.un)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section aria-labelledby="f-enc" className="mt-10">
        <h2 id="f-enc" className="text-lg font-semibold">Encomendas em aberto <span className="font-normal text-muted-foreground">· {f.abertas.length}</span></h2>
        {f.abertas.length === 0 ? <p className="mt-2 text-[15px] text-muted-foreground">Nenhuma.{f.recebidas ? ` ${plural(f.recebidas, "encomenda recebida", "encomendas recebidas")} antes.` : ""}</p> : (
          <ul className={cn("mt-3", LISTA)}>
            {f.abertas.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => ir({ k: "po", id: p.id })} className={LINHA}>
                  <span className="min-w-0 flex-1"><span className="block text-base font-medium group-hover:underline">{p.para} · {p.resumo}</span><span className="block text-[15px] text-muted-foreground">{p.frase}</span></span>{SETA}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
