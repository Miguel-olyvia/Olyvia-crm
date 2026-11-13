// 13/11: as peças que os ecrãs de gestão do Catálogo partilham (Categorias, Marcas): o aspeto dos botões e dos cartões, a confirmação no
// próprio ecrã, o formulário de um nome e a lógica de ler, gravar e reler. O comportamento é o de GestaoAtributos.tsx:
// grava, relê SEMPRE (também em falha), avisa o Catálogo, guarda de reentrada, erro por local e foco reposto.
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CAMPO, NOTA, Campo } from "./pecasForm";
import { AINDA_NAO, type FichaProdutoReal } from "./fichaProdutoDados";
import type { ResG } from "./atributosGestao";

/** O anel de foco com opacidade total (não ring-primary/25, que mal se vê). */
export const ANEL = "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";
export const BOTAO_ICONE = `grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground ${ANEL} aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-transparent disabled:pointer-events-none disabled:opacity-40`;
export const BOTAO_TEXTO = `inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-input px-3.5 text-[15px] text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:border-primary ${ANEL} aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-transparent disabled:pointer-events-none disabled:opacity-50`;
/** Para os botões de um ecrã que está a gravar: nada de disabled (o botão perdia o foco), mas aria-disabled, a razão ligada por aria-describedby e o clique sem efeito. */
export function protegido(razao: string | null, idRazao: string, acao: () => void) {
  return { "aria-disabled": razao ? (true as const) : undefined, "aria-describedby": razao ? idRazao : undefined, onClick: razao ? undefined : acao };
}
/** A razão de um botão desativado, só para quem ouve (o texto visível, se houver, leva o mesmo id). */
export const Razao = ({ id, children }: { id: string; children?: ReactNode }) => (children ? <span id={id} className="sr-only">{children}</span> : null);
export const CARTAO = "rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-sm)] sm:p-5";
export const ENTRA = "motion-safe:animate-in motion-safe:fade-in-0";

export const produtos = (n: number) => `${n} produto${n === 1 ? "" : "s"}`;

/** Um selo pequeno ao lado do nome («Desativada», «Partilhada»). */
export const Selo = ({ children }: { children: ReactNode }) => <span className="rounded-md bg-muted px-2 py-0.5 text-sm text-muted-foreground">{children}</span>;

/* ------------------------------------------------------------------ confirmação no próprio ecrã */
/** Grupo (não modal): o resto do ecrã continua à vista; o foco vai para aqui ao abrir. */
export function ConfirmarMudanca({ titulo, texto, aGravar, erro, onConfirmar, onVoltar }: {
  titulo: string; texto: string; aGravar: boolean; erro: string | null; onConfirmar: () => void; onVoltar: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const tit = useId(), desc = useId();
  useEffect(() => { ref.current?.focus(); }, []);
  const rz = useId();
  // Esc volta atrás (como «Voltar»), a não ser que esteja a gravar
  const tecla = (e: KeyboardEvent) => { if (e.key === "Escape" && !aGravar) { e.stopPropagation(); onVoltar(); } };
  return (
    <div ref={ref} tabIndex={-1} role="group" aria-labelledby={tit} aria-describedby={desc} onKeyDown={tecla} className={cn("grid gap-3 rounded-xl border border-primary/40 bg-primary/5 p-3 outline-none", ENTRA)}>
      <p id={tit} className="text-[15px] font-medium">{titulo}</p>
      <p id={desc} className={NOTA}>{texto}</p>
      {erro && <p className="text-[15px] text-destructive" role="alert">{erro}</p>}
      <div className="flex flex-wrap gap-2">
        <Button className="min-h-11 text-[15px] aria-disabled:cursor-not-allowed aria-disabled:opacity-50" {...protegido(aGravar ? "A guardar…" : null, rz, onConfirmar)}>
          {aGravar && <Loader2 className="mr-1 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}Confirmar
        </Button>
        <Button variant="outline" className="min-h-11 text-[15px] aria-disabled:cursor-not-allowed aria-disabled:opacity-50" {...protegido(aGravar ? "A guardar…" : null, rz, onVoltar)}>Voltar</Button>
        <Razao id={rz}>{aGravar ? "A guardar…" : null}</Razao>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ formulário de um nome (e, opcionalmente, de um site) */
export function FormNome({ rotuloNome, inicial, botao, aGravar, erro, idGuardar, comSite, siteInicial = "", bloqueado, onEnviar, onCancelar }: {
  rotuloNome: string; inicial: string; botao: string; aGravar: boolean; erro: string | null; idGuardar: string;
  comSite?: boolean; siteInicial?: string; bloqueado?: boolean; onEnviar: (nome: string, site: string) => void; onCancelar: () => void;
}) {
  const [nome, setNome] = useState(inicial), [site, setSite] = useState(siteInicial);
  const dica = useId();
  const mudou = nome.trim() !== inicial || site.trim() !== siteInicial;
  const pode = !!nome.trim() && mudou && !aGravar && !bloqueado;
  // a razão de o botão não valer, escrita; durante a gravação só se ouve, não se vê
  const porque = aGravar ? "A guardar…" : bloqueado ? "À espera da confirmação." : !nome.trim() ? "Escreva o nome." : !mudou ? "Altere o nome para guardar." : null;
  const visivel = !!porque && !aGravar && !(porque === "Escreva o nome." && !inicial);
  const enviar = () => { if (pode) onEnviar(nome.trim(), site.trim()); };
  const tecla = (e: KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); enviar(); } else if (e.key === "Escape" && !aGravar) { e.stopPropagation(); onCancelar(); } };
  return (
    <div className={cn("grid gap-3 rounded-xl border border-border bg-card p-3", ENTRA)}>
      <div className={cn("grid gap-3", comSite && "sm:grid-cols-2")}>
        <Campo rot={rotuloNome}>{(id) => <input id={id} value={nome} aria-invalid={!!erro} onChange={(e) => setNome(e.target.value)} onKeyDown={tecla} className={CAMPO} autoFocus />}</Campo>
        {comSite && <Campo rot="Site (opcional)" dica="Começa por https://, por exemplo https://marca.pt">{(id) => <input id={id} value={site} inputMode="url" placeholder="https://" autoCapitalize="off" spellCheck={false} onChange={(e) => setSite(e.target.value)} aria-invalid={!!erro} onKeyDown={tecla} className={CAMPO} />}</Campo>}
      </div>
      {erro && <p className="text-[15px] text-destructive" role="alert">{erro}</p>}
      {porque && <p id={dica} className={visivel ? "text-sm text-muted-foreground" : "sr-only"}>{porque}</p>}
      <div className="flex flex-wrap gap-2">
        <Button id={idGuardar} className="min-h-11 text-[15px] aria-disabled:cursor-not-allowed aria-disabled:opacity-50" {...protegido(pode ? null : porque, dica, enviar)}>
          {aGravar && <Loader2 className="mr-1 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}{botao}
        </Button>
        <Button variant="outline" className="min-h-11 text-[15px]" onClick={onCancelar} disabled={aGravar}>Cancelar</Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ ler, gravar e reler */
/** O erro fica no sítio onde a ação foi feita (uma chave por local). */
export interface ErroLocal { onde: string; msg: string }

export function useGestaoLista<T>(real: FichaProdutoReal, ler: (org: string) => Promise<ResG<T>>, anunciar: (msg: string) => void, semPermissaoTexto: string) {
  const { org } = real;
  const [lista, setLista] = useState<T | null>(null);
  const [erroLeitura, setErroLeitura] = useState<string | null>(null);
  const [semPermissao, setSemPermissao] = useState(false);
  const [desatualizado, setDesatualizado] = useState(false);
  const [aGravar, setAGravar] = useState(false);
  const [erro, setErro] = useState<ErroLocal | null>(null);
  const [foco, setFoco] = useState<string | null>(null);
  const temLista = useRef(false), ocupado = useRef(false), orgAtual = useRef(org);
  orgAtual.current = org;
  const msg = (onde: string) => (erro?.onde === onde ? erro.msg : null);

  const reler = useCallback(async () => {
    const deste = org;
    const r = await ler(org);
    if (orgAtual.current !== deste) return; // a organização mudou entretanto: esta resposta já não vale
    if (r.ok) { temLista.current = true; setLista(r.v); setErroLeitura(null); setSemPermissao(false); setDesatualizado(false); return; }
    if (temLista.current) { setDesatualizado(true); return; }
    if (r.codigo === "CT001") { setSemPermissao(true); setErroLeitura(semPermissaoTexto); return; }
    setErroLeitura(r.erro);
  }, [org, ler, semPermissaoTexto]);
  // ao mudar de organização, nada da anterior fica no ecrã
  useEffect(() => {
    temLista.current = false; ocupado.current = false;
    setLista(null); setErroLeitura(null); setSemPermissao(false); setDesatualizado(false); setAGravar(false); setErro(null);
    void reler();
  }, [reler]);
  // depois de fechar um formulário, gravar ou mexer na ordem, o foco volta a um botão que exista (o primeiro da lista que esteja ativo)
  useEffect(() => {
    if (!foco) return;
    const el = foco.split("|").map((i) => document.getElementById(i) as HTMLButtonElement | null).find((x) => x && !x.disabled && x.getAttribute("aria-disabled") !== "true");
    el?.focus();
    setFoco(null);
  }, [foco, lista]);

  /** Grava, relê SEMPRE (também se falhou: o ecrã não pode ficar a mentir) e avisa o Catálogo, também se falhou (tolerante). Devolve true se gravou. */
  const correr = async (op: () => Promise<ResG<unknown>>, aviso: string | ((v: unknown) => string), onde: string): Promise<boolean> => {
    if (ocupado.current) return false;
    ocupado.current = true;
    setAGravar(true); setErro(null);
    try {
      const r = await op();
      await reler();
      try { await real.recarregar(); } catch { /* o Catálogo relê na próxima vez */ }
      if (!r.ok) { setErro({ onde, msg: r.erro }); return false; }
      anunciar(typeof aviso === "string" ? aviso : aviso(r.v));
      return true;
    } finally { ocupado.current = false; setAGravar(false); }
  };
  return { lista, erroLeitura, semPermissao, desatualizado, aGravar, erro, setErro, msg, setFoco, reler, correr };
}

/** O que se mostra no topo de um separador: o que a leitura disse, «a ler…», o aviso de lista desatualizada. */
export function EstadoLeitura({ o, lido, nomes }: { o: { erroLeitura: string | null; semPermissao: boolean; desatualizado: boolean; aGravar: boolean; reler: () => Promise<void> }; lido: boolean; nomes: string }) {
  const { erroLeitura, semPermissao, desatualizado, aGravar, reler } = o;
  const calmo = erroLeitura === AINDA_NAO || semPermissao;
  return (
    <>
      {erroLeitura && (
        <div className="grid justify-items-start gap-2">
          <p className={calmo ? NOTA : "text-[15px] text-destructive"} role={calmo ? "status" : "alert"}>{erroLeitura}</p>
          {!calmo && <Button variant="outline" className="min-h-11 text-[15px]" onClick={() => void reler()}>Tentar de novo</Button>}
        </div>
      )}
      {!lido && !erroLeitura && <p className={NOTA} role="status"><Loader2 className="mr-1 inline h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />A ler {nomes}…</p>}
      {desatualizado && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/50 p-3 text-[15px]">
          <span>A lista pode estar desatualizada: não foi possível relê-la depois de gravar.</span>
          <Button variant="outline" className="min-h-11 text-[15px]" disabled={aGravar} onClick={() => void reler()}>Tentar de novo</Button>
        </div>
      )}
    </>
  );
}
