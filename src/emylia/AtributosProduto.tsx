// 13/11: os atributos do produto (Medida, Cor, Tonalidade, Tipo de grelha, Textura, Brilho) no Catálogo: o bloco que escolhe, a amostra de cor,
// a opção nova e a linha curta da lista. A lista de atributos é global; o produto escolhe quais tem e UMA opção de cada (a Medida
// escreve-se, sem lista). Reaproveita as peças de pecasForm.tsx. Só aparece quando a base devolveu atributos
// (cat_ler_atributos); sem a função, K.atributos fica vazio e nada disto se vê.
import { useId, useMemo, useRef, useState } from "react";
import { Check, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CAMPO, CHIP, NOTA, Campo, Chips, Num, Retirar } from "./pecasForm";
import { mesmosAtributos, normalizarHex, resumoAtributos, textoMedida, textoValor } from "./atributosTexto";
import { criarOpcaoAtributo, gravarAtributos, lerNumero, type FichaProdutoReal } from "./fichaProdutoDados";
import { mudarCatalogo } from "./v2/catalogoStore";
import type { AtributoDef, AtributoProduto, MedidaAtributo, OpcaoAtributo, Produto } from "./v2/catalogoModelo";

/** O quadrado da cor. Sem hex: neutro, a tracejado. Nunca está sozinho: o nome e o hex vêm escritos ao lado. */
export function Amostra({ hex, testId }: { hex: string | null; testId?: string }) {
  return (
    <span aria-hidden="true" data-testid={testId} data-hex={hex ?? ""} style={hex ? { backgroundColor: hex } : undefined}
      className={cn("inline-block h-6 w-6 shrink-0 rounded-md", hex ? "border border-foreground/20" : "border border-dashed border-muted-foreground/60")} />
  );
}

/* ------------------------------------------------------------------ o que está escolhido, ainda por validar */
type Unidade = "cm" | "mm";
/** `texto`: o nome da opção escolhida; `inativa`: a opção foi desativada (já não vem na lista, mas o valor mantém-se). */
interface Linha { id: string; opcao: string | null; texto: string; inativa: boolean; tipo: "2D" | "3D"; l: string; c: string; e: string; un: Unidade }
const texto = (x: number | null | undefined) => (x == null ? "" : String(x).replace(".", ","));
const dosValores = (a: AtributoProduto): Linha => ({
  id: a.atributoId, opcao: a.opcaoId ?? null, texto: a.valor ?? "", inativa: !!a.inativa, tipo: a.medida?.tipo ?? "2D", l: texto(a.medida?.largura),
  c: texto(a.medida?.comprimento), e: texto(a.medida?.espessura), un: a.medida?.unidade ?? "cm",
});
const linhaNova = (id: string): Linha => ({ id, opcao: null, texto: "", inativa: false, tipo: "2D", l: "", c: "", e: "", un: "cm" });

/** A medida escrita, se estiver completa (largura e comprimento > 0; em 3D também a espessura). */
function medidaDe(L: Linha): MedidaAtributo | null {
  const l = lerNumero(L.l), c = lerNumero(L.c), e = lerNumero(L.e);
  if (!(l && l > 0) || !(c && c > 0)) return null;
  if (L.tipo === "3D") return e && e > 0 ? { tipo: "3D", largura: l, comprimento: c, espessura: e, unidade: L.un } : null;
  return { tipo: "2D", largura: l, comprimento: c, espessura: null, unidade: L.un };
}
/** Os atributos que já valem: uma opção (também a desativada: nunca se descarta um valor que o produto já tem) ou uma medida completa. */
function atributosDe(linhas: readonly Linha[], defs: readonly AtributoDef[]): AtributoProduto[] {
  return linhas.flatMap((L): AtributoProduto[] => {
    const d = defs.find((x) => x.id === L.id);
    if (!d) return [];
    if (d.tipo === "medida") { const m = medidaDe(L); return m ? [{ atributoId: d.id, medida: m, valor: textoMedida(m) }] : []; }
    if (!L.opcao) return [];
    const o = d.opcoes.find((x) => x.id === L.opcao);
    return [{ atributoId: d.id, opcaoId: L.opcao, valor: o ? o.nome || o.valor : L.texto, ...(!o && L.inativa ? { inativa: true as const } : {}) }];
  });
}

/* ------------------------------------------------------------------ opção nova */
function NovaOpcao({ def, org, aoCriar, fechar }: { def: AtributoDef; org: string; aoCriar: (o: OpcaoAtributo) => void; fechar: () => void }) {
  const [nome, setNome] = useState(""), [hex, setHex] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);
  const msgHex = useId();
  const hexOk = def.temHex ? normalizarHex(hex) : null;
  const hexErrado = def.temHex && hex.trim() !== "" && !hexOk;
  const pode = !!nome.trim() && (!def.temHex || !!hexOk) && !aGravar;
  const criar = async () => {
    setAGravar(true); setErro(null);
    const r = await criarOpcaoAtributo(org, def.id, nome.trim(), hexOk);
    setAGravar(false);
    if (!r.ok) { setErro(r.erro); return; }
    // a opção fica já no Catálogo em memória (a base devolve-a na próxima leitura)
    mudarCatalogo((K) => { K.atributos?.find((a) => a.id === def.id)?.opcoes.push(r.v); });
    aoCriar(r.v);
  };
  return (
    <div className="grid gap-3 rounded-xl border border-border bg-card p-3 motion-safe:animate-in motion-safe:fade-in-0">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rot="Nome da opção">{(id) => <input id={id} value={nome} onChange={(e) => setNome(e.target.value)} className={CAMPO} autoFocus />}</Campo>
        {def.temHex && (
          <Campo rot="Cor em hexadecimal (#RRGGBB)" dica="Obrigatório nas cores. Ex.: #1A2B3C">{(id) => (
            <>
              <span className="flex items-center gap-2">
                <Amostra hex={hexOk} testId="amostra-nova" />
                <input id={id} value={hex} onChange={(e) => setHex(e.target.value)} placeholder="#RRGGBB" maxLength={7} autoCapitalize="off" spellCheck={false}
                  aria-invalid={hexErrado} aria-describedby={hexErrado ? msgHex : undefined} className={cn(CAMPO, "tabular-nums")} />
              </span>
              {hexErrado && <span id={msgHex} className="text-sm text-destructive">Use o formato #RRGGBB, por exemplo #1A2B3C.</span>}
            </>
          )}</Campo>
        )}
      </div>
      {erro && <p className="text-[15px] text-destructive" role="alert">{erro}</p>}
      <div className="flex flex-wrap gap-2">
        <Button className="min-h-11 text-[15px]" disabled={!pode} onClick={() => void criar()}>
          {aGravar && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}Criar opção
        </Button>
        <Button variant="outline" className="min-h-11 text-[15px]" onClick={fechar}>Cancelar</Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ o editor */
/** Escolher os atributos de um produto. `inicial` é o que o produto já tem; `onChange` recebe, a cada escolha de quem usa o ecrã, só o que
 *  já vale (a medida só quando está completa). Com `real` (página real) e products.edit, cada atributo de lista deixa criar opções novas. */
export function AtributosEditor({ defs, inicial, onChange, real, vazio }: {
  defs: readonly AtributoDef[]; inicial: readonly AtributoProduto[]; onChange: (a: AtributoProduto[]) => void; real?: FichaProdutoReal; vazio?: string;
}) {
  const [linhas, setLinhas] = useState<Linha[]>(() => inicial.map(dosValores));
  const [aCriar, setACriar] = useState<string | null>(null);
  const botoes = useRef<Record<string, HTMLButtonElement | null>>({});
  /** Muda as linhas e avisa quem usa, no mesmo gesto (não num efeito, que reemitiria quando a lista de atributos muda de identidade). */
  const aplicar = (f: (L: Linha[]) => Linha[]) => { const n = f(linhas); setLinhas(n); onChange(atributosDe(n, defs)); };
  const mudar = (id: string, p: Partial<Linha>) => aplicar((L) => L.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const fechar = (id: string) => { setACriar(null); botoes.current[id]?.focus(); };
  const livres = defs.filter((d) => !linhas.some((L) => L.id === d.id));

  return (
    <div className="grid gap-3">
      {!linhas.length && vazio && <p className={NOTA}>{vazio}</p>}
      {linhas.map((L) => {
        const d = defs.find((x) => x.id === L.id);
        if (!d) return null;
        // a opção atual que a lista já não traz (desativada) fica escolhida e à vista
        const fora = L.opcao && !d.opcoes.some((o) => o.id === L.opcao) ? { id: L.opcao, nome: L.texto, inativa: L.inativa } : null;
        return (
          <div key={d.id} className="grid gap-2 rounded-xl bg-muted/50 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[15px] font-medium">{d.nome}</span>
              <Retirar rot={`Retirar o atributo ${d.nome}`} onClick={() => { aplicar((x) => x.filter((y) => y.id !== d.id)); if (aCriar === d.id) setACriar(null); }} />
            </div>
            {d.tipo === "medida" ? (
              <div className="grid gap-3">
                <Chips<"2D" | "3D"> rot="Tipo de medida" opcoes={[["2D", "2D"], ["3D", "3D"]] as const} v={L.tipo} set={(v) => mudar(d.id, { tipo: v })} />
                <div className="grid gap-3 sm:grid-cols-3">
                  <Campo rot="Largura">{(id) => <Num id={id} v={L.l} set={(v) => mudar(d.id, { l: v })} suf={L.un} ph="" />}</Campo>
                  <Campo rot="Comprimento">{(id) => <Num id={id} v={L.c} set={(v) => mudar(d.id, { c: v })} suf={L.un} ph="" />}</Campo>
                  {L.tipo === "3D" && <Campo rot="Espessura">{(id) => <Num id={id} v={L.e} set={(v) => mudar(d.id, { e: v })} suf={L.un} ph="" />}</Campo>}
                </div>
                <Chips<Unidade> rot="Unidade da medida" opcoes={[["cm", "cm"], ["mm", "mm"]] as const} v={L.un} set={(v) => mudar(d.id, { un: v })} />
                {!medidaDe(L) && <p className={NOTA}>Preencha a largura e o comprimento{L.tipo === "3D" ? " e a espessura" : ""} para a medida contar.</p>}
              </div>
            ) : (
              <>
                <div role="radiogroup" aria-label={d.nome} className="flex flex-wrap gap-2">
                  {d.opcoes.map((o) => {
                    const on = L.opcao === o.id;
                    return (
                      <button key={o.id} type="button" role="radio" aria-checked={on} onClick={() => mudar(d.id, { opcao: o.id, texto: o.nome || o.valor, inativa: false })} className={CHIP(on)}>
                        {on && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}
                        {d.temHex && <Amostra hex={o.hex} />}
                        <span>{o.nome || o.valor}{d.temHex && <>{" "}<span className="text-sm text-muted-foreground tabular-nums">{o.hex ?? "sem hex"}</span></>}</span>
                      </button>
                    );
                  })}
                  {fora && (
                    <button type="button" role="radio" aria-checked className={CHIP(true)} onClick={() => undefined}>
                      <Check className="h-4 w-4 text-primary" aria-hidden="true" />
                      {d.temHex && <Amostra hex={null} />}
                      <span>{fora.nome}{fora.inativa ? " (desativada)" : ""}</span>
                    </button>
                  )}
                </div>
                {!L.opcao && <p className={NOTA}>Escolha uma opção para o atributo contar.</p>}
                {real?.podeEditar && (
                  <div>
                    <button type="button" ref={(el) => { botoes.current[d.id] = el; }} aria-label={`Nova opção em ${d.nome}`} aria-expanded={aCriar === d.id} onClick={() => setACriar(d.id)}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-dashed border-input px-3.5 text-[15px] text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25">
                      <Plus className="h-4 w-4" aria-hidden="true" />Nova opção…
                    </button>
                  </div>
                )}
                {real?.podeEditar && aCriar === d.id && (
                  <NovaOpcao def={d} org={real.org} fechar={() => fechar(d.id)}
                    aoCriar={(o) => { mudar(d.id, { opcao: o.id, texto: o.nome || o.valor, inativa: false }); fechar(d.id); }} />
                )}
              </>
            )}
          </div>
        );
      })}
      {livres.length > 0 && (
        <select aria-label="Juntar atributo" value="" onChange={(e) => { const id = e.target.value; if (id) aplicar((L) => [...L, linhaNova(id)]); }} className={cn(CAMPO, "sm:w-72")}>
          <option value="">Juntar atributo…</option>
          {livres.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
        </select>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ onde se usa */
/** Na criação do produto (secção «O produto»): o mesmo estilo do campo «Imagem». Sem atributos na base não mostra nada. */
export function AtributosCriar({ defs, onChange, real }: { defs?: readonly AtributoDef[]; onChange: (a: AtributoProduto[]) => void; real?: FichaProdutoReal }) {
  if (!defs?.length) return null;
  return (
    <div role="group" aria-label="Atributos do produto" className="grid gap-1.5">
      <span className="text-[15px] font-medium">Atributos</span>
      <AtributosEditor defs={defs} inicial={[]} onChange={onChange} real={real} />
    </div>
  );
}

/** Na ficha (dentro da secção «Atributos»): grava direto por cat_guardar_produto_atributos e relê o Catálogo. Sem products.edit só se lê. */
export function AtributosFicha({ p, defs, real, anunciar }: { p: Produto; defs: readonly AtributoDef[]; real: FichaProdutoReal; anunciar: (msg: string) => void }) {
  const [attrs, setAttrs] = useState<AtributoProduto[]>(p.attrs ?? []);
  const [aGravar, setAGravar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const sem = "Este produto ainda não tem atributos.";
  if (!real.podeEditar) {
    const L = (p.attrs ?? []).flatMap((a) => {
      const d = defs.find((x) => x.id === a.atributoId);
      if (!d) return [];
      const o = d.opcoes.find((x) => x.id === a.opcaoId);
      const t = textoValor(d, a) + (a.inativa ? " (desativada)" : "");
      return t ? [{ d, t, hex: d.temHex ? o?.hex ?? null : undefined }] : [];
    });
    return L.length ? (
      <ul className="mt-3 grid gap-1.5">
        {L.map(({ d, t, hex }) => (
          <li key={d.id} className="flex items-center gap-2 text-[15px]">
            {hex !== undefined && <Amostra hex={hex} />}<span>{d.nome}: {t}</span>{hex && <span className="text-sm text-muted-foreground tabular-nums">{hex}</span>}
          </li>
        ))}
      </ul>
    ) : <p className={cn(NOTA, "mt-3")}>{sem}</p>;
  }
  const mudou = !mesmosAtributos(attrs, p.attrs);
  const gravar = async () => {
    setAGravar(true); setErro(null);
    const r = await gravarAtributos(real.org, p.id, attrs);
    if (!r.ok || !r.v.ok) { setAGravar(false); setErro(r.ok ? "Não foi possível gravar os atributos." : r.erro); return; }
    anunciar(`Atributos de ${p.n} guardados.`);
    try { await real.recarregar(); } catch { /* fica o que está */ }
    setAGravar(false);
  };
  return (
    <div className="mt-4 grid gap-3">
      <AtributosEditor defs={defs} inicial={p.attrs ?? []} onChange={setAttrs} real={real} vazio={sem} />
      <div>
        <Button className="min-h-11 text-[15px]" disabled={aGravar || !mudou} onClick={() => void gravar()}>
          {aGravar && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}Guardar atributos
        </Button>
      </div>
      {erro && <p className="text-[15px] text-destructive" role="alert">{erro}</p>}
    </div>
  );
}

/** A linha curta de um produto na lista: «Cor: Preto · Medida: 60×60 cm». Sem atributos não mostra nada. */
export function ResumoAtributos({ p, defs }: { p: Pick<Produto, "attrs">; defs?: readonly AtributoDef[] }) {
  const t = useMemo(() => resumoAtributos(p.attrs, defs), [p.attrs, defs]);
  return t ? <span className={cn(NOTA, "block")}>{t}</span> : null;
}
