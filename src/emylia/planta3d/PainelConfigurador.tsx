// Protótipo (visualizador 3D): o painel «Configurador de famílias», como assistente de 6 passos (um visível de cada vez):
// 1 Família, 2 Acabamentos, 3 Medidas, 4 Combinações (matriz cor × medida), 5 Modelo 3D, 6 Pré-visualização e guardar.
// Só em memória: a lista vive no estado de quem o usa e no registo de familias.ts; recarregar perde tudo. A lógica está em configurador.ts.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CartaoFamilia } from "./BarraProdutos";
import { ESPEC, ROTULO_ESPACO } from "./catalogo3d";
import {
  TIPOS_DA_CATEGORIA, celulaKey, comNome, criarFamiliaVazia, exemploKeran, ficheirosCompativeis, juntarAcabamento, juntarMedida, paraFamilia, problemas,
  sincronizar, skuDaCelula, tirarAcabamento, tirarMedida, type FamiliaCfg,
} from "./configurador";
import { CATEGORIAS_FAMILIA, registarFamilias, variantesDe, type CategoriaFam } from "./familias";
import { chaveFicheiro } from "./modelosHtml/ficheiros";
import type { TipoEspaco } from "./modelo";

const INP = "h-11 min-w-0 rounded-lg border border-input bg-card px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:opacity-60";
const BTN = "inline-flex min-h-11 items-center justify-center rounded-full border border-input bg-background px-4 py-2 text-[15px] transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50";
const BTN_PRIMARIO = "inline-flex min-h-11 items-center justify-center rounded-full border border-primary bg-primary px-4 py-2 text-[15px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50";
const CAMPO = "grid min-w-0 gap-1 text-sm font-medium";
const eur = (n: number) => n.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
const TITULOS = ["Família", "Acabamentos", "Medidas", "Combinações (cor × medida)", "Modelo 3D", "Pré-visualização"] as const;
const TOTAL_PASSOS = TITULOS.length;
const SEM_GLB = "";
const semAcao = () => undefined;

export interface PainelConfiguradorProps {
  /** As famílias configuradas nesta sessão (quem usa o painel guarda-as no estado). */
  familias: readonly FamiliaCfg[];
  onFamilias: (lista: FamiliaCfg[]) => void;
}

const copia = (f: FamiliaCfg): FamiliaCfg => structuredClone(f);
const nomeMedida = (f: FamiliaCfg, id: string) => { const m = f.medidas.find((x) => x.id === id); return m ? m.rotulo.trim() || m.ref || m.id : id; };
const nomeAcab = (f: FamiliaCfg, id: string) => f.acabamentos.find((a) => a.id === id)?.nome.trim() || id;

export function PainelConfigurador({ familias, onFamilias }: PainelConfiguradorProps) {
  const [rascunho, setRascunho] = useState<FamiliaCfg | null>(null);
  const [original, setOriginal] = useState<string | null>(null);
  const [passo, setPasso] = useState(1);
  const [escolha, setEscolha] = useState<{ med?: string; acab?: string }>({});
  const tituloRef = useRef<HTMLHeadingElement>(null), primeiraVez = useRef(true);
  const emLista = rascunho === null;
  useEffect(() => {
    if (primeiraVez.current) { primeiraVez.current = false; return; }
    tituloRef.current?.focus();
  }, [passo, emLista]);

  const abrir = (f: FamiliaCfg, idOriginal: string | null) => { setRascunho(sincronizar(copia(f))); setOriginal(idOriginal); setPasso(1); setEscolha({}); };
  const guardarLista = (lista: FamiliaCfg[]) => { registarFamilias(lista.map(paraFamilia)); onFamilias(lista); };
  const mudar = (f: FamiliaCfg) => setRascunho(f);

  const aviso = (
    <p role="note" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      Protótipo: só dura nesta sessão; nada é guardado. Uma peça posta na planta com uma família configurada perde-se ao recarregar.
    </p>
  );

  if (!rascunho) {
    return (
      <section aria-label="Configurador de famílias (protótipo)" className="flex w-full max-w-2xl flex-col gap-3 rounded-2xl border border-primary/30 bg-primary/[0.03] p-3">
        {aviso}
        <p className="text-sm text-muted-foreground">Crie uma família com acabamentos e medidas: cada combinação cor × medida tem o seu preço e o seu SKU. Depois de guardada, aparece na barra de produtos, na categoria que escolheu.</p>
        {familias.length === 0
          ? <p role="status" className="text-[15px]">Ainda sem famílias configuradas.</p>
          : (
            <ul aria-label="Famílias configuradas" className="grid gap-2">
              {familias.map((f) => {
                const fam = paraFamilia(f), n = variantesDe(fam).length;
                return (
                  <li key={f.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
                    <div className="min-w-0 flex-1"><p className="break-words text-[15px] font-semibold">{f.nome}</p><p className="text-sm text-muted-foreground">{f.marca || "Sem marca"} · {CATEGORIAS_FAMILIA.find((c) => c.id === f.categoria)?.rotulo} · {n} {n === 1 ? "variante" : "variantes"}</p></div>
                    <button type="button" className={BTN} aria-label={`Editar ${f.nome}`} onClick={() => abrir(f, f.id)}>Editar</button>
                    <button type="button" className={BTN} aria-label={`Remover ${f.nome}`} onClick={() => guardarLista(familias.filter((x) => x.id !== f.id))}>Remover</button>
                  </li>
                );
              })}
            </ul>
          )}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BTN_PRIMARIO} onClick={() => abrir(criarFamiliaVazia(), null)}>Nova família</button>
          <button type="button" className={BTN} onClick={() => abrir(exemploKeran(), null)}>Começar pelo exemplo</button>
        </div>
      </section>
    );
  }

  const outrosIds = familias.filter((x) => x.id !== original).map((x) => x.id);
  const todos = problemas(rascunho, outrosIds);
  const doPasso = todos.filter((x) => x.passo === passo);
  const motivo = passo < TOTAL_PASSOS && doPasso.length > 0 ? `Para continuar: ${doPasso[0].msg}` : "";
  const seguinte = () => { if (!motivo) setPasso((p) => Math.min(TOTAL_PASSOS, p + 1)); };
  const anterior = () => setPasso((p) => Math.max(1, p - 1));
  const guardar = () => {
    if (todos.length > 0) return;
    const lista = original ? familias.map((x) => (x.id === original ? rascunho : x)) : [...familias, rascunho];
    guardarLista(lista);
    setRascunho(null); setOriginal(null);
  };
  const ativas = rascunho.medidas.flatMap((m) => rascunho.acabamentos.filter((a) => rascunho.celulas[celulaKey(m.id, a.id)]?.ativo).map((a) => ({ m, a })));

  return (
    <section aria-label="Configurador de famílias (protótipo)" className="flex w-full max-w-2xl flex-col gap-3 rounded-2xl border border-primary/30 bg-primary/[0.03] p-3"
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); if (passo > 1) anterior(); } }}>
      {aviso}
      <div>
        <p role="status" className="text-sm font-medium text-muted-foreground">Passo {passo} de {TOTAL_PASSOS} · {TITULOS[passo - 1]}</p>
        <ol aria-label="Passos do configurador" className="mt-1 flex gap-1.5">
          {TITULOS.map((t, i) => {
            const n = i + 1, atual = n === passo;
            return (
              <li key={t} aria-current={atual ? "step" : undefined} aria-label={`Passo ${n}: ${t}${n < passo ? " (feito)" : atual ? " (atual)" : ""}`}
                className={`flex h-8 min-w-0 flex-1 items-center justify-center rounded-full border px-2 text-xs ${atual ? "border-primary bg-primary font-semibold text-primary-foreground" : n < passo ? "border-primary/40 bg-primary/10" : "border-border bg-muted/40 text-muted-foreground"}`}>
                <span aria-hidden="true">{n < passo ? "✓" : n}</span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-card p-3">
        <h3 ref={tituloRef} tabIndex={-1} className="text-[15px] font-semibold outline-none">{TITULOS[passo - 1]}</h3>
        {passo === 1 && <PassoFamilia f={rascunho} onMudar={mudar} />}
        {passo === 2 && <PassoAcabamentos f={rascunho} onMudar={mudar} />}
        {passo === 3 && <PassoMedidas f={rascunho} onMudar={mudar} />}
        {passo === 4 && <PassoMatriz f={rascunho} onMudar={mudar} erros={doPasso.map((x) => x.msg)} />}
        {passo === 5 && <PassoModelo f={rascunho} ativas={ativas} onMudar={mudar} />}
        {passo === 6 && (
          <PassoPrevisao f={rascunho} erros={todos.map((x) => x.msg)} escolha={escolha} onEscolha={setEscolha} />
        )}
      </div>

      <div role="group" aria-label="Navegação do configurador" className="flex flex-wrap items-center gap-2">
        {motivo && <p id="motivo-seguinte" className="w-full text-sm text-muted-foreground">{motivo}</p>}
        <button type="button" className={BTN} disabled={passo === 1} onClick={anterior}>Anterior</button>
        {passo < TOTAL_PASSOS
          ? <button type="button" className={BTN_PRIMARIO} disabled={!!motivo} aria-describedby={motivo ? "motivo-seguinte" : undefined} onClick={seguinte}>Seguinte</button>
          : <button type="button" className={BTN_PRIMARIO} disabled={todos.length > 0} onClick={guardar}>Guardar na sessão</button>}
        <button type="button" className={BTN} onClick={() => { setRascunho(null); setOriginal(null); }}>Cancelar</button>
      </div>
    </section>
  );
}

function Erros({ erros }: { erros: readonly string[] }): ReactNode {
  if (erros.length === 0) return null;
  return (
    <ul role="alert" className="grid gap-1 rounded-lg border border-destructive/50 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      {erros.map((e) => <li key={e}>Erro: {e}</li>)}
    </ul>
  );
}

interface PassoProps { f: FamiliaCfg; onMudar: (f: FamiliaCfg) => void }

function PassoFamilia({ f, onMudar }: PassoProps) {
  const tipos = TIPOS_DA_CATEGORIA[f.categoria];
  const escolherCategoria = (c: CategoriaFam) => onMudar({ ...f, categoria: c, tipo: TIPOS_DA_CATEGORIA[c][0], espacos: [...(CATEGORIAS_FAMILIA.find((x) => x.id === c)?.espacos ?? ["outro"])] });
  const espacosPossiveis = Object.keys(ROTULO_ESPACO) as TipoEspaco[];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className={CAMPO}>Nome da família<input className={INP} value={f.nome} onChange={(e) => onMudar(comNome(f, e.target.value))} placeholder="Por exemplo, Lava-loiça Keran" /></label>
      <label className={CAMPO}>Marca<input className={INP} value={f.marca} onChange={(e) => onMudar({ ...f, marca: e.target.value })} /></label>
      <label className={CAMPO}>Categoria
        <select className={INP} value={f.categoria} onChange={(e) => escolherCategoria(e.target.value as CategoriaFam)}>
          {CATEGORIAS_FAMILIA.map((c) => <option key={c.id} value={c.id}>{c.rotulo}</option>)}
        </select>
      </label>
      <label className={CAMPO}>Tipo de produto
        <select className={INP} value={f.tipo} onChange={(e) => onMudar({ ...f, tipo: e.target.value as FamiliaCfg["tipo"], glb: {} })}>
          {tipos.map((t) => <option key={t} value={t}>{ESPEC[t].rotulo}</option>)}
        </select>
      </label>
      <fieldset className="grid gap-1 sm:col-span-2">
        <legend className="text-sm font-medium">Espaços onde aparece</legend>
        <div className="flex flex-wrap gap-2">
          {espacosPossiveis.map((t) => (
            <label key={t} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-input bg-background px-4 text-[15px]">
              <input type="checkbox" checked={f.espacos.includes(t)} onChange={(e) => onMudar({ ...f, espacos: e.target.checked ? [...f.espacos, t] : f.espacos.filter((x) => x !== t) })} />
              {ROTULO_ESPACO[t]}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="break-all text-sm text-muted-foreground sm:col-span-2">Identificador: {f.id}</p>
    </div>
  );
}

function PassoAcabamentos({ f, onMudar }: PassoProps) {
  const alterar = (id: string, p: Partial<FamiliaCfg["acabamentos"][number]>) => onMudar({ ...f, acabamentos: f.acabamentos.map((a) => (a.id === id ? { ...a, ...p } : a)) });
  return (
    <div className="grid gap-3">
      {f.acabamentos.map((a, i) => (
        <div key={a.id} className="flex flex-wrap items-end gap-2 rounded-xl border border-border p-2">
          <label className={`${CAMPO} min-w-40 flex-1`}>Nome do acabamento {i + 1}<input className={INP} value={a.nome} onChange={(e) => alterar(a.id, { nome: e.target.value })} /></label>
          <label className={`${CAMPO} w-24`}>Código {i + 1}<input aria-label={`Código do acabamento ${i + 1}`} className={INP} value={a.codigo} onChange={(e) => alterar(a.id, { codigo: e.target.value })} /></label>
          <label className={CAMPO}>Cor {i + 1}<input aria-label={`Cor do acabamento ${i + 1}`} type="color" className="h-11 w-16 rounded-lg border border-input bg-card p-1" value={a.cor} onChange={(e) => alterar(a.id, { cor: e.target.value })} /></label>
          <button type="button" className={BTN} aria-label={`Remover o acabamento ${a.nome || i + 1}`} onClick={() => onMudar(tirarAcabamento(f, a.id))}>Remover</button>
        </div>
      ))}
      <div><button type="button" className={BTN} onClick={() => onMudar(juntarAcabamento(f))}>Adicionar acabamento</button></div>
    </div>
  );
}

const numero = (v: string): number => { const n = Number(v.replace(",", ".")); return Number.isFinite(n) ? n : 0; };

function PassoMedidas({ f, onMudar }: PassoProps) {
  const alterar = (id: string, p: Partial<FamiliaCfg["medidas"][number]>) => onMudar({ ...f, medidas: f.medidas.map((m) => (m.id === id ? { ...m, ...p } : m)) });
  const dim = (m: FamiliaCfg["medidas"][number], i: 0 | 1 | 2, v: string) => alterar(m.id, { dim: m.dim.map((x, j) => (j === i ? numero(v) : x)) as [number, number, number] });
  const NOMES_DIM = ["Largura", "Profundidade", "Altura"] as const;
  return (
    <div className="grid gap-3">
      {f.medidas.map((m, i) => (
        <div key={m.id} className="grid gap-2 rounded-xl border border-border p-2">
          <div className="flex flex-wrap items-end gap-2">
            <label className={`${CAMPO} min-w-40 flex-1`}>Rótulo da medida {i + 1}<input className={INP} value={m.rotulo} onChange={(e) => alterar(m.id, { rotulo: e.target.value })} /></label>
            <label className={`${CAMPO} min-w-32 flex-1`}>Referência da medida {i + 1}<input className={INP} value={m.ref} onChange={(e) => alterar(m.id, { ref: e.target.value })} /></label>
            <label className={`${CAMPO} w-32`}>Preço base da medida {i + 1} (€)<input type="number" min="0" step="0.01" inputMode="decimal" className={INP} defaultValue={m.preco || ""} onChange={(e) => alterar(m.id, { preco: numero(e.target.value) })} /></label>
          </div>
          <div className="flex flex-wrap gap-2">
            {NOMES_DIM.map((n, j) => (
              <label key={n} className={`${CAMPO} w-28`}>{n} da medida {i + 1} (cm)<input type="number" min="0" step="0.1" inputMode="decimal" className={INP} defaultValue={m.dim[j]} onChange={(e) => dim(m, j as 0 | 1 | 2, e.target.value)} /></label>
            ))}
          </div>
          <div><button type="button" className={BTN} aria-label={`Remover a medida ${m.rotulo || i + 1}`} onClick={() => onMudar(tirarMedida(f, m.id))}>Remover</button></div>
        </div>
      ))}
      <div><button type="button" className={BTN} onClick={() => onMudar(juntarMedida(f))}>Adicionar medida</button></div>
    </div>
  );
}

function PassoMatriz({ f, onMudar, erros }: PassoProps & { erros: readonly string[] }) {
  const celula = (mid: string, aid: string) => f.celulas[celulaKey(mid, aid)] ?? { ativo: true };
  const alterar = (mid: string, aid: string, p: Partial<ReturnType<typeof celula>>) => onMudar({ ...f, celulas: { ...f.celulas, [celulaKey(mid, aid)]: { ...celula(mid, aid), ...p } } });
  const manual = f.regraSku.modo === "manual";
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">Cada linha é uma medida e cada cartão uma cor. Desligue a combinação que não existe: a cor deixa de aparecer nessa medida. O preço e o SKU de cada combinação já vêm preenchidos; escreva só para os alterar.</p>
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="mb-1 text-sm font-medium">Como se forma o SKU</legend>
        <label className="inline-flex min-h-11 items-center gap-2 text-[15px]"><input type="radio" name="regra-sku" checked={!manual} onChange={() => onMudar({ ...f, regraSku: { ...f.regraSku, modo: "auto" } })} />SKU automático</label>
        <label className="inline-flex min-h-11 items-center gap-2 text-[15px]"><input type="radio" name="regra-sku" checked={manual} onChange={() => onMudar({ ...f, regraSku: { ...f.regraSku, modo: "manual" } })} />SKU escrito à mão</label>
        <label className="inline-flex items-center gap-2 text-sm">Separador<input aria-label="Separador do SKU" maxLength={3} className={`${INP} w-16`} value={f.regraSku.sep} onChange={(e) => onMudar({ ...f, regraSku: { ...f.regraSku, sep: e.target.value } })} /></label>
      </fieldset>
      <Erros erros={erros} />
      {f.medidas.map((m) => (
        <fieldset key={m.id} className="grid gap-2 rounded-xl border border-border p-2">
          <legend className="px-1 text-sm font-semibold">{nomeMedida(f, m.id)} · base {eur(m.preco)}</legend>
          {f.acabamentos.map((a) => {
            const c = celula(m.id, a.id), rot = `${nomeMedida(f, m.id)} × ${nomeAcab(f, a.id)}`;
            return (
              <div key={a.id} className={`flex flex-wrap items-center gap-2 rounded-lg border p-2 ${c.ativo ? "border-border" : "border-dashed border-border bg-muted/40"}`}>
                <label className="inline-flex min-h-11 min-w-36 flex-1 items-center gap-2 text-[15px]">
                  <input type="checkbox" aria-label={`Ativo: ${rot}`} checked={c.ativo} onChange={(e) => alterar(m.id, a.id, { ativo: e.target.checked })} />
                  <span aria-hidden="true" className="block h-5 w-5 shrink-0 rounded-full border border-border" style={{ background: a.cor }} />
                  <span className="break-words">{nomeAcab(f, a.id)}{c.ativo ? "" : " (não existe nesta medida)"}</span>
                </label>
                <label className="inline-flex items-center gap-1 text-sm">€
                  <input type="number" min="0" step="0.01" inputMode="decimal" aria-label={`Preço de ${rot}`} className={`${INP} w-24`} disabled={!c.ativo} placeholder={String(m.preco)}
                    defaultValue={c.preco ?? ""} onChange={(e) => alterar(m.id, a.id, { preco: e.target.value === "" ? undefined : numero(e.target.value) })} />
                </label>
                <label className="inline-flex items-center gap-1 text-sm">SKU
                  <input aria-label={`SKU de ${rot}`} className={`${INP} w-40`} disabled={!c.ativo} readOnly={!manual} placeholder={skuDaCelula({ ...f, regraSku: { ...f.regraSku, modo: "auto" } }, m.id, a.id)}
                    value={manual ? c.sku ?? "" : skuDaCelula(f, m.id, a.id)} onChange={(e) => alterar(m.id, a.id, { sku: e.target.value })} />
                </label>
              </div>
            );
          })}
        </fieldset>
      ))}
    </div>
  );
}

function PassoModelo({ f, ativas, onMudar }: PassoProps & { ativas: { m: FamiliaCfg["medidas"][number]; a: FamiliaCfg["acabamentos"][number] }[] }) {
  const ficheiros = ficheirosCompativeis(f.tipo);
  if (ficheiros.length === 0) return <p className="text-[15px]">Este tipo de produto não tem modelo 3D do fabricante: todas as combinações usam o modelo genérico.</p>;
  const escolher = (k: string, v: string) => { const glb = { ...f.glb }; if (v === SEM_GLB) delete glb[k]; else glb[k] = v; onMudar({ ...f, glb }); };
  return (
    <div className="grid gap-2">
      <p className="text-sm text-muted-foreground">Para cada combinação ativa, escolha um modelo 3D do fabricante (GLB) ou deixe o modelo genérico, que usa as medidas e a cor da família.</p>
      {ativas.map(({ m, a }) => {
        const k = celulaKey(m.id, a.id), rot = `${nomeMedida(f, m.id)} × ${nomeAcab(f, a.id)}`, v = f.glb?.[k] ?? SEM_GLB;
        return (
          <div key={k} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2">
            <label className="grid min-w-0 flex-1 gap-1 text-sm font-medium">{rot}
              <select aria-label={`Modelo 3D de ${rot}`} className={INP} value={v} onChange={(e) => escolher(k, e.target.value)}>
                <option value={SEM_GLB}>Modelo genérico</option>
                {ficheiros.map((x) => <option key={x.ficheiro} value={chaveFicheiro(x.familia, x.modelo, x.acab)}>{x.marca} · {x.modelo} · {x.acab}</option>)}
              </select>
            </label>
            <span className="rounded bg-muted px-1.5 text-xs text-muted-foreground">{v === SEM_GLB ? "Modelo genérico" : "3D do fabricante"}</span>
          </div>
        );
      })}
    </div>
  );
}

function PassoPrevisao({ f, erros, escolha, onEscolha }: { f: FamiliaCfg; erros: readonly string[]; escolha: { med?: string; acab?: string }; onEscolha: (e: { med?: string; acab?: string }) => void }) {
  if (erros.length > 0) return <Erros erros={erros} />;
  const fam = paraFamilia(f);
  return (
    <div className="grid gap-2">
      <p className="text-sm text-muted-foreground">É assim que o cartão aparece na barra de produtos. «Guardar na sessão» põe-na lá, na categoria {CATEGORIAS_FAMILIA.find((c) => c.id === f.categoria)?.rotulo}; depois arrasta-se para a planta como as outras.</p>
      <ul aria-label="Pré-visualização da família" className="flex flex-wrap gap-3">
        <CartaoFamilia f={fam} escolha={escolha} onEscolha={onEscolha} onPegar={semAcao} onMover={semAcao} onLargar={semAcao} onCancelar={semAcao} onJuntar={semAcao} />
      </ul>
      <p className="text-sm text-muted-foreground">Preços: {variantesDe(fam).map((v) => eur(v.preco)).filter((x, i, l) => l.indexOf(x) === i).join(", ")}.</p>
    </div>
  );
}

