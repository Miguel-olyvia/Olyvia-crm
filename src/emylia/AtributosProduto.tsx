// 13/11: os atributos do produto (Medida, Cor, Tonalidade, Tipo de grelha, Textura, Brilho) no Catálogo: o bloco que escolhe, a amostra de cor,
// a opção nova e a linha curta da lista. A lista de atributos é global; o produto escolhe quais tem e UMA opção de cada (a Medida
// escreve-se, sem lista). Reaproveita as peças de pecasForm.tsx. Só aparece quando a base devolveu atributos
// (cat_ler_atributos); sem a função, K.atributos fica vazio e nada disto se vê.
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CAMPO, NOTA, Campo, Chips, Num, Retirar } from "./pecasForm";
import { ListaFlutuante } from "./listaFlutuante";
import { AmostraOpcao } from "./AmostraOpcao";
import { DIMENSOES_1D, dimensaoParaTexto, dimensaoVazia, errosDimensao, lerDimensao, mesmosAtributos, normalizarHex, resumoAtributos, rotuloValor1D, textoMedida, textoValor, type DimensaoTexto } from "./atributosTexto";
import { criarOpcaoAtributo, gravarAtributos, type FichaProdutoReal } from "./fichaProdutoDados";
import { mudarCatalogo } from "./v2/catalogoStore";
import type { AtributoDef, AtributoProduto, DimensaoUnica, MedidaAtributo, OpcaoAtributo, Produto } from "./v2/catalogoModelo";

/* ------------------------------------------------------------------ o que está escolhido, ainda por validar */
type Unidade = "cm" | "mm";
/** `texto`: o nome da opção escolhida; `inativa`: a opção foi desativada (já não vem na lista, mas o valor mantém-se). */
type TipoMedida = "1D" | "2D" | "3D";
/** `l`, `c`, `e`: as dimensões de 2D/3D; `dim` e `v`: a dimensão e o valor de 1D. Os campos que não se aplicam ao tipo escolhido ficam em memória mas não se enviam. */
interface Linha { id: string; opcao: string | null; texto: string; inativa: boolean; tipo: TipoMedida; l: DimensaoTexto; c: DimensaoTexto; e: DimensaoTexto; dim: DimensaoUnica | null; v: DimensaoTexto; un: Unidade }
const dosValores = (a: AtributoProduto): Linha => {
  const m = a.medida, m1 = m?.tipo === "1D" ? m : null, m23 = m && m.tipo !== "1D" ? m : null;
  return {
    id: a.atributoId, opcao: a.opcaoId ?? null, texto: a.valor ?? "", inativa: !!a.inativa, tipo: m?.tipo ?? "2D", l: dimensaoParaTexto(m23?.largura),
    c: dimensaoParaTexto(m23?.comprimento), e: dimensaoParaTexto(m23?.espessura), dim: m1?.dimensao ?? null, v: dimensaoParaTexto(m1?.valor), un: m?.unidade ?? "cm",
  };
};
const linhaNova = (id: string): Linha => ({ id, opcao: null, texto: "", inativa: false, tipo: "2D", l: dimensaoVazia(), c: dimensaoVazia(), e: dimensaoVazia(), dim: null, v: dimensaoVazia(), un: "cm" });

/** A medida escrita, se estiver completa (cada dimensão um número > 0 ou um intervalo de < até; em 3D também a espessura; em 1D a dimensão e o valor). */
function medidaDe(L: Linha): MedidaAtributo | null {
  if (L.tipo === "1D") { const v = lerDimensao(L.v).v; return L.dim && v != null ? { tipo: "1D", dimensao: L.dim, valor: v, unidade: L.un } : null; }
  const l = lerDimensao(L.l).v, c = lerDimensao(L.c).v, e = lerDimensao(L.e).v;
  if (l == null || c == null) return null;
  if (L.tipo === "3D") return e != null ? { tipo: "3D", largura: l, comprimento: c, espessura: e, unidade: L.un } : null;
  return { tipo: "2D", largura: l, comprimento: c, espessura: null, unidade: L.un };
}

/** Uma dimensão da medida: um campo, ou (com «Intervalo») dois, «de» e «até». O erro vem escrito junto ao campo e ligado a ele. */
function Dimensao({ rot, d, un, set }: { rot: string; d: DimensaoTexto; un: Unidade; set: (p: DimensaoTexto, emitir?: boolean) => void }) {
  const uid = useId(), idCampo = `${uid}-campo`, idRot = `${uid}-rot`, idErroA = `${uid}-erro-a`, idErroB = `${uid}-erro-b`;
  const erros = errosDimensao(d);
  const campo = (e: string | null, idErro: string) => ({ suf: un, ph: "", invalido: !!e, descr: e ? idErro : undefined });
  const msg = (e: string | null, idErro: string) => e && <span id={idErro} role="alert" className="text-sm text-destructive">{e}</span>;
  // marcar/desmarcar só muda o ecrã: o «até» fica em memória (`b`) e a medida anterior só é substituída quando a nova já vale
  const alternar = (iv: boolean) => { const n = { ...d, iv }; set(n, lerDimensao(n).v != null); };
  return (
    <div className="grid content-start gap-1.5">
      <div className="flex items-center justify-between gap-2">
        {d.iv ? <span id={idRot} className="text-[15px] font-medium">{rot}</span> : <label htmlFor={idCampo} className="text-[15px] font-medium">{rot}</label>}
        <label className="flex min-h-11 cursor-pointer items-center gap-1.5 text-sm text-muted-foreground">
          <input type="checkbox" aria-label={`${rot}: intervalo`} checked={d.iv} onChange={(e) => alternar(e.target.checked)} className="h-4 w-4 accent-primary" />
          Intervalo
        </label>
      </div>
      {d.iv ? (
        <div role="group" aria-labelledby={idRot} className="grid grid-cols-2 items-start gap-2">
          <div className="grid gap-1.5">
            <Num rot={`${rot} (de)`} v={d.a} set={(v) => set({ ...d, a: v })} {...campo(erros.a, idErroA)} />
            {msg(erros.a, idErroA)}
          </div>
          <div className="grid gap-1.5">
            <Num rot={`${rot} (até)`} v={d.b} set={(v) => set({ ...d, b: v })} {...campo(erros.b, idErroB)} />
            {msg(erros.b, idErroB)}
          </div>
        </div>
      ) : <>
        <Num id={idCampo} v={d.a} set={(v) => set({ ...d, a: v })} {...campo(erros.a, idErroA)} />
        {msg(erros.a, idErroA)}
      </>}
    </div>
  );
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
function NovaOpcao({ def, org, nomeInicial = "", aoCriar, fechar }: { def: AtributoDef; org: string; nomeInicial?: string; aoCriar: (o: OpcaoAtributo) => void; fechar: () => void }) {
  const [nome, setNome] = useState(nomeInicial), [hex, setHex] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);
  const msgHex = useId();
  const hexOk = def.temHex ? normalizarHex(hex) : null;
  const hexErrado = def.temHex && hex.trim() !== "" && !hexOk;
  // num atributo com foto o hex é opcional (a foto adiciona-se na gestão dos atributos); escrito, tem de estar bem
  const pode = !!nome.trim() && (!def.temHex || !!hexOk || (!!def.temFoto && hex.trim() === "")) && !aGravar;
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
          <Campo rot="Cor em hexadecimal (#RRGGBB)" dica={def.temFoto ? "Opcional: a foto da opção adiciona-se na gestão dos atributos. Ex.: #1A2B3C" : "Obrigatório nas cores. Ex.: #1A2B3C"}>{(id) => (
            <>
              <span className="flex items-center gap-2">
                <AmostraOpcao hex={hexOk} nome={nome} testId="amostra-nova" />
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

/* ------------------------------------------------------------------ o valor: combobox com pesquisa */
/** Escreve-se sem acentos nem maiúsculas. */
const semAcentos = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
/** A opção escolhida: pode ser uma que a lista já não traz (desativada). */
interface Escolhida { id: string; nome: string; hex: string | null; foto?: string | null; inativa: boolean }
type Item = { k: "opcao"; o: OpcaoAtributo } | { k: "nova" };

/** Dropdown com pesquisa em texto (combobox, padrão ARIA 1.2: input role=combobox, listbox de options, aria-activedescendant). Setas, Home, End,
 *  Enter e Esc. Com `onNova`, o último item é «Nova opção…». A opção desativada que o produto já tem aparece escolhida, mas não é escolhível de novo. */
function ComboOpcao({ rotulo, atributoId, opcoes, temHex, atual, onEscolher, onNova, registar }: {
  rotulo: string; atributoId: string; opcoes: readonly OpcaoAtributo[]; temHex: boolean; atual: Escolhida | null; onEscolher: (o: OpcaoAtributo) => void;
  onNova?: (nomeEscrito: string) => void; registar: (id: string, el: HTMLInputElement | null) => void;
}) {
  const lid = useId();
  const caixa = useRef<HTMLDivElement>(null); // a lista flutuante (portal) acompanha este wrapper
  const entradaRef = useCallback((el: HTMLInputElement | null) => registar(atributoId, el), [registar, atributoId]);
  const [q, setQ] = useState<string | null>(null); // o que se está a escrever; null = mostra a opção escolhida
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const filtradas = useMemo(() => {
    const t = semAcentos((q ?? "").trim());
    return t ? opcoes.filter((o) => semAcentos(`${o.nome || o.valor} ${o.valor} ${o.hex ?? ""}`).includes(t)) : [...opcoes];
  }, [opcoes, q]);
  const itens: Item[] = [...filtradas.map((o): Item => ({ k: "opcao", o })), ...(onNova ? [{ k: "nova" } as Item] : [])];
  const fechar = () => { setAberto(false); setQ(null); };
  const escolher = (i: Item) => { const nomeEscrito = (q ?? "").trim(); fechar(); if (i.k === "nova") onNova?.(nomeEscrito); else onEscolher(i.o); };
  // ao abrir, o item ativo é a opção escolhida (e a lista rola até ela); o texto do campo fica selecionado para escrever por cima
  const daEscolhida = opcoes.findIndex((o) => o.id === atual?.id);
  const abrir = (el?: HTMLInputElement) => { if (!aberto) { setAberto(true); setAtivo(Math.max(0, daEscolhida)); } el?.select(); };
  useEffect(() => {
    if (aberto && daEscolhida >= 0) document.getElementById(`${lid}-${daEscolhida}`)?.scrollIntoView?.({ block: "nearest" });
  }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps
  const valor = q ?? (atual ? `${atual.nome}${atual.inativa ? " (desativada)" : ""}` : "");
  const ativoId = aberto && itens[ativo] ? `${lid}-${ativo}` : undefined;
  /** Move a opção ativa (gesto de teclado) e traz-a à vista. */
  const vai = (i: number) => {
    const n = Math.max(0, Math.min(itens.length - 1, i));
    setAtivo(n);
    document.getElementById(`${lid}-${n}`)?.scrollIntoView?.({ block: "nearest" });
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Home e End movem o cursor enquanto se escreve: só são da lista com ela aberta e sem texto de pesquisa (ou com Ctrl)
    const daLista = aberto && (!q || e.ctrlKey);
    if (e.key === "ArrowDown") { e.preventDefault(); if (aberto) vai(ativo + 1); else abrir(e.currentTarget); }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (aberto) vai(ativo - 1); else abrir(e.currentTarget); }
    else if (e.key === "Home" && daLista) { e.preventDefault(); vai(0); }
    else if (e.key === "End" && daLista) { e.preventDefault(); vai(itens.length - 1); }
    else if (e.key === "Enter" && aberto) { e.preventDefault(); if (itens[ativo]) escolher(itens[ativo]); }
    else if (e.key === "Escape" && aberto) { e.preventDefault(); e.stopPropagation(); fechar(); }
    else if (e.key === "Tab") fechar();
  };
  return (
    <div ref={caixa} className="relative">
      {temHex && atual && q === null && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"><AmostraOpcao foto={atual.foto} hex={atual.hex} nome={atual.nome} /></span>}
      <input ref={entradaRef} type="text" role="combobox" aria-label={rotulo} aria-expanded={aberto} aria-controls={aberto ? lid : undefined} aria-autocomplete="list"
        aria-activedescendant={ativoId} autoComplete="off" spellCheck={false} value={valor} placeholder="Escolher ou escrever para procurar"
        onClick={(e) => { if (aberto) fechar(); else abrir(e.currentTarget); }} onFocus={(e) => e.currentTarget.select()} onChange={(e) => { setQ(e.target.value); setAberto(true); setAtivo(0); }} onBlur={fechar} onKeyDown={onKeyDown}
        className={cn(CAMPO, "pr-10", temHex && atual && q === null && "pl-12")} />
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      {/* a região de estado está sempre montada (só muda o texto), para os leitores de ecrã a anunciarem */}
      <span role="status" className="sr-only">{!aberto ? "" : filtradas.length === 0 ? "Nenhuma opção encontrada" : filtradas.length === 1 ? "1 opção" : `${filtradas.length} opções`}</span>
      {aberto && (
        <ListaFlutuante ancora={caixa} aoSairDaVista={fechar}>
        <ul id={lid} role="listbox" aria-label={rotulo}>
          {itens.map((i, k) => (
            <li key={i.k === "nova" ? "nova" : i.o.id} id={`${lid}-${k}`} role="option" aria-selected={k === ativo}
              onClick={() => escolher(i)} onMouseEnter={() => setAtivo(k)}
              className={cn("flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-[15px]", k === ativo && "bg-muted")}>
              {i.k === "nova"
                ? <><Plus className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />Nova opção…</>
                : <>
                  {temHex && <AmostraOpcao foto={i.o.foto} hex={i.o.hex} nome={i.o.nome || i.o.valor} />}
                  <span className="min-w-0 flex-1">{i.o.nome || i.o.valor}{temHex && (i.o.hex || !i.o.foto) && <>{" "}<span className="text-sm text-muted-foreground tabular-nums">{i.o.hex ?? "sem hex"}</span></>}{atual?.id === i.o.id && <>{" "}<span className="sr-only">(escolhida)</span></>}</span>
                  {atual?.id === i.o.id && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
                </>}
            </li>
          ))}
          {!filtradas.length && <li role="presentation" className="px-3 py-2.5 text-[15px] text-muted-foreground">Nenhuma opção encontrada</li>}
        </ul>
        </ListaFlutuante>
      )}
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
  const [aCriar, setACriar] = useState<{ id: string; nome: string } | null>(null);
  const entradas = useRef<Record<string, HTMLInputElement | null>>({});
  const registar = useCallback((id: string, el: HTMLInputElement | null) => { entradas.current[id] = el; }, []);
  /** Muda as linhas e avisa quem usa, no mesmo gesto (não num efeito, que reemitiria quando a lista de atributos muda de identidade). */
  const aplicar = (f: (L: Linha[]) => Linha[], emitir = true) => { const n = f(linhas); setLinhas(n); if (emitir) onChange(atributosDe(n, defs)); };
  const mudar = (id: string, p: Partial<Linha>, emitir = true) => aplicar((L) => L.map((x) => (x.id === id ? { ...x, ...p } : x)), emitir);
  const fechar = (id: string) => { setACriar(null); entradas.current[id]?.focus(); };
  const livres = defs.filter((d) => !linhas.some((L) => L.id === d.id));

  return (
    <div className="grid gap-3">
      {!linhas.length && vazio && <p className={NOTA}>{vazio}</p>}
      {linhas.map((L) => {
        const d = defs.find((x) => x.id === L.id);
        if (!d) return null;
        // a opção atual: a da lista, ou (desativada) uma que a lista já não traz, que fica escolhida e à vista
        const na = L.opcao ? d.opcoes.find((o) => o.id === L.opcao) : undefined;
        const atual: Escolhida | null = L.opcao ? { id: L.opcao, nome: na ? na.nome || na.valor : L.texto, hex: na?.hex ?? null, foto: na?.foto ?? null, inativa: !na && L.inativa } : null;
        return (
          <div key={d.id} className="grid gap-2 rounded-xl bg-muted/50 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[15px] font-medium">{d.nome}</span>
              <Retirar rot={`Retirar o atributo ${d.nome}`} onClick={() => { aplicar((x) => x.filter((y) => y.id !== d.id)); if (aCriar?.id === d.id) setACriar(null); }} />
            </div>
            {d.tipo === "medida" ? (
              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <span aria-hidden="true" className="text-sm text-muted-foreground">Tipo de medida</span>
                  <Chips<TipoMedida> rot="Tipo de medida" opcoes={[["1D", "1D"], ["2D", "2D"], ["3D", "3D"]] as const} v={L.tipo} set={(v) => mudar(d.id, { tipo: v })} />
                </div>
                {L.tipo === "1D" ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid content-start gap-1.5">
                      <span aria-hidden="true" className="text-sm text-muted-foreground">Dimensão da medida</span>
                      <Chips<DimensaoUnica | null> rot="Dimensão da medida" opcoes={DIMENSOES_1D} v={L.dim} set={(v) => mudar(d.id, { dim: v })} />
                    </div>
                    <Dimensao rot={rotuloValor1D(L.dim)} d={L.v} un={L.un} set={(v, emitir) => mudar(d.id, { v }, emitir)} />
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Dimensao rot="Largura" d={L.l} un={L.un} set={(v, emitir) => mudar(d.id, { l: v }, emitir)} />
                    <Dimensao rot="Comprimento" d={L.c} un={L.un} set={(v, emitir) => mudar(d.id, { c: v }, emitir)} />
                    {L.tipo === "3D" && <Dimensao rot="Espessura" d={L.e} un={L.un} set={(v, emitir) => mudar(d.id, { e: v }, emitir)} />}
                  </div>
                )}
                <Chips<Unidade> rot="Unidade da medida" opcoes={[["cm", "cm"], ["mm", "mm"]] as const} v={L.un} set={(v) => mudar(d.id, { un: v })} />
                {!medidaDe(L) && <p className={NOTA}>{L.tipo === "1D" ? "Escolha a dimensão e preencha o valor para a medida contar." : `Preencha a largura e o comprimento${L.tipo === "3D" ? " e a espessura" : ""} para a medida contar.`}</p>}
                {L.tipo === "1D" && !medidaDe(L) && inicial.some((a) => a.atributoId === d.id && a.medida) && <p role="status" className={NOTA}>Guardar assim remove a medida gravada.</p>}
              </div>
            ) : (
              <>
                <ComboOpcao rotulo={d.nome} atributoId={d.id} opcoes={d.opcoes} temHex={d.temHex} atual={atual} registar={registar}
                  onEscolher={(o) => mudar(d.id, { opcao: o.id, texto: o.nome || o.valor, inativa: false })}
                  onNova={real?.podeEditar ? (nome) => setACriar({ id: d.id, nome }) : undefined} />
                {!L.opcao && <p className={NOTA}>Escolha uma opção para o atributo contar.</p>}
                {real?.podeEditar && aCriar?.id === d.id && (
                  <NovaOpcao def={d} org={real.org} nomeInicial={aCriar.nome} fechar={() => fechar(d.id)}
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
      return t ? [{ d, t, hex: d.temHex ? o?.hex ?? null : undefined, foto: d.temHex ? o?.foto ?? null : null }] : [];
    });
    return L.length ? (
      <ul className="mt-3 grid gap-1.5">
        {L.map(({ d, t, hex, foto }) => (
          <li key={d.id} className="flex items-center gap-2 text-[15px]">
            {hex !== undefined && <AmostraOpcao foto={foto} hex={hex} nome={t} />}<span>{d.nome}: {t}</span>{hex && <span className="text-sm text-muted-foreground tabular-nums">{hex}</span>}
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
