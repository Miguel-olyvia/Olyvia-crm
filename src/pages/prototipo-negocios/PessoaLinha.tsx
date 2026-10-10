// Uma pessoa na lista de Pessoas: uma linha da tabela (computador) ou um cartão de três linhas (abaixo de lg).
// Só o essencial. O elemento acessível é UM botão com o nome; a linha toda também é clicável. A cor fica nos ícones.
import { AlertCircle, Clock } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { eur, type Estado } from "./motor";
import { atrasada, localDe } from "./leadsDocs";
import type { PessoaApp } from "./pessoasDocs";
import { perfilDe, proximoTexto } from "./perfilDocs";
import { contactoTexto, etapaTexto, valorColuna } from "./listaDocs";
import { IconeFase } from "./pecas";

/** Contorno dos controlos da página Pessoas: cerca de 5:1 sobre branco e 4,6:1 sobre o fundo (mínimo pedido: 3:1). */
export const BORDA_CTRL = "border-[hsl(220_10%_45%)]";
const FOCO = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

export const iniciais = (nome: string): string => nome.split(/\s+/).filter(Boolean).map((x) => x[0]).slice(0, 2).join("").toUpperCase();

/** Avatar com as iniciais num fundo neutro. */
export function AvatarPessoa({ nome, className }: { nome: string; className?: string }) {
  return (
    <Avatar className={cn("h-11 w-11", className)} aria-hidden="true">
      <AvatarFallback className="bg-muted text-[15px] font-medium text-foreground">{iniciais(nome)}</AvatarFallback>
    </Avatar>
  );
}

/** O alerta de atraso: ícone e texto, nunca só a cor. */
export function Atrasada({ className }: { className?: string }) {
  return (
    <span className={cn("mr-1.5 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 align-middle text-[15px] font-medium text-foreground", className)}>
      <AlertCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />Atrasada
    </span>
  );
}

const papel = (p: PessoaApp): string => (p.papel === "lead" ? "Lead" : "Cliente");
const localidade = (p: PessoaApp): string => { const l = localDe(p.principal); return p.principal.servico + (l ? " · " + l : ""); };

interface LinhaProps { p: PessoaApp; S: Estado; abrir: () => void }

/** Uma linha da tabela, cerca de 56 px: pessoa, serviço e local, etapa, origem, último contacto, próximo passo e valor. */
export function LinhaTabela({ p, S, abrir }: LinhaProps) {
  const f = perfilDe(p, S), c = contactoTexto(f), v = valorColuna(S, p);
  const celula = "px-2 py-1.5 align-middle text-[15px]";
  return (
    <TableRow onClick={abrir} className="cursor-pointer hover:bg-muted/60 focus-within:bg-muted/60 motion-reduce:transition-none">
      <TableCell className={celula}>
        <button type="button" data-pessoa={p.nome} aria-haspopup="dialog" className={cn("flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-md text-left", FOCO)}>
          <AvatarPessoa nome={p.nome} className="h-9 w-9" />
          <span className="min-w-0"><span className="block break-words font-semibold text-foreground">{p.nome}</span><span className="block text-muted-foreground">{papel(p)}{atrasada(p) && <Atrasada className="ml-2 mr-0 py-0" />}</span></span>
        </button>
      </TableCell>
      <TableCell className={celula}>{localidade(p)}</TableCell>
      <TableCell className={celula}>
        <span className="flex items-center gap-2"><IconeFase fase={p.principal.fase} tam="sm" /><span>{etapaTexto(p)}</span></span>
      </TableCell>
      <TableCell className={celula}>{f.origem}</TableCell>
      <TableCell className={celula}>
        <span className="flex items-start gap-1.5 text-muted-foreground"><Clock className={cn("mt-1 h-4 w-4 shrink-0", c.sem && "text-destructive")} aria-hidden="true" />{c.texto}</span>
      </TableCell>
      <TableCell className={cn(celula, "font-medium")}><span className="line-clamp-2" title={proximoTexto(p, S)}>{proximoTexto(p, S)}</span></TableCell>
      <TableCell className={cn(celula, "whitespace-nowrap text-right tabular-nums")}>
        {v === null ? <><span aria-hidden="true">—</span><span className="sr-only">Sem valor</span></> : `${eur(v)} €`}
      </TableCell>
    </TableRow>
  );
}

/** Abaixo de lg: três linhas (nome e papel com alerta; serviço e local; próximo passo e há quanto tempo), sem scroll horizontal. */
export function CartaoPessoa({ p, S, abrir }: LinhaProps) {
  const c = contactoTexto(perfilDe(p, S));
  return (
    <li>
      <button type="button" data-pessoa={p.nome} aria-haspopup="dialog" onClick={abrir}
        className={cn("flex min-h-11 w-full cursor-pointer gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-muted/60 motion-reduce:transition-none focus-visible:ring-inset", FOCO)}>
        <AvatarPessoa nome={p.nome} className="h-10 w-10" />
        <span className="min-w-0 flex-1">
          <span className="block"><span className="font-semibold text-foreground">{p.nome}</span><span className="ml-2 text-[15px] text-muted-foreground">{papel(p)}</span>{atrasada(p) && <span className="ml-2"><Atrasada /></span>}</span>
          <span className="block text-[15px] text-muted-foreground">{localidade(p)}</span>
          <span className="block text-[15px]"><span className="font-medium text-foreground">{proximoTexto(p, S)}</span><span className="text-muted-foreground"> · {c.texto}</span></span>
        </span>
      </button>
    </li>
  );
}
