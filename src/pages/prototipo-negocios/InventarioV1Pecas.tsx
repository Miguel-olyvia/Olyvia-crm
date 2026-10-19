// As peças comuns do Inventário do V1 (19/10/2026): as classes, as secções, os avisos, as escolhas, os campos, a confirmação no sítio
// e o cartão "O que fazer agora" com o formulário de cada tarefa. Os ecrãs estão em InventarioV1*.tsx.
import { useEffect, useState, type ReactNode } from "react";
import {
  AlertCircle, ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, Check, CheckCircle2, HardHat, History, Home, Hourglass, Package, PackageCheck, SlidersHorizontal, Truck, Users, Warehouse,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ContadorQtd } from "./ContadorQtd";
import { poPorId } from "./inventario/base";
import { useInventario, type Resultado } from "./inventario/loja";
import { aprovar, darSaida, decidirPrecoNovo, encomendar, pedirOQueFalta, receber } from "./inventarioV1Acoes";
import { obraInv, qtd, type MatInv, type TarefaInv, type TipoLivro } from "./inventarioV1Docs";
import type { Ficha, SecInv } from "./inventarioV1Nav";
import type { EstadoMat } from "./obraOps";
import type { Ctx } from "./pecas";

export const LISTA = "divide-y divide-border rounded-2xl border border-border bg-card px-4 shadow-[var(--shadow-sm)] sm:px-5";
export const BLOCO = "rounded-2xl border border-border bg-card shadow-[var(--shadow-sm)]";
export const LINHA = "group flex min-h-16 w-full items-center gap-4 py-3 text-left hover:bg-muted/50 sm:px-2";
export const LIGACAO = "inline-flex min-h-11 items-center gap-1 text-[15px] font-medium text-primary underline-offset-4 hover:underline";
export const LIGACAO_RARA = "inline-flex min-h-11 items-center text-[15px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline";
export const CAMPO = "h-11 w-full rounded-lg border border-input bg-card px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25 aria-[invalid=true]:border-destructive";
export const ESCOLHA = (on: boolean): string => cn("min-h-11 shrink-0 rounded-lg border px-4 text-[15px] transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:border-foreground/40");
export const FILTRO = (on: boolean): string => cn("inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-[15px] transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:border-foreground/40");
export const FILA = "-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 sm:[mask-image:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,#000_calc(100%-2rem),transparent)]";
/** As tabelas (só no computador, a partir de lg): cabeçalho discreto, linhas de 56 px, números à direita. */
export const TABELA = "hidden w-full overflow-hidden lg:block " + BLOCO;
export const TH = "px-4 py-3 text-left text-sm font-medium text-muted-foreground first:pl-5 last:pr-5";
export const TD = "px-4 py-3 align-middle first:pl-5 last:pr-5";
export const SETA = <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />;

/* ---------------------------------------------------------------- as secções */

/** As secções do Inventário: o nome, o ícone e a frase que explica o ecrã. */
export const SECOES: { id: SecInv; t: string; Ic: LucideIcon; sub: string }[] = [
  { id: "inicio", t: "Início", Ic: Home, sub: "" },
  { id: "stock", t: "Stock", Ic: Warehouse, sub: "Tudo o que há no Armazém Central: quanto há, quanto está guardado para obras e quanto está livre." },
  { id: "obras", t: "Obras", Ic: HardHat, sub: "O material de cada obra, por fase. Quando o Financeiro valida o pagamento, o que há no armazém fica guardado para a obra e o que falta vai ao fornecedor." },
  { id: "encomendas", t: "Encomendas a fornecedores", Ic: Truck, sub: "O que se pediu aos fornecedores: por aprovar, a caminho e recebido. Quando a mercadoria chega, dá-se entrada aqui." },
  { id: "fornecedores", t: "Fornecedores", Ic: Users, sub: "A quem se compra, em quanto tempo entregam, os preços e as encomendas em aberto." },
  { id: "movimentos", t: "Movimentos", Ic: History, sub: "O livro de tudo o que entrou, saiu ou foi corrigido. Não se apaga: cada linha diz o quê, quanto e para onde." },
  { id: "carrinhas", t: "Carrinhas", Ic: Package, sub: "O que cada carrinha da Frota leva. Abaixo do mínimo, repõe-se a partir do Armazém Central." },
];
export const nomeSec = (s: SecInv): string => (s === "inicio" ? "Inventário" : SECOES.find((x) => x.id === s)!.t);

/** O que cada ecrã recebe da página. */
export interface Comum {
  ctx: Ctx; db: ReturnType<typeof useInventario>; ir: (x: Ficha, de?: string) => void; voltar: () => void; feito: (m: string) => void; msg: string;
  titulo: React.RefObject<HTMLHeadingElement>; sec: SecInv;
}

/* ---------------------------------------------------------------- avisos e cabeçalhos */

/** A mensagem do que acabou de se fazer (C24): diz o que ficou feito e desaparece sozinha. */
export function useFeito(): [string, (m: string) => void] {
  const [msg, setMsg] = useState("");
  useEffect(() => { if (!msg) return; const id = setTimeout(() => setMsg(""), 5000); return () => clearTimeout(id); }, [msg]);
  return [msg, setMsg];
}
export const Feito = ({ msg }: { msg: string }) => (
  <div role="status" className="min-h-0">
    {msg && (
      <p className="mt-6 flex items-center gap-3 rounded-xl border border-success/30 bg-success/[0.08] px-4 py-3 text-[15px] animate-in fade-in-0 slide-in-from-top-2 duration-500">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-success text-white"><Check className="h-4 w-4" aria-hidden="true" /></span>{msg}
      </p>
    )}
  </div>
);
export const Erro = ({ id, children }: { id?: string; children: ReactNode }) => (
  <p id={id} role="alert" className="flex items-center gap-2 text-[15px] font-medium text-destructive animate-in fade-in-0"><AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />{children}</p>
);

export function Voltar({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex min-h-11 items-center gap-2 rounded-lg text-[15px] text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {children}
    </button>
  );
}

/** O título da secção com a frase e, à direita (por baixo no telemóvel), as ações da secção. */
export function CabSecao({ titulo, h, sub, acoes }: { titulo: React.RefObject<HTMLHeadingElement>; h: string; sub: string; acoes?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 max-w-2xl flex-1">
        <h1 ref={titulo} tabIndex={-1} className="text-3xl font-semibold tracking-tight outline-none">{h}</h1>
        <p className="mt-1 text-base text-muted-foreground">{sub}</p>
      </div>
      {acoes && <div className="flex w-full flex-wrap gap-2 sm:w-auto">{acoes}</div>}
    </div>
  );
}

/** As iniciais num círculo (decorativo: o nome está ao lado). */
export const Iniciais = ({ nome, className }: { nome: string; className?: string }) => (
  <span aria-hidden="true" className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/10 text-[15px] font-semibold text-primary", className)}>
    {nome.replace(/\(.*\)/, "").split(/\s+/).filter((x) => x.length > 2 || /^[A-ZÁÉÍÓÚ]/.test(x)).slice(0, 2).map((x) => x[0].toUpperCase()).join("")}
  </span>
);

/* ---------------------------------------------------------------- estados */

/** O estado de um material em palavras, com o ícone (a cor só no ícone, F3). */
const ESTADO_MAT: Record<EstadoMat, { t: string; Ic: typeof Check; cor: string }> = {
  "na obra": { t: "já na obra", Ic: Check, cor: "text-success" },
  reservado: { t: "pronto no armazém", Ic: PackageCheck, cor: "text-success" },
  recebido: { t: "pronto no armazém", Ic: PackageCheck, cor: "text-success" },
  "a chegar": { t: "a chegar", Ic: Truck, cor: "text-primary" },
  encomendado: { t: "encomendado ao fornecedor", Ic: Truck, cor: "text-primary" },
  "por encomendar": { t: "encomenda por aprovar", Ic: Hourglass, cor: "text-warning" },
  "em falta": { t: "em falta", Ic: AlertCircle, cor: "text-destructive" },
};
export function EstadoMaterial({ m }: { m: Pick<MatInv, "estado" | "quando"> }) {
  const e = ESTADO_MAT[m.estado];
  return <span className="inline-flex items-center gap-1.5 text-[15px]"><e.Ic className={cn("h-4 w-4 shrink-0", e.cor)} aria-hidden="true" />{e.t}{m.quando ? " " + m.quando : ""}</span>;
}

/** O ícone do tipo de movimento: entrada, saída ou correção (num quadrado de cor suave, F18). */
export const TIPO_MOV: Record<TipoLivro, { t: string; Ic: LucideIcon; cor: string }> = {
  entradas: { t: "Entradas", Ic: ArrowDownLeft, cor: "bg-success/10 text-success" },
  saidas: { t: "Saídas", Ic: ArrowUpRight, cor: "bg-primary/10 text-primary" },
  correcoes: { t: "Correções", Ic: SlidersHorizontal, cor: "bg-warning/10 text-warning" },
};
export const IconeMov = ({ tipo, className }: { tipo: TipoLivro; className?: string }) => {
  const x = TIPO_MOV[tipo];
  return <span aria-hidden="true" className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", x.cor, className)}><x.Ic className="h-[18px] w-[18px]" /></span>;
};

/* ---------------------------------------------------------------- campos */

export const ligar = (id: string, erro?: string) => ({ id, "aria-invalid": erro ? true : undefined, "aria-describedby": erro ? id + "-erro" : undefined });

export function Campo({ id, rotulo, nota, erro, children }: { id: string; rotulo: string; nota?: string; erro?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[15px] font-medium">{rotulo}{nota && <span className="font-normal text-muted-foreground"> {nota}</span>}</label>
      {children}
      {erro && <Erro id={id + "-erro"}>{erro}</Erro>}
    </div>
  );
}

/** Escolher em vez de escrever (P5): botões com aria-pressed num grupo com rótulo; a sugestão vai tracejada (C5). */
export function Escolhas<T extends string>({ rotulo, opcoes, valor, mudar, erro, sugerido }: { rotulo: string; opcoes: { v: T; t: string }[]; valor: T | ""; mudar: (v: T) => void; erro?: string; sugerido?: T }) {
  const id = "esc-" + rotulo.replace(/\W+/g, "");
  return (
    <div className="grid gap-1.5">
      <span id={id} className="text-[15px] font-medium">{rotulo}</span>
      <div role="group" aria-labelledby={id} aria-describedby={erro ? id + "-erro" : undefined} className="flex flex-wrap gap-2">
        {opcoes.map((o) => (
          <button key={o.v} type="button" aria-pressed={valor === o.v} aria-invalid={erro ? true : undefined} onClick={() => mudar(o.v)}
            className={cn(ESCOLHA(valor === o.v), valor !== o.v && sugerido === o.v && "border-2 border-dashed border-primary/70")}>
            {o.t}{valor !== o.v && sugerido === o.v && <span className="ml-1.5 text-sm text-primary">Sugerido</span>}
          </button>
        ))}
      </div>
      {erro && <Erro id={id + "-erro"}>{erro}</Erro>}
    </div>
  );
}

/** Confirmar no sítio, sem janela (C23): a pergunta diz a consequência, o botão repete o verbo. */
export function Confirmar({ texto, sim, aoSim, aoNao, perigo = true, children }: { texto: string; sim: string; aoSim: () => void; aoNao: () => void; perigo?: boolean; children?: ReactNode }) {
  return (
    <div role="alertdialog" aria-label="Confirmar" className="mt-3 grid gap-4 rounded-xl border border-border bg-card p-4 animate-in fade-in-0">
      <p className="text-[15px]">{texto}</p>
      {children}
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" className="min-h-11" onClick={aoNao}>Cancelar</Button>
        <Button variant={perigo ? "destructive" : "default"} className="min-h-11" onClick={aoSim}>{sim}</Button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- o que fazer agora */

/** O formulário de cada tarefa: o que vai acontecer e o botão (o único primário do ecrã, salvo `primario` falso). */
function FormTarefa({ S, t, feito, primario, ir }: { S: Ctx["S"]; t: TarefaInv; feito: (m: string) => void; primario: boolean; ir: (f: Ficha) => void }) {
  const db = useInventario();
  const a = t.acao;
  const p = a.k === "aprovar" || a.k === "receber" ? poPorId(db, a.po) : undefined;
  const [q, setQ] = useState<Record<string, number>>(() => Object.fromEntries((p?.lines ?? []).map((l) => [l.id, Math.max(0, l.packs * l.packN - l.recv - l.cancelled)])));
  const [erro, setErro] = useState("");
  const dSair = a.k === "sair" ? S.deals.find((d) => d.id === a.deal) : undefined;
  const fase = dSair ? obraInv(db, dSair).fases.find((f) => a.k === "sair" && f.fase === a.fase) : undefined;
  const nome = (sku: string) => db.products.find((x) => x.sku === sku)?.name ?? sku, un = (sku: string) => db.products.find((x) => x.sku === sku)?.unit ?? "un";
  const correr = (r: Resultado<string>) => { if (r.ok) { setErro(""); feito(r.valor); } else setErro(r.erro); };
  const fazer = () => {
    if (a.k === "aprovar") correr(aprovar(a.po));
    else if (a.k === "receber") correr(receber(a.po, Object.entries(q).map(([lineId, qty]) => ({ lineId, qty }))));
    else if (a.k === "sair") correr(darSaida(dSair?.obra.ec?.n ?? "", fase?.itens.filter((m) => m.pronto > 0) ?? []));
    else if (a.k === "encomendar") correr(encomendar(a.sku, a.q, a.sup));
    else if (a.k === "pedir") correr(pedirOQueFalta(a.ec));
    else if (a.k === "preco") correr(decidirPrecoNovo(a.id, true));
    else ir({ k: "contagem" });
  };
  const LINHAS = "mt-2 divide-y divide-border border-y border-border";
  return (
    <div className="mt-4">
      {a.k === "receber" && p && (
        <>
          <p className="text-[15px] text-muted-foreground">Confira o que chegou e acerte as quantidades, se vier menos.</p>
          <ul className={LINHAS}>
            {p.lines.filter((l) => l.packs * l.packN - l.recv - l.cancelled > 0).map((l) => {
              const falta = l.packs * l.packN - l.recv - l.cancelled;
              return (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                  <span className="min-w-0 flex-1"><span className="block text-[15px] font-medium">{nome(l.sku)}</span><span className="block text-sm text-muted-foreground">faltam {qtd(falta, un(l.sku))}</span></span>
                  <ContadorQtd id={`rec-${l.id}`} valor={q[l.id] ?? 0} un={un(l.sku)} nome={nome(l.sku)} min={0} onMudar={(n) => setQ((x) => ({ ...x, [l.id]: Math.min(falta, Math.round(n)) }))} />
                </li>
              );
            })}
          </ul>
        </>
      )}
      {a.k === "sair" && fase && (
        <>
          <p className="text-[15px] text-muted-foreground">Sai do armazém e fica registado como entregue na obra.</p>
          <ul className={LINHAS}>
            {fase.itens.filter((m) => m.pronto > 0).map((m) => (
              <li key={m.n} className="flex flex-wrap items-baseline justify-between gap-x-4 py-2.5 text-[15px]"><span className="min-w-0 flex-1">{m.n}</span><span className="tabular-nums text-muted-foreground">{qtd(m.pronto, m.un)}</span></li>
            ))}
          </ul>
        </>
      )}
      {a.k === "aprovar" && p && (
        <p className="text-[15px] text-muted-foreground">Pede-se {p.lines.map((l) => `${qtd(l.packs * l.packN, un(l.sku))} de ${nome(l.sku).toLowerCase()}`).join(", ")}. Ao aprovar, a encomenda segue para o fornecedor.</p>
      )}
      {a.k === "encomendar" && <p className="text-[15px] text-muted-foreground">A encomenda segue logo para o fornecedor; quando chegar, dá-se entrada em Encomendas.</p>}
      {a.k === "pedir" && <p className="text-[15px] text-muted-foreground">Faz uma encomenda ao fornecedor de cada material, por aprovar. Os materiais sem fornecedor pedem que se junte o material a um fornecedor.</p>}
      {a.k === "preco" && <p className="text-[15px] text-muted-foreground">Aceite, passa a ser o custo do material nas encomendas novas.</p>}
      {a.k === "contar" && <p className="text-[15px] text-muted-foreground">Conta-se um material de cada vez; no fim, as diferenças corrigem o stock.</p>}
      {erro && <div className="mt-3"><Erro>{erro}</Erro></div>}
      <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:items-center">
        <Button size="lg" variant={primario ? "default" : "outline"} className="w-full sm:w-auto" onClick={fazer}>{t.btn}</Button>
        {a.k === "preco" && <Button size="lg" variant="ghost" className="w-full sm:w-auto" onClick={() => correr(decidirPrecoNovo(a.id, false))}>Recusar</Button>}
      </div>
    </div>
  );
}

/** O cartão "O que fazer agora" (C21): uma frase, o porquê e o botão. */
export function Agora({ S, t, feito, ir, ver, primario = true, vazio }: { S: Ctx["S"]; t: TarefaInv | undefined; feito: (m: string) => void; ir: (f: Ficha) => void; ver?: (t: TarefaInv) => ReactNode; primario?: boolean; vazio: string }) {
  return (
    <section aria-labelledby="inv-agora" className={cn("mt-8 rounded-2xl border bg-card p-5 sm:p-6", t ? "border-primary/25 shadow-[var(--shadow-md)]" : "border-border shadow-[var(--shadow-sm)]")}>
      <h2 id="inv-agora" className="text-sm font-medium text-primary">O que fazer agora</h2>
      {t ? (
        <div key={t.id} className="animate-in fade-in-0 slide-in-from-right-3 duration-300">
          <p className="mt-2 flex items-start gap-2 text-xl font-semibold">{t.urgente && <AlertCircle className="mt-1 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />}{t.t}{t.urgente && <span className="sr-only"> (urgente)</span>}</p>
          <p className="mt-1 text-base text-muted-foreground">{t.sub}</p>
          {ver?.(t)}
          <FormTarefa S={S} t={t} feito={feito} primario={primario} ir={ir} />
        </div>
      ) : (
        <p className="mt-2 flex items-center gap-2 text-lg"><CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden="true" />{vazio}</p>
      )}
    </section>
  );
}

/** Abre a ficha certa para uma tarefa (a lista "Depois"). */
export function fichaDaTarefa(t: TarefaInv): Ficha {
  const a = t.acao;
  if (a.k === "aprovar" || a.k === "receber") return { k: "po", id: a.po };
  if (a.k === "sair" || a.k === "pedir") return { k: "obra", id: a.deal };
  if (a.k === "preco") return { k: "forn", id: a.sup };
  if (a.k === "contar") return { k: "contagem" };
  return { k: "material", sku: a.sku };
}
