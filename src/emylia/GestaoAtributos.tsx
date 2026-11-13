// 13/11: o ecrã de GESTÃO dos atributos do Catálogo (Medida, Cor, Tonalidade, Tipo de grelha, Textura, Brilho): criar e renomear atributos;
// criar, renomear, mudar a cor, ativar/desativar e ordenar opções. Só com products.edit (sem ela, leitura). Usa as peças do Catálogo
// (pecasForm, Amostra). Quem decide é a base (cat_* de 20270117600000): aqui só se mostra o que ela devolve e se relê depois de cada gravação.
// A Medida é fixa (2D/3D + números, escreve-se em cada produto): só informação. Os atributos não se desativam.
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronUp, Loader2, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CAMPO, NOTA, Campo, Chips } from "./pecasForm";
import { Amostra } from "./AtributosProduto";
import { normalizarHex } from "./atributosTexto";
import { AINDA_NAO, criarOpcaoAtributo, type FichaProdutoReal } from "./fichaProdutoDados";
import {
  editarOpcao, guardarAtributo, lerAtributosGestao, reordenarOpcoes, type AtributoGestao, type OpcaoGestao, type ResG,
} from "./atributosGestao";

const BOTAO_ICONE = "grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40";
const BOTAO_TEXTO = "inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-input px-3.5 text-[15px] text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50";
const CARTAO = "rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-sm)] sm:p-5";
const ENTRA = "motion-safe:animate-in motion-safe:fade-in-0";
const SEM_PERMISSAO = "Não tem permissão para ver os atributos.";

const produtos = (n: number) => `${n} produto${n === 1 ? "" : "s"}`;

type Aberto =
  | { t: "novoAtributo" }
  | { t: "renomear"; id: string }
  | { t: "novaOpcao"; id: string }
  | { t: "editarOpcao"; id: string };
/** O que espera confirmação: mudar o nome/cor de uma opção, ou o nome de um atributo, quando há produtos (ou não se sabe) a usá-lo. */
type Pendente = { t: "opcao"; nome: string | null; hex: string | null; opcao: OpcaoGestao } | { t: "atributo"; atributo: AtributoGestao; nome: string };
/** O erro fica no sítio onde a ação foi feita: "novo", "ren:<atributo>", "nova:<atributo>", "ed:<opção>" ou "atr:<atributo>" (ativar, ordenar). */
interface Erro { onde: string; msg: string }

/* ------------------------------------------------------------------ formulário de uma opção (criar e editar) */
function OpcaoForm({ temHex, inicial, rotulo, criar, bloqueado, erro, idGuardar, onEnviar, onCancelar }: {
  temHex: boolean; inicial: { nome: string; hex: string | null }; rotulo: string; criar: boolean; bloqueado: boolean; erro: string | null; idGuardar: string;
  onEnviar: (nome: string, hex: string | null) => void; onCancelar: () => void;
}) {
  const [nome, setNome] = useState(inicial.nome), [hex, setHex] = useState(inicial.hex ?? "");
  const msgHex = useId(), dica = useId();
  const hexOk = temHex ? normalizarHex(hex) : null;
  const hexVazio = hex.trim() === "";
  // a cor é obrigatória ao criar e quando a opção já a tinha; uma opção sem hex pode continuar sem
  const hexObrigatorio = temHex && hexVazio && (criar || inicial.hex != null);
  const hexFormato = temHex && !hexVazio && !hexOk;
  const mudou = criar || nome.trim() !== inicial.nome || (temHex && !hexVazio && (hexOk ?? null) !== (inicial.hex?.toUpperCase() ?? null));
  const pode = !!nome.trim() && !hexObrigatorio && !hexFormato && mudou && !bloqueado;
  // a razão de o botão estar desligado, escrita (nunca só «cinzento»)
  const razao = !nome.trim() ? (criar ? null : "Escreva o nome da opção.") : hexObrigatorio ? "A cor é obrigatória." : hexFormato ? null : !mudou ? "Altere o nome ou a cor para guardar." : null;
  return (
    <div className={cn("grid gap-3 rounded-xl border border-border bg-card p-3", ENTRA)}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rot="Nome da opção">{(id) => <input id={id} value={nome} onChange={(e) => setNome(e.target.value)} className={CAMPO} autoFocus />}</Campo>
        {temHex && (
          <Campo rot="Cor em hexadecimal (#RRGGBB)" dica={criar ? "Obrigatório nas cores. Ex.: #1A2B3C" : undefined}>{(id) => (
            <>
              <span className="flex items-center gap-2">
                <Amostra hex={hexOk} />
                <input id={id} value={hex} onChange={(e) => setHex(e.target.value)} placeholder="#RRGGBB" maxLength={7} autoCapitalize="off" spellCheck={false}
                  aria-invalid={hexFormato} aria-describedby={hexFormato ? msgHex : undefined} className={cn(CAMPO, "tabular-nums")} />
              </span>
              {hexFormato && <span id={msgHex} className="text-sm text-destructive">Use o formato #RRGGBB, por exemplo #1A2B3C.</span>}
            </>
          )}</Campo>
        )}
      </div>
      {erro && <p className="text-[15px] text-destructive" role="alert">{erro}</p>}
      {razao && <p id={dica} className="text-sm text-muted-foreground">{razao}</p>}
      <div className="flex flex-wrap gap-2">
        <Button id={idGuardar} className="min-h-11 text-[15px]" disabled={!pode} aria-describedby={razao ? dica : undefined} onClick={() => onEnviar(nome.trim(), hexOk)}>{rotulo}</Button>
        <Button variant="outline" className="min-h-11 text-[15px]" onClick={onCancelar} disabled={bloqueado}>Cancelar</Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ confirmação no próprio ecrã */
function Confirmar({ p, aGravar, erro, onConfirmar, onVoltar }: { p: Pendente; aGravar: boolean; erro: string | null; onConfirmar: () => void; onVoltar: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const tit = useId(), desc = useId();
  useEffect(() => { ref.current?.focus(); }, []);
  const n = p.t === "opcao" ? p.opcao.usados : p.atributo.usados;
  const titulo = p.t === "atributo"
    ? `Mudar o nome de «${p.atributo.nome}» para «${p.nome}»?`
    : `Mudar ${p.nome && p.hex ? "o nome e a cor" : p.nome ? "o nome" : "a cor"} de «${p.opcao.nome}»?`;
  const texto = p.t === "atributo"
    ? (n == null ? "Este atributo pode estar a ser usado por produtos: o novo nome aparece em todos." : `Este atributo é usado por ${produtos(n)}: o novo nome aparece em todos.`)
    : (n == null ? "Esta opção pode estar a ser usada por produtos: a mudança vai a todos." : `Esta opção é usada por ${produtos(n)}: a mudança altera ${n === 1 ? "esse produto" : `esses ${n} produtos`}.`);
  // grupo (não modal): o resto do ecrã continua à vista; o foco vai para aqui ao abrir
  return (
    <div ref={ref} tabIndex={-1} role="group" aria-labelledby={tit} aria-describedby={desc} onKeyDown={(e) => { if (e.key === "Escape" && !aGravar) { e.stopPropagation(); onVoltar(); } }}
      className={cn("grid gap-3 rounded-xl border border-primary/40 bg-primary/5 p-3 outline-none", ENTRA)}>
      <p id={tit} className="text-[15px] font-medium">{titulo}</p>
      <p id={desc} className={NOTA}>{texto}</p>
      {erro && <p className="text-[15px] text-destructive" role="alert">{erro}</p>}
      <div className="flex flex-wrap gap-2">
        <Button className="min-h-11 text-[15px]" disabled={aGravar} onClick={onConfirmar}>
          {aGravar && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}Confirmar
        </Button>
        <Button variant="outline" className="min-h-11 text-[15px]" disabled={aGravar} onClick={onVoltar}>Voltar</Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ o ecrã */
/** `embutido` (13/11): dentro do ecrã de gestão do Catálogo (GestaoCatalogo), que já tem o «Voltar ao Catálogo» e o título: aqui ficam só a nota e o conteúdo. */
export function GestaoAtributos({ real, voltar, anunciar, embutido = false }: { real: FichaProdutoReal; voltar: () => void; anunciar: (msg: string) => void; embutido?: boolean }) {
  const { org, podeEditar } = real;
  const [lista, setLista] = useState<AtributoGestao[] | null>(null);
  const [erroLeitura, setErroLeitura] = useState<string | null>(null);
  const [semPermissao, setSemPermissao] = useState(false);
  const [desatualizado, setDesatualizado] = useState(false);
  const [aGravar, setAGravar] = useState(false);
  const [aberto, setAberto] = useState<Aberto | null>(null);
  const [erro, setErro] = useState<Erro | null>(null);
  const [pend, setPend] = useState<Pendente | null>(null);
  const [foco, setFoco] = useState<string | null>(null);
  const temLista = useRef(false), ocupado = useRef(false), orgAtual = useRef(org);
  orgAtual.current = org;
  const msg = (onde: string) => (erro?.onde === onde ? erro.msg : null);

  const reler = useCallback(async () => {
    const deste = org;
    const r = await lerAtributosGestao(org);
    if (orgAtual.current !== deste) return; // a organização mudou entretanto: esta resposta já não vale
    if (r.ok) { temLista.current = true; setLista(r.v); setErroLeitura(null); setSemPermissao(false); setDesatualizado(false); return; }
    if (temLista.current) { setDesatualizado(true); return; }
    if (r.codigo === "CT001") { setSemPermissao(true); setErroLeitura(SEM_PERMISSAO); return; }
    setErroLeitura(r.erro);
  }, [org]);
  // ao mudar de organização, nada da anterior fica no ecrã
  useEffect(() => {
    temLista.current = false; ocupado.current = false;
    setLista(null); setErroLeitura(null); setSemPermissao(false); setDesatualizado(false); setAGravar(false); setAberto(null); setErro(null); setPend(null);
    void reler();
  }, [reler]);
  // depois de fechar um formulário, gravar ou mexer na ordem, o foco volta a um botão que exista (o primeiro da lista que esteja ativo)
  useEffect(() => {
    if (!foco) return;
    const el = foco.split("|").map((i) => document.getElementById(i) as HTMLButtonElement | null).find((x) => x && !x.disabled);
    el?.focus();
    setFoco(null);
  }, [foco, lista, aberto, pend]);

  /** Grava, relê SEMPRE (também se falhou: o ecrã não pode ficar a mentir) e avisa o Catálogo, também se falhou (tolerante). Devolve true se gravou. */
  const correr = async (op: () => Promise<ResG<unknown>>, aviso: string, onde: string): Promise<boolean> => {
    if (ocupado.current) return false;
    ocupado.current = true;
    setAGravar(true); setErro(null);
    try {
      const r = await op();
      await reler();
      try { await real.recarregar(); } catch { /* o Catálogo relê na próxima vez */ }
      if (!r.ok) { setErro({ onde, msg: r.erro }); return false; }
      anunciar(aviso);
      return true;
    } finally { ocupado.current = false; setAGravar(false); }
  };
  const abrir = (a: Aberto) => { setAberto(a); setErro(null); setPend(null); };
  const fechar = (focar?: string) => { setAberto(null); setErro(null); setPend(null); if (focar) setFoco(focar); };

  const criarAtributo = (nome: string, tipo: "lista" | "medida", temHex: boolean) =>
    void correr(() => guardarAtributo(org, { atributo: null, nome, tipo, temHex: tipo === "lista" && temHex }), `Atributo «${nome}» criado.`, "novo").then((ok) => { if (ok) fechar("novo-atributo"); });
  const gravarNomeAtributo = (a: AtributoGestao, nome: string) =>
    correr(() => guardarAtributo(org, { atributo: a.id, nome, tipo: null, temHex: null }), `Atributo «${nome}» guardado.`, `ren:${a.id}`).then((ok) => { if (ok) fechar(`ren-${a.id}`); });
  /** Renomear um atributo usado por produtos (ou de uso desconhecido) pede confirmação; sem produtos, grava logo. */
  const pedirRenomear = (a: AtributoGestao, nome: string) => {
    if (a.usados === 0) { void gravarNomeAtributo(a, nome); return; }
    setErro(null); setPend({ t: "atributo", atributo: a, nome });
  };
  const criarOpcaoNova = (a: AtributoGestao, nome: string, hex: string | null) =>
    void correr(() => criarOpcaoAtributo(org, a.id, nome, a.temHex ? hex : null), `Opção «${nome}» criada.`, `nova:${a.id}`).then((ok) => { if (ok) fechar(`nova-${a.id}`); });
  const gravarOpcao = (o: OpcaoGestao, nome: string | null, hex: string | null) =>
    correr(() => editarOpcao(org, o.id, { nome, hex, ativo: null }), `Opção «${nome ?? o.nome}» guardada.`, `ed:${o.id}`).then((ok) => { if (ok) fechar(`ed-${o.id}`); });
  /** Nome ou cor de uma opção usada por produtos: pede confirmação antes; sem uso (ou sem mudança dessas), grava logo. */
  const pedirGravarOpcao = (o: OpcaoGestao, nome: string, hex: string | null) => {
    const nomeNovo = nome !== o.nome ? nome : null;
    const hexNovo = hex && hex !== (o.hex?.toUpperCase() ?? null) ? hex : null;
    if (!nomeNovo && !hexNovo) { fechar(`ed-${o.id}`); return; }
    if (o.usados === 0) { void gravarOpcao(o, nomeNovo, hexNovo); return; }
    setErro(null); setPend({ t: "opcao", nome: nomeNovo, hex: hexNovo, opcao: o });
  };
  const confirmar = () => {
    if (!pend) return;
    if (pend.t === "atributo") void gravarNomeAtributo(pend.atributo, pend.nome); else void gravarOpcao(pend.opcao, pend.nome, pend.hex);
  };
  const voltarDaConfirmacao = () => {
    if (!pend) return;
    setFoco(pend.t === "atributo" ? `gn-${pend.atributo.id}` : `gu-${pend.opcao.id}`);
    setPend(null);
  };
  const ativar = (a: AtributoGestao, o: OpcaoGestao, ativo: boolean) =>
    void correr(() => editarOpcao(org, o.id, { nome: null, hex: null, ativo }), `Opção «${o.nome}» ${ativo ? "reativada" : "desativada"}.`, `atr:${a.id}`).then(() => setFoco(`act-${o.id}`));
  const mover = (a: AtributoGestao, i: number, d: -1 | 1) => {
    const ids = a.opcoes.map((x) => x.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    const id = a.opcoes[i].id;
    void correr(() => reordenarOpcoes(org, a.id, ids), `«${a.opcoes[i].nome}» passou para a posição ${i + d + 1} de ${a.opcoes.length}.`, `atr:${a.id}`).then(() => setFoco(d === 1 ? `desc-${id}|sub-${id}` : `sub-${id}|desc-${id}`));
  };

  return (
    <div className="grid gap-5">
      <div>
        {!embutido && (
          <>
            <button type="button" onClick={voltar} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-[15px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />Voltar ao Catálogo
            </button>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Atributos</h1>
          </>
        )}
        <p className={cn(NOTA, !embutido && "mt-1")}>Os atributos são os mesmos para toda a organização: cada produto escolhe quais tem e uma opção de cada.</p>
      </div>

      {lista && !podeEditar && <p role="note" className={cn(NOTA, "rounded-xl bg-muted/50 p-3")}>Só de leitura: para mudar os atributos precisa da permissão de editar produtos.</p>}
      {erroLeitura && (
        <div className="grid justify-items-start gap-2">
          <p className={erroLeitura === AINDA_NAO || semPermissao ? NOTA : "text-[15px] text-destructive"} role={erroLeitura === AINDA_NAO || semPermissao ? "status" : "alert"}>{erroLeitura}</p>
          {erroLeitura !== AINDA_NAO && !semPermissao && <Button variant="outline" className="min-h-11 text-[15px]" onClick={() => void reler()}>Tentar de novo</Button>}
        </div>
      )}
      {!lista && !erroLeitura && <p className={NOTA} role="status"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" aria-hidden="true" />A ler os atributos…</p>}
      {desatualizado && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/50 p-3 text-[15px]">
          <span>A lista pode estar desatualizada: não foi possível relê-la depois de gravar.</span>
          <Button variant="outline" className="min-h-11 text-[15px]" disabled={aGravar} onClick={() => void reler()}>Tentar de novo</Button>
        </div>
      )}

      {lista && (
        <>
          {podeEditar && (
            <div className="grid gap-3">
              <div>
                <button id="novo-atributo" type="button" aria-expanded={aberto?.t === "novoAtributo"} onClick={() => abrir({ t: "novoAtributo" })} className={BOTAO_TEXTO}>
                  <Plus className="h-4 w-4" aria-hidden="true" />Novo atributo
                </button>
              </div>
              {aberto?.t === "novoAtributo" && (
                <NovoAtributo aGravar={aGravar} erro={msg("novo")} onCriar={criarAtributo} onCancelar={() => fechar("novo-atributo")} />
              )}
            </div>
          )}
          {!lista.length && <p className={NOTA}>Ainda não há atributos.</p>}
          {lista.map((a) => (
            <Atributo key={a.id} a={a} podeEditar={podeEditar} aGravar={aGravar} aberto={aberto} msg={msg} pend={pend}
              abrir={abrir} fechar={fechar} onRenomear={pedirRenomear} onNovaOpcao={criarOpcaoNova} onPedirGravar={pedirGravarOpcao}
              onConfirmar={confirmar} onVoltarConfirmar={voltarDaConfirmacao} onAtivar={ativar} onMover={mover} />
          ))}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ novo atributo */
function NovoAtributo({ aGravar, erro, onCriar, onCancelar }: { aGravar: boolean; erro: string | null; onCriar: (nome: string, tipo: "lista" | "medida", temHex: boolean) => void; onCancelar: () => void }) {
  const [nome, setNome] = useState(""), [tipo, setTipo] = useState<"lista" | "medida">("lista"), [temHex, setTemHex] = useState(false);
  return (
    <div className={cn("grid gap-3 rounded-xl border border-border bg-card p-3", ENTRA)}>
      <Campo rot="Nome do atributo">{(id) => <input id={id} value={nome} onChange={(e) => setNome(e.target.value)} className={CAMPO} autoFocus />}</Campo>
      <div className="grid gap-1.5">
        <span className="text-[15px] font-medium">Tipo</span>
        <Chips<"lista" | "medida"> rot="Tipo do atributo" opcoes={[["lista", "Lista"], ["medida", "Medida"]] as const} v={tipo} set={setTipo} />
        <span className="text-sm text-muted-foreground">O tipo não se muda depois de criado.</span>
      </div>
      {tipo === "lista" && (
        <label className="flex min-h-11 items-center gap-2 text-[15px]">
          <input type="checkbox" checked={temHex} onChange={(e) => setTemHex(e.target.checked)} className="h-5 w-5 accent-primary" />
          Tem cor (hexadecimal)
        </label>
      )}
      {erro && <p className="text-[15px] text-destructive" role="alert">{erro}</p>}
      <div className="flex flex-wrap gap-2">
        <Button className="min-h-11 text-[15px]" disabled={!nome.trim() || aGravar} onClick={() => onCriar(nome.trim(), tipo, temHex)}>
          {aGravar && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}Criar atributo
        </Button>
        <Button variant="outline" className="min-h-11 text-[15px]" onClick={onCancelar} disabled={aGravar}>Cancelar</Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ um atributo e as suas opções */
interface AtributoProps {
  a: AtributoGestao; podeEditar: boolean; aGravar: boolean; aberto: Aberto | null; msg: (onde: string) => string | null; pend: Pendente | null;
  abrir: (a: Aberto) => void; fechar: (focar?: string) => void;
  onRenomear: (a: AtributoGestao, nome: string) => void; onNovaOpcao: (a: AtributoGestao, nome: string, hex: string | null) => void;
  onPedirGravar: (o: OpcaoGestao, nome: string, hex: string | null) => void; onConfirmar: () => void; onVoltarConfirmar: () => void;
  onAtivar: (a: AtributoGestao, o: OpcaoGestao, ativo: boolean) => void; onMover: (a: AtributoGestao, i: number, d: -1 | 1) => void;
}
function Atributo({ a, podeEditar, aGravar, aberto, msg, pend, abrir, fechar, onRenomear, onNovaOpcao, onPedirGravar, onConfirmar, onVoltarConfirmar, onAtivar, onMover }: AtributoProps) {
  const tit = useId();
  const [nome, setNome] = useState(a.nome);
  const aRenomear = aberto?.t === "renomear" && aberto.id === a.id;
  const aCriar = aberto?.t === "novaOpcao" && aberto.id === a.id;
  const pendAtributo = pend?.t === "atributo" && pend.atributo.id === a.id ? pend : null;
  const erroAtributo = msg(`atr:${a.id}`);
  return (
    <section aria-labelledby={tit} className={CARTAO}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={tit} className="text-lg font-semibold">{a.nome}</h2>
            <span className="rounded-md bg-muted px-2 py-0.5 text-sm text-muted-foreground">{a.tipo === "medida" ? "Medida" : a.temHex ? "Lista com cor" : "Lista"}</span>
          </div>
          {a.usados != null && <p className={NOTA}>{`Usado em ${produtos(a.usados)}`}</p>}
        </div>
        {podeEditar && (
          <button id={`ren-${a.id}`} type="button" aria-label={`Renomear o atributo ${a.nome}`} aria-expanded={aRenomear} onClick={() => { setNome(a.nome); abrir({ t: "renomear", id: a.id }); }} className={BOTAO_ICONE}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      {erroAtributo && <p className="mt-2 text-[15px] text-destructive" role="alert">{erroAtributo}</p>}

      {aRenomear && (
        <div className={cn("mt-3 grid gap-3 rounded-xl border border-border bg-card p-3", ENTRA)}>
          <Campo rot="Nome do atributo">{(id) => <input id={id} value={nome} onChange={(e) => setNome(e.target.value)} className={CAMPO} autoFocus />}</Campo>
          {!pendAtributo && msg(`ren:${a.id}`) && <p className="text-[15px] text-destructive" role="alert">{msg(`ren:${a.id}`)}</p>}
          <div className="flex flex-wrap gap-2">
            <Button id={`gn-${a.id}`} className="min-h-11 text-[15px]" disabled={aGravar || !!pendAtributo || !nome.trim() || nome.trim() === a.nome} onClick={() => onRenomear(a, nome.trim())}>Guardar nome</Button>
            <Button variant="outline" className="min-h-11 text-[15px]" disabled={aGravar || !!pendAtributo} onClick={() => fechar(`ren-${a.id}`)}>Cancelar</Button>
          </div>
          {pendAtributo && <Confirmar p={pendAtributo} aGravar={aGravar} erro={msg(`ren:${a.id}`)} onConfirmar={onConfirmar} onVoltar={onVoltarConfirmar} />}
        </div>
      )}

      {a.tipo === "medida" ? (
        <p className={cn(NOTA, "mt-3")}>Medida fixa: 2D ou 3D, com largura, comprimento (e espessura em 3D) em cm ou mm. Escreve-se em cada produto; não tem lista de opções nem cor.</p>
      ) : (
        <>
          {a.opcoes.length > 0 ? (
            <ul className="mt-3 grid gap-2">
              {a.opcoes.map((o, i) => {
                const pendOpcao = pend?.t === "opcao" && pend.opcao.id === o.id ? pend : null;
                return (
                  <li key={o.id} className="grid gap-2 rounded-xl bg-muted/50 p-2 pl-3">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      {a.temHex && <Amostra hex={o.hex} />}
                      <span className={cn("min-w-0 break-words text-[15px] font-medium", !o.ativo && "text-muted-foreground")}>{o.nome}{!o.ativo && " (desativada)"}</span>
                      {a.temHex && <span className="text-sm text-muted-foreground tabular-nums">{o.hex ?? "sem hex"}</span>}
                      {o.usados != null && <span className="text-sm text-muted-foreground">{produtos(o.usados)}</span>}
                      {podeEditar && (
                        <span className="ml-auto flex flex-wrap items-center gap-1">
                          <button id={`sub-${o.id}`} type="button" aria-label={`Subir ${o.nome}, posição ${i + 1} de ${a.opcoes.length}`} disabled={aGravar || i === 0} onClick={() => onMover(a, i, -1)} className={BOTAO_ICONE}>
                            <ChevronUp className="h-5 w-5" aria-hidden="true" />
                          </button>
                          <button id={`desc-${o.id}`} type="button" aria-label={`Descer ${o.nome}, posição ${i + 1} de ${a.opcoes.length}`} disabled={aGravar || i === a.opcoes.length - 1} onClick={() => onMover(a, i, 1)} className={BOTAO_ICONE}>
                            <ChevronDown className="h-5 w-5" aria-hidden="true" />
                          </button>
                          <button id={`ed-${o.id}`} type="button" aria-label={`Editar ${o.nome}`} aria-expanded={aberto?.t === "editarOpcao" && aberto.id === o.id} disabled={aGravar} onClick={() => abrir({ t: "editarOpcao", id: o.id })} className={BOTAO_ICONE}>
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <button id={`act-${o.id}`} type="button" aria-label={`${o.ativo ? "Desativar" : "Reativar"} ${o.nome}`} disabled={aGravar} onClick={() => onAtivar(a, o, !o.ativo)} className={cn(BOTAO_TEXTO, "border-transparent")}>
                            {o.ativo ? "Desativar" : "Reativar"}
                          </button>
                        </span>
                      )}
                    </div>
                    {podeEditar && aberto?.t === "editarOpcao" && aberto.id === o.id && (
                      <>
                        <OpcaoForm temHex={a.temHex} inicial={{ nome: o.nome, hex: o.hex }} rotulo="Guardar opção" criar={false} bloqueado={aGravar || !!pendOpcao}
                          erro={pendOpcao ? null : msg(`ed:${o.id}`)} idGuardar={`gu-${o.id}`}
                          onEnviar={(n, h) => onPedirGravar(o, n, h)} onCancelar={() => fechar(`ed-${o.id}`)} />
                        {pendOpcao && <Confirmar p={pendOpcao} aGravar={aGravar} erro={msg(`ed:${o.id}`)} onConfirmar={onConfirmar} onVoltar={onVoltarConfirmar} />}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : <p className={cn(NOTA, "mt-3")}>Ainda não tem opções.</p>}
          {podeEditar && (
            <div className="mt-3 grid gap-3">
              <div>
                <button id={`nova-${a.id}`} type="button" aria-label={`Nova opção em ${a.nome}`} aria-expanded={aCriar} onClick={() => abrir({ t: "novaOpcao", id: a.id })} className={cn(BOTAO_TEXTO, "border-dashed")}>
                  <Plus className="h-4 w-4" aria-hidden="true" />Nova opção…
                </button>
              </div>
              {aCriar && <OpcaoForm temHex={a.temHex} inicial={{ nome: "", hex: null }} rotulo="Criar opção" criar bloqueado={aGravar} erro={msg(`nova:${a.id}`)} idGuardar={`gc-${a.id}`}
                onEnviar={(n, h) => onNovaOpcao(a, n, h)} onCancelar={() => fechar(`nova-${a.id}`)} />}
            </div>
          )}
        </>
      )}
    </section>
  );
}
