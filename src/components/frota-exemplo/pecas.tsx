// As peças da Frota de exemplo em shadcn + tokens do tema (as do protótipo — Placa, Selo, Cab, Kpi, Chip, Vazio, Prog,
// botão com permissão — sem o CSS do protótipo). Os tons vêm das peças do Inventário real (tones.ts).
import { useId, type ReactNode } from "react";
import { Inbox, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, type ButtonProps } from "@/components/ui/button";
import { TableRow } from "@/components/ui/table";
import { InventoryEmptyState, InventoryStatusBadge, usePermissionGate, type InventoryTone } from "@/components/frota-exemplo/inventarioUi";
import { PERMISSAO_OPERACOES, linkObra } from "./dados/exemplo";
import { DOC_TABLE_WRAP_CLASS } from "@/components/inventory/DocumentSheet";
import { cn } from "@/lib/utils";
import { useFrotaCtx } from "./contexto";
import { SeloExemploFrota } from "./SeloExemploFrota";
import { ESTADOS, type Tom, type Viatura } from "./dados";

/** Os tons do protótipo (ok/info/warn/bad/violet/neu) nos tons do Inventário real. */
export const tomInv = (t: Tom): InventoryTone => (t === "neu" ? "neutral" : t);

export function Selo({ tom, children, className }: { tom: Tom; children: ReactNode; className?: string }) {
  return <InventoryStatusBadge tone={tomInv(tom)} className={className}>{children}</InventoryStatusBadge>;
}

export const SeloEstado = ({ v }: { v: Viatura }) => <Selo tom={ESTADOS[v.estado][0]}>{ESTADOS[v.estado][1]}</Selo>;

/** A matrícula portuguesa (faixa azul com o P). */
export function Placa({ mat, grande }: { mat: string; grande?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-stretch overflow-hidden rounded border border-foreground/40 bg-card font-mono font-semibold leading-none text-foreground",
        grande ? "text-base" : "text-xs",
      )}
      title={`Matrícula ${mat}`}
    >
      <span className="flex items-center bg-blue-700 px-1 text-[9px] text-white" aria-hidden="true">P</span>
      <span className={cn("flex items-center tracking-wide", grande ? "px-2 py-1" : "px-1.5 py-0.5")}>{mat}</span>
    </span>
  );
}

/** A viatura numa célula: matrícula e marca/modelo. */
export const VRef = ({ v }: { v: Viatura }) => (
  <div className="flex flex-col items-start gap-1">
    <Placa mat={v.mat} />
    <span className="text-xs text-muted-foreground">{v.marca} {v.modelo}</span>
  </div>
);

const BARRA: Record<Tom, string> = { ok: "bg-success", info: "bg-info", warn: "bg-warning", bad: "bg-destructive", violet: "bg-primary", neu: "bg-muted-foreground" };
/** A barra de progresso (revisão, utilização). */
export function Prog({ tom, pct, largo }: { tom: Tom; pct: number; largo?: boolean }) {
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-muted", largo ? "my-2 w-full" : "w-24")} aria-hidden="true">
      <div className={cn("h-full rounded-full", BARRA[tom])} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

/** O cabeçalho de cada ecrã (como InventoryPageHeader): "Frota › Título", o título com o selo de exemplo, o texto e as ações. */
export function Cabecalho({ titulo, texto, acoes }: { titulo: string; texto: ReactNode; acoes?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <p className="mb-0.5 text-[12.5px] text-muted-foreground">Frota{titulo !== "Hoje" ? ` › ${titulo}` : ""}</p>
        <h1 id="frota-h1" tabIndex={-1} className="flex flex-wrap items-center gap-3 text-[22px] font-bold leading-tight focus:outline-none">
          {titulo}
          <SeloExemploFrota />
        </h1>
        <p className="mt-1 max-w-[760px] text-muted-foreground">{texto}</p>
      </div>
      {acoes ? <div className="flex flex-wrap items-center gap-2">{acoes}</div> : null}
    </div>
  );
}

interface BotaoProps extends Omit<ButtonProps, "onClick"> {
  aoClicar: () => void;
  /** Ação de escrita: sem a permissão real fica desativada (aria-disabled, focável) e diz porquê. */
  escrita?: boolean;
  icone?: LucideIcon;
}
/** Um botão da Frota: com `escrita`, só a permissão real o ativa. */
export function BotaoFrota({ aoClicar, escrita, icone: I, children, size = "sm", variant = "outline", className, ...resto }: BotaoProps) {
  const { podeAgir, semPermissao, avisar } = useFrotaCtx();
  const porque = useId();
  const bloqueado = !!escrita && !podeAgir;
  return (
    <>
      <Button
        type="button"
        size={size}
        variant={variant}
        aria-disabled={bloqueado || undefined}
        aria-describedby={bloqueado ? porque : undefined}
        title={bloqueado ? semPermissao : undefined}
        className={cn("gap-1.5", bloqueado && "cursor-not-allowed opacity-50 hover:shadow-none", className)}
        onClick={(e) => { e.stopPropagation(); if (bloqueado) avisar(semPermissao, true); else aoClicar(); }}
        {...resto}
      >
        {I ? <I className="h-4 w-4" aria-hidden="true" /> : null}
        {children}
      </Button>
      {bloqueado ? <span id={porque} className="sr-only">{semPermissao}</span> : null}
    </>
  );
}

/** Nada para mostrar. */
export const Vazio = ({ titulo, texto }: { titulo: string; texto: string }) => <InventoryEmptyState title={titulo} description={texto} icon={Inbox} />;

/** O invólucro das tabelas (borda, scroll horizontal, cabeçalho muted), o mesmo das fichas do Inventário. */
export const Tabela = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn(DOC_TABLE_WRAP_CLASS, "shadow-sm", className)}>{children}</div>
);

/** Uma linha de tabela que abre algo (clique ou Enter). */
export function LinhaClicavel({ aoAbrir, rotulo, children, className }: { aoAbrir: () => void; rotulo?: string; children: ReactNode; className?: string }) {
  return (
    <TableRow
      tabIndex={0}
      aria-label={rotulo}
      className={cn("cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", className)}
      onClick={aoAbrir}
      onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) aoAbrir(); }}
    >
      {children}
    </TableRow>
  );
}

/**
 * Uma obra ("Obra #1022") como ligação para o módulo Operações (/operacao, outra aplicação no mesmo domínio: é um <a>
 * com carregamento a sério, não um Link do router). O destino vem de linkObra(): as obras do exemplo não existem nas
 * Operações reais, por isso abre a lista de obras e o tooltip diz que é uma obra de exemplo. Sem operations.view é texto.
 */
export function RefObra({ id, children, real = false }: { id: number; children?: ReactNode; real?: boolean }) {
  const { obras } = useFrotaCtx();
  const gate = usePermissionGate();
  const o = obras.find((x) => x.id === id);
  const texto = children ?? `Obra #${id}`;
  const descricao = o ? `${o.servico} · ${o.nome}, ${o.local}` : `Obra #${id}`;
  if (!gate(PERMISSAO_OPERACOES).allowed) return <span title={real ? descricao : `${descricao} · obra de exemplo`}>{texto}</span>;
  return (
    <a
      href={linkObra(id, real)}
      title={real ? `Abrir a obra nas Operações: ${descricao}` : `${descricao} · obra de exemplo: não existe nas Operações, abre a lista de obras`}
      className="rounded text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {texto}
    </a>
  );
}

/** O filtro "vista" de um ecrã, no URL (?vista=…), para os cartões do Hoje abrirem listas já filtradas. */
export function useVista(padrao = "todas"): [string, (v: string) => void] {
  const [params, setParams] = useSearchParams();
  const vista = params.get("vista") || padrao;
  const mudar = (v: string): void => {
    const n = new URLSearchParams(params);
    if (v === padrao) n.delete("vista"); else n.set("vista", v);
    setParams(n, { replace: true });
  };
  return [vista, mudar];
}

/** Uma secção com título h2. */
export function Seccao({ titulo, icone: I, acoes, children, className }: { titulo: string; icone?: LucideIcon; acoes?: ReactNode; children: ReactNode; className?: string }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="flex items-center gap-2 text-base font-semibold">{I ? <I className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> : null}{titulo}</h2>
        {acoes}
      </div>
      {children}
    </section>
  );
}

/** Um cartão simples (fundo do cartão, borda, sombra). */
export const Cartao = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn("rounded-lg border bg-card p-4 shadow-sm", className)}>{children}</div>
);

/**
 * O aviso da Frota (região aria-live), com ícone: nunca só cor. Fica sempre no DOM. Desenha-se na página e dentro da
 * ficha (com a folha aberta, o resto da página fica escondido aos leitores de ecrã).
 */
export function AvisoRegiao({ testId }: { testId?: string }) {
  const { aviso } = useFrotaCtx();
  const I = aviso?.erro ? TriangleAlert : Info;
  return (
    <p role="status" aria-live="polite" aria-atomic="true" data-testid={testId}
      className={cn(aviso ? "flex items-start gap-2 rounded-md border bg-card px-3 py-2 text-sm shadow-sm" : "sr-only")}>
      {aviso ? <I className={cn("mt-0.5 h-4 w-4 shrink-0", aviso.erro ? "text-destructive" : "text-sky-700 dark:text-info")} aria-hidden="true" /> : null}
      <span>
        {aviso?.texto}
        {aviso?.link ? <> <Link to={aviso.link.para} className="font-medium text-primary underline underline-offset-2">{aviso.link.rotulo}</Link></> : null}
      </span>
    </p>
  );
}

/** Uma lista de linhas "rótulo … valor" (.vlist do protótipo). */
export const ListaV = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn("divide-y [&>*]:flex [&>*]:items-center [&>*]:justify-between [&>*]:gap-3 [&>*]:py-2 first:[&>*]:pt-0 last:[&>*]:pb-0", className)}>{children}</div>
);
