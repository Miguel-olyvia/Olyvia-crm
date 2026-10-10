// Uma pessoa na lista de Pessoas: um só botão por linha, sem cartões lá dentro. A cor fica nos ícones.
// Só o essencial: nome, papel, serviço e local, etapa (leads) ou valor e obras (clientes), último contacto, próximo passo e alertas.
import { AlertCircle, CalendarClock, Clock, FileText, Megaphone, Siren, type LucideIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { eur, type Estado } from "./motor";
import { atrasada, etapaDe, localDe, tempoDesde } from "./leadsDocs";
import { dadosCliente, type PessoaApp } from "./pessoasDocs";
import { LIMITE_SEM_CONTACTO, perfilDe, proximoTexto, type Perfil } from "./perfilDocs";

/** Contorno dos controlos da página Pessoas: cerca de 5:1 sobre branco e 4,6:1 sobre o fundo (mínimo pedido: 3:1). */
export const BORDA_CTRL = "border-[hsl(220_10%_45%)]";

export const iniciais = (nome: string): string => nome.split(/\s+/).filter(Boolean).map((x) => x[0]).slice(0, 2).join("").toUpperCase();

/** Avatar com as iniciais num fundo neutro. */
export function AvatarPessoa({ nome, className }: { nome: string; className?: string }) {
  return (
    <Avatar className={cn("h-11 w-11", className)} aria-hidden="true">
      <AvatarFallback className="bg-muted text-[15px] font-medium text-foreground">{iniciais(nome)}</AvatarFallback>
    </Avatar>
  );
}

function Alerta({ icone: I, cor, children }: { icone: LucideIcon; cor: string; children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-0.5 text-[15px] font-medium text-foreground">
      <I className={cn("h-4 w-4 shrink-0", cor)} aria-hidden="true" />{children}
    </span>
  );
}

function Alertas({ p, f }: { p: PessoaApp; f: Perfil }) {
  const marcada = f.visita?.estado === "Marcada";
  if (!atrasada(p) && !f.conflito && !p.novoNegocio && !marcada) return null;
  return (
    <span className="mt-2 flex flex-wrap gap-1.5">
      {atrasada(p) && <Alerta icone={AlertCircle} cor="text-destructive">Atrasada</Alerta>}
      {f.conflito && <Alerta icone={Siren} cor="text-amber-700">Conflito de contacto</Alerta>}
      {p.novoNegocio && <Alerta icone={FileText} cor="text-primary">Novo negócio em curso</Alerta>}
      {marcada && <Alerta icone={CalendarClock} cor="text-primary">{`Visita marcada para ${f.visita!.data}`}</Alerta>}
    </span>
  );
}

/** As leads: a etapa em palavras. Os clientes: valor contratado e obras em curso. */
function Contexto({ p, S }: { p: PessoaApp; S: Estado }) {
  if (p.papel === "lead") return <span className="mt-1 block text-[15px] text-foreground">{etapaDe(p)}</span>;
  const dc = dadosCliente(S, p);
  const obras = dc.obrasEmCurso === 0 ? "sem obras em curso" : dc.obrasEmCurso === 1 ? "1 obra em curso" : `${dc.obrasEmCurso} obras em curso`;
  return <span className="mt-1 block text-[15px] text-foreground">{eur(dc.valorTotal)} € contratado · {obras}</span>;
}

/** "há 3 dias" com relógio, ou "sem contacto há 9 dias" a partir do limite. */
function UltimoContacto({ f }: { f: Perfil }) {
  const sem = f.diasSemContacto >= LIMITE_SEM_CONTACTO;
  return (
    <span className="inline-flex items-center gap-1 text-[15px] text-muted-foreground">
      <Clock className={cn("h-4 w-4 shrink-0", sem && "text-destructive")} aria-hidden="true" />
      {sem ? `sem contacto há ${f.diasSemContacto} dias` : tempoDesde(f.ultimoContacto) || "hoje"}
    </span>
  );
}

interface LinhaProps { p: PessoaApp; S: Estado; escolhida: boolean; abrir: () => void }

export function LinhaPessoa({ p, S, escolhida, abrir }: LinhaProps) {
  const f = perfilDe(p, S), d = p.principal, loc = localDe(d);
  return (
    <li>
      <button type="button" data-pessoa={p.nome} aria-current={escolhida ? "true" : undefined} onClick={abrir}
        className={cn("flex min-h-11 w-full cursor-pointer gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-muted/60 motion-reduce:transition-none",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
          escolhida && "bg-muted shadow-[inset_4px_0_0_hsl(var(--primary))]")}>
        <AvatarPessoa nome={p.nome} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-base font-semibold text-foreground">{p.nome}</span>
            <span className="text-[15px] text-muted-foreground">{p.papel === "lead" ? "Lead" : "Cliente"}</span>
          </span>
          <span className="block text-[15px] text-muted-foreground">{d.servico}{loc ? " · " + loc : ""}</span>
          <Contexto p={p} S={S} />
          <span className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5">
            <span className="inline-flex items-center gap-1 text-[15px] text-muted-foreground"><Megaphone className="h-4 w-4 shrink-0" aria-hidden="true" />{f.origem}</span>
            <UltimoContacto f={f} />
          </span>
          <span className="mt-1 block text-[15px] font-medium text-foreground">{proximoTexto(p, S)}</span>
          <Alertas p={p} f={f} />
        </span>
      </button>
    </li>
  );
}
