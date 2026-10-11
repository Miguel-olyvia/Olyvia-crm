// Uma pessoa na lista de Pessoas: uma linha da tabela (computador) ou um cartão de três linhas (abaixo de lg).
// Só o essencial. O elemento acessível é UM botão com o nome; a linha toda também é clicável. A cor fica nos ícones.
// Por baixo do nome, pequenas: Lead ou Cliente, Empresa, MQL ou SQL, Atrasada, "exemplo" e, derivado, "Voltou a contactar".
import { AlertCircle, Clock, UserCheck } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { eur, type Estado } from "./motor";
import { atrasada, localDe } from "./leadsDocs";
import type { PessoaApp } from "./pessoasDocs";
import { perfilDe, proximoTexto } from "./perfilDocs";
import { contactoTexto, etapaPessoa, etapaTexto, valorColuna } from "./listaDocs";
import { formularioDe, resultadoContacto, voltouAContactar } from "./camposPessoa";
import { FASE_COR, IconeFase } from "./pecas";
import { Etiqueta, EtiquetaQualificacao, IconePerdida, MarcaExemplo, ResultadoSelo, VoltouAContactar } from "./SelosPessoa";

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

/** O ícone de cada etapa da pessoa: o da fase (Lead, Contacto, Visita, Negócio) ou o de Cliente. Tamanhos como em IconeFase. */
const TAMANHO = { sm: "h-7 w-7 rounded-lg [&_svg]:h-4 [&_svg]:w-4", md: "h-10 w-10 rounded-xl [&_svg]:h-5 [&_svg]:w-5" } as const;
export function IconeEtapa({ etapa, tam = "md" }: { etapa: number; tam?: keyof typeof TAMANHO }) {
  if (etapa < 4) return <IconeFase fase={etapa} tam={tam} />;
  return <span className={cn("grid shrink-0 place-items-center", TAMANHO[tam], FASE_COR[4])} aria-hidden="true"><UserCheck /></span>;
}

const papel = (p: PessoaApp): string => (p.papel === "lead" ? "Lead" : "Cliente");
const localidade = (p: PessoaApp): string => { const l = localDe(p.principal); return p.principal.servico + (l ? " · " + l : ""); };

/** As linhas pequenas por baixo do nome, todas na mesma lista que quebra (nunca mais de duas): o papel, as etiquetas que a pessoa tem
 *  (só nalgumas aparecem) e, se for o caso, "Voltou a contactar" (derivado: quem chama passa `voltou`). */
export function LinhaPapel({ p, voltou, className }: { p: PessoaApp; voltou?: boolean; className?: string }) {
  return (
    <span className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[15px] leading-5 text-muted-foreground", className)}>
      <span>{papel(p)}</span>
      {p.empresa && <Etiqueta>Empresa</Etiqueta>}
      {p.qualificacao && <EtiquetaQualificacao q={p.qualificacao} />}
      {atrasada(p) && <Atrasada className="mr-0 py-0" />}
      {(p.exemplo || p.qualificacao !== null) && <MarcaExemplo />}
      {voltou && <VoltouAContactar />}
    </span>
  );
}

interface LinhaProps { p: PessoaApp; S: Estado; abrir: () => void }

/** Uma linha da tabela, de 52 a 56 px (68 px quando há "Voltou a contactar", que passa para uma segunda linha de selos): pessoa, serviço e local, etapa, formulário, último contacto (com o resultado), próximo passo e valor. */
export function LinhaTabela({ p, S, abrir }: LinhaProps) {
  const f = perfilDe(p, S), c = contactoTexto(f), v = valorColuna(S, p);
  const celula = "px-2 py-1 align-middle text-[15px]";
  return (
    <TableRow onClick={abrir} className="cursor-pointer hover:bg-muted/60 focus-within:bg-muted/60 motion-reduce:transition-none">
      <TableCell className={celula}>
        <button type="button" data-pessoa={p.nome} aria-haspopup="dialog" className={cn("flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-md text-left", FOCO)}>
          <AvatarPessoa nome={p.nome} className="h-9 w-9" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold leading-5 text-foreground" title={p.nome}>{p.nome}</span>
            <LinhaPapel p={p} voltou={voltouAContactar(S, p, f)} />
          </span>
        </button>
      </TableCell>
      <TableCell className={celula}>{localidade(p)}</TableCell>
      <TableCell className={celula}>
        <span className="flex items-center gap-2">{p.perdida !== null ? <IconePerdida /> : <IconeEtapa etapa={etapaPessoa(p)} tam="sm" />}<span>{etapaTexto(p)}</span></span>
      </TableCell>
      <TableCell className={celula}>{formularioDe(S, p)}</TableCell>
      <TableCell className={celula}>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground"><Clock className={cn("h-4 w-4 shrink-0", c.sem && "text-destructive")} aria-hidden="true" />{c.texto}</span>
          <ResultadoSelo resultado={resultadoContacto(f)} className="py-0 leading-5" />
        </span>
      </TableCell>
      <TableCell className={cn(celula, "font-medium")}><span className="line-clamp-2" title={proximoTexto(p, S)}>{proximoTexto(p, S)}</span></TableCell>
      <TableCell className={cn(celula, "whitespace-nowrap text-right tabular-nums")}>
        {v === null ? <><span aria-hidden="true">—</span><span className="sr-only">Sem valor</span></> : `${eur(v)} €`}
      </TableCell>
    </TableRow>
  );
}

/** Abaixo de lg: três linhas (nome e papel com etiquetas; serviço, local e formulário; próximo passo, há quanto tempo e resultado), sem scroll horizontal. */
export function CartaoPessoa({ p, S, abrir }: LinhaProps) {
  const f = perfilDe(p, S), c = contactoTexto(f);
  return (
    <li>
      <button type="button" data-pessoa={p.nome} aria-haspopup="dialog" onClick={abrir}
        className={cn("flex min-h-11 w-full cursor-pointer gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-muted/60 motion-reduce:transition-none focus-visible:ring-inset", FOCO)}>
        <AvatarPessoa nome={p.nome} className="h-10 w-10" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-foreground">{p.nome}</span>
          <LinhaPapel p={p} voltou={voltouAContactar(S, p, f)} />
          <span className="block text-[15px] text-muted-foreground">{localidade(p)} · {formularioDe(S, p)}{p.perdida !== null ? ` · ${etapaTexto(p)}` : ""}</span>
          <span className="block text-[15px]"><span className="font-medium text-foreground">{proximoTexto(p, S)}</span><span className="text-muted-foreground"> · {c.texto}</span> <ResultadoSelo resultado={resultadoContacto(f)} /></span>
        </span>
      </button>
    </li>
  );
}
