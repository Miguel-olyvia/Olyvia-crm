// O cabeçalho da ficha de uma pessoa, em quatro linhas: quem é e as ações; as seis etapas; a faixa de factos; os avisos.
// Tudo com min-w-0 para nada empurrar a ficha para além da margem, e com quebra para baixo quando falta largura.
import type { RefObject } from "react";
import { ArrowRight, Check, CheckCircle2, CircleAlert, Mail, MessageCircle, Phone, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { FASES, type Proximo } from "./motor";
import { etapaDe } from "./leadsDocs";
import type { PessoaApp } from "./pessoasDocs";
import { factosDe, type Perfil } from "./perfilDocs";
import { AvatarPessoa, BORDA_CTRL } from "./PessoaLinha";
import { FASE_COR, FASE_ICONE } from "./pecas";

const soDigitos = (t: string): string => t.replace(/\D/g, "");
const BOTAO = "min-h-11 text-[15px]";

/** As seis etapas, com a atual marcada em texto e em ícone. Em 2 ou 3 colunas quando a ficha é estreita e em 6 quando há largura (ver .etapas em prototipo.css). */
function Etapas({ fase }: { fase: number }) {
  return (
    <div className="etapas-cx">
      <ol aria-label="Etapa da pessoa" className="etapas">
        {FASES.map((nome, i) => {
          const I = i < fase ? Check : FASE_ICONE[i], atual = i === fase;
          return (
            <li key={nome} aria-current={atual ? "step" : undefined} className={cn("border-t-2 pt-2 text-[15px]", atual ? "border-primary font-semibold text-foreground" : i < fase ? "border-foreground text-foreground" : cn(BORDA_CTRL, "text-muted-foreground"))}>
              <span className="flex items-center gap-1.5">
                <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-md", i <= fase ? FASE_COR[i] : "bg-muted text-muted-foreground")} aria-hidden="true"><I className="h-4 w-4" /></span>
                <span className="min-w-0">{nome}</span>
              </span>
              {atual && <span className="block">Atual</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Rótulo em cima, valor em baixo: pares em colunas, sem chips soltos. A saúde leva a barra e a marca de exemplo. */
function Factos({ p, f }: { p: PessoaApp; f: Perfil }) {
  const { score } = f.saude;
  return (
    <dl aria-label="Factos da pessoa" className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(10.5rem,1fr))] gap-x-6 gap-y-3 border-y border-border py-3 text-[15px]">
      <div className="min-w-0">
        <dt className="text-muted-foreground">Saúde</dt>
        <dd><span className="font-semibold tabular-nums">{score}/100</span><span className="ml-1.5 text-muted-foreground">exemplo</span>
          <Progress value={score} aria-label={`Saúde ${score} em 100`} className="mt-1 h-2" /></dd>
      </div>
      {factosDe(p, f).map((x) => (
        <div key={x.rotulo} className="min-w-0">
          <dt className="text-muted-foreground">{x.rotulo}</dt>
          <dd className="break-words font-medium text-foreground">{x.valor}{x.exemplo && <span className="ml-1.5 font-normal text-muted-foreground">exemplo</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Os avisos todos numa linha: o que está mal com o ícone de alerta, o que está bem com o visto. */
function Avisos({ f }: { f: Perfil }) {
  const { motivos, maus } = f.saude;
  return (
    <ul aria-label="Avisos" className="flex min-w-0 flex-wrap gap-x-6 gap-y-1.5">
      {motivos.map((m, i) => {
        const I: LucideIcon = maus[i] ? CircleAlert : CheckCircle2;
        return <li key={m} className="flex items-center gap-2 text-[15px]"><I className={cn("h-4 w-4 shrink-0", maus[i] ? "text-destructive" : "text-emerald-700")} aria-hidden="true" />{m}</li>;
      })}
    </ul>
  );
}

function Contactos({ f, nome }: { f: Perfil; nome: string }) {
  const wa = soDigitos(f.telefone), ligar = f.telefone.replace(/[^\d+]/g, ""), aria = (t: string) => `${t} ${nome}`;
  return (
    <>
      {wa && <Button asChild variant="outline" className={BOTAO}><a href={`tel:${ligar}`} aria-label={aria("Ligar a")}><Phone aria-hidden="true" />Ligar</a></Button>}
      {wa && <Button asChild variant="outline" className={BOTAO}><a href={`https://wa.me/${wa.startsWith("351") ? wa : "351" + wa}`} target="_blank" rel="noopener noreferrer" aria-label={`${aria("WhatsApp para")} (abre noutro separador)`}><MessageCircle aria-hidden="true" />WhatsApp</a></Button>}
      {f.email && <Button asChild variant="outline" className={BOTAO}><a href={`mailto:${f.email}`} aria-label={aria("Email para")}><Mail aria-hidden="true" />Email</a></Button>}
    </>
  );
}

interface CabecalhoProps { p: PessoaApp; f: Perfil; nx: Proximo; aoProximo: () => void; nomeRef: RefObject<HTMLHeadingElement> }

export function FichaCabecalho({ p, f, nx, aoProximo, nomeRef }: CabecalhoProps) {
  const subtitulo = [p.papel === "lead" ? "Lead" : "Cliente", p.papel === "lead" ? etapaDe(p) : "", f.morada.localidade].filter(Boolean).join(" · ");
  return (
    <header className="mt-2 grid min-w-0 gap-4 lg:mt-0">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-1 basis-72 items-center gap-4">
          <AvatarPessoa nome={p.nome} className="h-16 w-16 shrink-0 text-lg" />
          <div className="min-w-0">
            <h2 ref={nomeRef} tabIndex={-1} className="break-words text-2xl font-semibold tracking-tight">{p.nome}</h2>
            <p className="break-words text-base text-muted-foreground">{subtitulo}</p>
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Contactos f={f} nome={p.nome} />
          <Button size="lg" className={cn(BOTAO, "cursor-pointer")} onClick={aoProximo}>{nx.btn || "Abrir negócio"}<ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></Button>
        </div>
      </div>
      <Etapas fase={p.principal.fase} />
      <Factos p={p} f={f} />
      <Avisos f={f} />
    </header>
  );
}
