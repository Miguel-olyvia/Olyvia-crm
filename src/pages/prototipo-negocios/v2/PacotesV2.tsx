// Pacotes da V2: cada pacote é uma lista de serviços e materiais cuja quantidade sai da medida
// ("1 por m² de pavimento", "fixo 1"), editada na linha. As alternativas ficam na própria linha
// ("ou"), em vez dos grupos de escolha num diálogo. Custo, preço e margem com as mesmas contas
// dos serviços (custosModelo.ts), para umas medidas de exemplo. Sem separadores, sem modais:
// abre-se um pacote de cada vez. Criar: nome → juntar linhas da pesquisa e dos chips (≈4 toques).
import { memo, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, MapPin, PackageOpen, Plus, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CHIP } from "../FiltrosPopover";
import type { LinhaCat } from "../catalogo";
import { eur, nfmt, pct, type Estado, type MedKey } from "../motor";
import { LINHA_NOME, type Custos } from "./custosModelo";
import {
  MEDIDAS, alertasPacote, caminho, contaPacote, criarPacote, escolherAlternativa, juntarAlternativa, juntarLinha, moverLinha, mudarRegra, nomeRef,
  opcoesArvore, opcoesPacote, retirarAlternativa, retirarLinha, textoRegra, type Catalogo, type LinhaPacote, type Pacote, type Regra,
} from "./catalogoModelo";
import { lerCatalogo, mudarCatalogo, porCatalogo } from "./catalogoStore";
import { CAMPO, Contador, Escolha, NumeroCelula, Retirar, TextoCelula } from "./pecasCustos";
import { Escolhedor, ICONE_TIPO, SubirDescer, type SecaoCat } from "./pecasCatalogo";

const TH = "px-2 py-2 text-left text-[15px] font-medium text-muted-foreground";
const TD = "px-2 py-1.5 align-middle";
const REGRA_OP = [{ v: "fixo", t: "Fixo" }, ...MEDIDAS.map((m) => ({ v: m.k, t: `Por ${m.n}` }))];

type Props = SecaoCat & { S: Estado; C: Custos; K: Catalogo; irDefinicoes: () => void };

// memo: só se redesenha quando os custos, o catálogo ou o editor aberto mudam
export const PacotesV2 = memo(function PacotesV2({ S, C, K, editor, setEditor, anunciar, irDefinicoes }: Props) {
  const aberto = (id: string) => editor === `pac:${id}` || !!editor?.startsWith(`pac:${id}:`);
  /** Muda um pacote (na store) e avisa; com "Anular" quando se retira. */
  const mudar = (id: string, fn: (P: Pacote) => Pacote, msg: string, comAnular = false) => {
    const antes = lerCatalogo();
    mudarCatalogo((k) => { const i = k.pacotes.findIndex((p) => p.id === id); if (i >= 0) k.pacotes[i] = fn(k.pacotes[i]); });
    anunciar(msg, comAnular ? () => porCatalogo(antes) : undefined);
  };

  return (
    <section id="cat-pacotes" aria-labelledby="pc-t" className="scroll-mt-6">
      <h2 id="pc-t" className="text-2xl font-semibold tracking-tight">Pacotes</h2>
      <p className="mt-1 text-[15px] text-muted-foreground">
        Serviços e materiais vendidos juntos. A quantidade de cada linha sai da medida da obra; "ou" dá alternativas na mesma linha.
        Custo, preço e margem com as contas dos serviços, para as medidas de exemplo de cada pacote.
      </p>
      <p className="mt-1 text-[15px] text-muted-foreground">
        As taxas de deslocação estão nas Definições.{" "}
        <button type="button" onClick={irDefinicoes} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg font-medium text-foreground underline underline-offset-4">
          <MapPin className="h-4 w-4 text-primary" aria-hidden="true" />Ver as taxas de deslocação
        </button>
      </p>

      <ul className="mt-3 divide-y divide-border border-y border-border" aria-label="Pacotes">
        {K.pacotes.map((P) => {
          const c = contaPacote(S, C, K, P), A = alertasPacote(c, P), bloq = A.some((a) => a.k === "x"), ab = aberto(P.id);
          return (
            <li key={P.id}>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-1.5">
                <button id={`pac-${P.id}`} type="button" aria-expanded={ab} onClick={() => setEditor(ab ? null : `pac:${P.id}`)}
                  className="flex min-h-11 items-center gap-2 rounded-lg px-1 text-left hover:underline">
                  {ab ? <ChevronDown className="h-5 w-5 shrink-0" aria-hidden="true" /> : <ChevronRight className="h-5 w-5 shrink-0" aria-hidden="true" />}
                  <span>
                    <span className="block text-[15px] font-medium">{P.n}</span>
                    <span className="block text-[15px] text-muted-foreground">
                      {caminho(K.arvore, P.no)} · {P.linhas.length} {P.linhas.length === 1 ? "linha" : "linhas"}{P.linha ? ` · ${LINHA_NOME[P.linha]}` : ""}
                    </span>
                  </span>
                </button>
                <span className="flex gap-5 text-[15px] tabular-nums">
                  <span><span className="text-muted-foreground">Custo </span>{eur(c.custo)} €</span>
                  <span><span className="text-muted-foreground">Preço </span>{eur(c.preco)} €</span>
                  <span className="inline-flex items-center gap-1.5"><span className="text-muted-foreground">Margem </span>
                    {bloq && <TriangleAlert className="h-4 w-4 text-destructive" aria-hidden="true" />}{pct(c.m)}{bloq && <span className="sr-only"> (abaixo do mínimo)</span>}
                  </span>
                </span>
              </div>
              {ab && <EditorPacote S={S} C={C} K={K} P={P} editor={editor} setEditor={setEditor} anunciar={anunciar} mudar={mudar} />}
            </li>
          );
        })}
        {!K.pacotes.length && <li className="py-3 text-[15px] text-muted-foreground">Ainda sem pacotes.</li>}
      </ul>

      {editor === "pac:novo" ? <NovoPacote S={S} setEditor={setEditor} anunciar={anunciar} /> : (
        <Button variant="outline" className="mt-3 min-h-11 text-[15px]" onClick={() => setEditor("pac:novo")}><Plus className="h-4 w-4" aria-hidden="true" />Novo pacote</Button>
      )}
    </section>
  );
});

function NovoPacote({ S, setEditor, anunciar }: { S: Estado } & Pick<SecaoCat, "setEditor" | "anunciar">) {
  const [n, setN] = useState(""), [erro, setErro] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const criar = () => {
    const r = criarPacote(lerCatalogo(), n, { alvo: S.cfg.alvo });
    if ("erro" in r) { setErro(r.erro); return; }
    const antes = lerCatalogo();
    mudarCatalogo(() => r.K);
    // abre o pacote já no "juntar": pesquisa e chips
    setEditor(`pac:${r.id}:juntar`);
    anunciar(`Pacote «${n.trim()}» criado. Junte serviços e materiais.`, () => porCatalogo(antes));
  };
  return (
    <form role="group" aria-label="Novo pacote" className="mt-3 flex flex-wrap items-end gap-3 border-l-2 border-border pl-4"
      onSubmit={(e) => { e.preventDefault(); criar(); }} onKeyDown={(e) => { if (e.key === "Escape") setEditor(null); }}>
      <label className="grid gap-1.5"><span className="text-[15px] font-medium">Nome do pacote</span>
        <input ref={ref} type="text" value={n} onChange={(e) => { setN(e.target.value); setErro(null); }} className={cn(CAMPO, "w-72")} /></label>
      <Button type="submit" variant="outline" className="min-h-11 text-[15px]">Criar pacote</Button>
      <Button type="button" variant="ghost" className="min-h-11 text-[15px]" onClick={() => setEditor(null)}>Cancelar</Button>
      <p className="w-full min-h-6 text-[15px]" aria-live="polite">{erro}</p>
    </form>
  );
}

function EditorPacote({ S, C, K, P, editor, setEditor, anunciar, mudar }: Omit<Props, "irDefinicoes"> & { P: Pacote; mudar: (id: string, fn: (P: Pacote) => Pacote, msg: string, comAnular?: boolean) => void }) {
  const [q, setQ] = useState("");
  const c = contaPacote(S, C, K, P), A = alertasPacote(c, P);
  const juntando = editor === `pac:${P.id}:juntar`;
  const ouLinha = editor?.startsWith(`pac:${P.id}:ou:`) ? editor.slice(`pac:${P.id}:ou:`.length) : null;
  const nome = (l: LinhaPacote, ref: string) => nomeRef(S, K, l.t, ref);
  const usados = P.linhas.flatMap((l) => l.refs);
  const regraDe = (l: LinhaPacote, v: string): Regra => {
    if (v === "fixo") return { k: "fixo", q: l.regra.k === "fixo" ? l.regra.q : 1 };
    return { k: "por", med: v as MedKey, f: l.regra.k === "por" ? l.regra.f : 1, arred: l.regra.k === "por" ? l.regra.arred : false };
  };

  return (
    <div className="mb-4 ml-3 border-l-2 border-border pl-4">
      {/* ------------------------------------------------ o pacote */}
      <div className="flex flex-wrap items-end gap-4 pt-1">
        <label className="grid gap-1.5"><span className="text-[15px] font-medium">Nome</span>
          <TextoCelula rotulo={`Nome do pacote ${P.n}`} w="w-80" v={P.n} onSet={(n) => mudar(P.id, (x) => ({ ...x, n }), "Pacote renomeado")} /></label>
        <label className="grid gap-1.5"><span className="text-[15px] font-medium">Classificação</span>
          <Escolha rotulo={`Classificação de ${P.n}`} w="w-56" v={P.no ?? ""} opcoes={[{ v: "", t: "Sem classificação" }, ...opcoesArvore(K.arvore)]}
            onSet={(no) => mudar(P.id, (x) => ({ ...x, no: no || null }), `${P.n}: ${caminho(K.arvore, no || null)}`)} /></label>
        <label className="grid gap-1.5"><span className="text-[15px] font-medium">Linha de serviço</span>
          <Escolha rotulo={`Linha de serviço de ${P.n}`} w="w-44" v={P.linha ?? ""} opcoes={[{ v: "", t: "Nenhuma" }, ...(["wc", "coz"] as LinhaCat[]).map((l) => ({ v: l, t: LINHA_NOME[l] }))]}
            onSet={(l) => mudar(P.id, (x) => ({ ...x, linha: (l || null) as LinhaCat | null }), `Margem mínima: ${l ? LINHA_NOME[l as LinhaCat] : "a geral"}`)} /></label>
      </div>
      <div className="mt-2 max-w-md">
        <Contador id={`pac-mm-${P.id}`} rotulo="Margem dos materiais" v={P.margemMat} onSet={(n) => mudar(P.id, (x) => ({ ...x, margemMat: n }), `Margem dos materiais: ${n}%`)} />
      </div>
      <fieldset className="mt-2">
        <legend className="text-[15px] font-medium">Medidas de exemplo</legend>
        <div className="mt-1.5 flex flex-wrap gap-4">
          {MEDIDAS.map((m) => (
            <label key={m.k} className="flex items-center gap-2 text-[15px]">
              <NumeroCelula rotulo={`Exemplo: ${m.n}`} w="w-20" v={P.ex[m.k]} onSet={(n) => mudar(P.id, (x) => ({ ...x, ex: { ...x.ex, [m.k]: n } }), `Exemplo: ${nfmt(n)} ${m.curto}`)} />
              <span className="text-muted-foreground">{m.curto}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* ------------------------------------------------ as linhas */}
      {P.linhas.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1000px] border-collapse">
            <caption className="sr-only">Linhas de {P.n}: quantidade pela medida, custo e preço</caption>
            <thead><tr className="border-b border-border">
              <th scope="col" className={TH}>Linha</th><th scope="col" className={TH}>Quantidade</th><th scope="col" className={cn(TH, "text-right")}>No exemplo</th>
              <th scope="col" className={cn(TH, "text-right")}>Custo</th><th scope="col" className={cn(TH, "text-right")}>Preço</th><th scope="col" className={TH}><span className="sr-only">Mover e retirar</span></th>
            </tr></thead>
            <tbody>
              {P.linhas.map((l, i) => {
                const cl = c.linhas[i], { I, cor, t } = ICONE_TIPO[l.t], n = nome(l, l.esc);
                return (
                  <tr key={l.id} className="border-b border-border align-top">
                    <td className={cn(TD, "max-w-[26rem]")}>
                      <span className="flex items-start gap-2 pt-2.5 text-[15px] font-medium"><I className={cn("mt-0.5 h-4 w-4 shrink-0", cor)} aria-hidden="true" /><span className="sr-only">{t}: </span>{n}</span>
                      {l.refs.length > 1 && (
                        <ul className="mt-1.5 flex flex-wrap items-center gap-1.5" aria-label={`Alternativas de ${n}`}>
                          {l.refs.map((r, k) => (
                            <li key={r} className="inline-flex items-center gap-1">
                              {k > 0 && <span className="text-[15px] text-muted-foreground">ou</span>}
                              <button type="button" aria-pressed={l.esc === r} onClick={() => mudar(P.id, (x) => escolherAlternativa(x, l.id, r), `Escolhido: ${nome(l, r)}`)} className={CHIP(l.esc === r)}>{nome(l, r)}</button>
                              {l.esc !== r && <button type="button" aria-label={`Retirar a alternativa ${nome(l, r)}`} title="Retirar a alternativa"
                                onClick={() => mudar(P.id, (x) => retirarAlternativa(x, l.id, r), `Alternativa ${nome(l, r)} retirada`, true)}
                                className="grid h-11 w-11 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" aria-hidden="true" /></button>}
                            </li>
                          ))}
                        </ul>
                      )}
                      <button type="button" aria-expanded={ouLinha === l.id} onClick={() => { setQ(""); setEditor(ouLinha === l.id ? `pac:${P.id}` : `pac:${P.id}:ou:${l.id}`); }}
                        className="mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-[15px] text-muted-foreground hover:text-foreground">
                        <Plus className="h-4 w-4" aria-hidden="true" />ou…<span className="sr-only"> (alternativa a {n})</span>
                      </button>
                      {ouLinha === l.id && (
                        <Escolhedor rotulo={`Alternativa a ${n}`} q={q} setQ={setQ} opcoes={opcoesPacote(S, K, q, { t: l.t, sem: l.refs })}
                          onEscolher={(o) => { mudar(P.id, (x) => juntarAlternativa(x, l.id, o.ref), `${o.n} juntado como alternativa`); setEditor(`pac:${P.id}`); }} />
                      )}
                    </td>
                    <td className={TD}>
                      <span className="flex flex-wrap items-center gap-2">
                        <Escolha rotulo={`Quantidade de ${n}`} w="w-56" v={l.regra.k === "fixo" ? "fixo" : l.regra.med} opcoes={REGRA_OP}
                          onSet={(v) => mudar(P.id, (x) => mudarRegra(x, l.id, regraDe(l, v)), `${n}: ${textoRegra(regraDe(l, v))}`)} />
                        {l.regra.k === "fixo"
                          ? <NumeroCelula rotulo={`Quantidade fixa de ${n}`} w="w-20" v={l.regra.q} onSet={(q2) => mudar(P.id, (x) => mudarRegra(x, l.id, { k: "fixo", q: q2 }), `${n}: fixo ${nfmt(q2)}`)} />
                          : <NumeroCelula rotulo={`Fator por medida de ${n}`} w="w-20" v={l.regra.f} onSet={(f) => mudar(P.id, (x) => mudarRegra(x, l.id, { ...(l.regra as Extract<Regra, { k: "por" }>), f }), `${n}: fator ${nfmt(f)}`)} />}
                        {l.regra.k === "por" && (
                          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-[15px]">
                            <input type="checkbox" checked={l.regra.arred} className="h-5 w-5 accent-[hsl(var(--foreground))]"
                              onChange={(e) => mudar(P.id, (x) => mudarRegra(x, l.id, { ...(l.regra as Extract<Regra, { k: "por" }>), arred: e.target.checked }), e.target.checked ? `${n}: arredonda para cima` : `${n}: sem arredondar`)} />
                            Arredondar
                          </label>
                        )}
                      </span>
                      <span className="mt-0.5 block text-[15px] text-muted-foreground">{textoRegra(l.regra)}</span>
                    </td>
                    <td className={cn(TD, "pt-4 text-right text-[15px] tabular-nums")}>{nfmt(cl.q)} {cl.un}</td>
                    <td className={cn(TD, "pt-4 text-right text-[15px] tabular-nums")}>{eur(cl.custo)} €<span className="block text-muted-foreground">{eur(cl.cu)} €/{cl.un}</span></td>
                    <td className={cn(TD, "pt-4 text-right text-[15px] tabular-nums")}>{eur(cl.preco)} €<span className="block text-muted-foreground">{eur(cl.pu)} €/{cl.un}</span></td>
                    <td className={TD}>
                      <span className="flex">
                        <SubirDescer nome={n} primeiro={i === 0} ultimo={i === P.linhas.length - 1} onMover={(d) => mudar(P.id, (x) => moverLinha(x, l.id, d), `${n} ${d < 0 ? "subiu" : "desceu"}`)} />
                        <Retirar rotulo={`Retirar ${n} do pacote`} onClick={() => mudar(P.id, (x) => retirarLinha(x, l.id), `${n} retirado do pacote`, true)} />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ------------------------------------------------ as contas */}
      <dl className="mt-4 grid max-w-md gap-1 text-[15px]">
        <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Serviços ({nfmt(c.h)} h)</dt><dd className="tabular-nums">{eur(c.mo)} €</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Materiais</dt><dd className="tabular-nums">{eur(c.mat)} €</dd></div>
        <div className="flex justify-between gap-3 border-t border-border pt-1 font-semibold"><dt>Custo do pacote</dt><dd className="tabular-nums">{eur(c.custo)} €</dd></div>
        <div className="flex justify-between gap-3"><dt>Preço</dt><dd className="tabular-nums">{eur(c.preco)} €</dd></div>
        <div className="flex justify-between gap-3"><dt>Margem (mínimo {c.min}%)</dt><dd className="tabular-nums">{pct(c.m)}</dd></div>
      </dl>
      {A.length > 0 && (
        <ul className="mt-3 space-y-1.5" aria-label={`Alertas de ${P.n}`}>
          {A.map((a) => (
            <li key={a.t} className="flex items-center gap-2 text-[15px]">
              <TriangleAlert className={cn("h-4 w-4 shrink-0", a.k === "x" ? "text-destructive" : "text-warning")} aria-hidden="true" />{a.t}
            </li>
          ))}
        </ul>
      )}

      {/* ------------------------------------------------ juntar */}
      <div className="mt-4 flex flex-wrap gap-3 pb-2">
        <Button variant="outline" className="min-h-11 text-[15px]" aria-expanded={juntando} onClick={() => { setQ(""); setEditor(juntando ? `pac:${P.id}` : `pac:${P.id}:juntar`); }}>
          <PackageOpen className="h-4 w-4" aria-hidden="true" />{juntando ? "Fechar a pesquisa" : "Juntar serviço ou material"}
        </Button>
        <Button variant="ghost" className="min-h-11 text-[15px]" onClick={() => {
          const antes = lerCatalogo();
          mudarCatalogo((k) => { k.pacotes = k.pacotes.filter((x) => x.id !== P.id); });
          setEditor(null);
          anunciar(`Pacote «${P.n}» retirado`, () => porCatalogo(antes));
        }}>Retirar o pacote</Button>
      </div>
      {juntando && (
        <Escolhedor rotulo={`Juntar a ${P.n}`} q={q} setQ={setQ} opcoes={opcoesPacote(S, K, q, { sem: usados })}
          onEscolher={(o) => mudar(P.id, (x) => juntarLinha(x, o.t, o.ref, o.un), `${o.n} juntado: ${textoRegra(juntarLinha(P, o.t, o.ref, o.un).linhas.at(-1)!.regra)}`)} />
      )}
    </div>
  );
}
