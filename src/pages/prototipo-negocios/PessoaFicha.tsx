// A ficha de uma pessoa (coluna da direita no computador, ecrã inteiro no telemóvel): cabeçalho e cinco separadores.
import { useEffect, useRef } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, CircleAlert, CalendarDays, HeartPulse, Mail, Megaphone, MessageCircle, Phone, Share2, Tag, UserRound, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { FASES } from "./motor";
import { etapaDe, proximoDe } from "./leadsDocs";
import type { PessoaApp } from "./pessoasDocs";
import { perfilDe, type Perfil } from "./perfilDocs";
import { AvatarPessoa, BORDA_CTRL } from "./PessoaLinha";
import { FichaResumo } from "./FichaResumo";
import { SepAtividade, SepDocumentos, SepEntradas, SepNegocios } from "./FichaListas";
import { FASE_COR, FASE_ICONE, fazer, type Ctx } from "./pecas";

export type SepFicha = "resumo" | "negocios" | "entradas" | "atividade" | "contratos";
const SEP_BASE: { id: SepFicha; nome: string }[] = [
  { id: "resumo", nome: "Resumo" }, { id: "negocios", nome: "Negócios" }, { id: "entradas", nome: "Entradas" }, { id: "atividade", nome: "Atividade" },
];
/** Os clientes têm cinco separadores (mais os contratos e documentos); as leads, quatro. */
export const separadoresDe = (papel: PessoaApp["papel"]): { id: SepFicha; nome: string }[] =>
  papel === "cliente" ? [...SEP_BASE, { id: "contratos", nome: "Contratos e documentos" }] : SEP_BASE;

const soDigitos = (t: string): string => t.replace(/\D/g, "");
const ETIQUETA = "gap-1.5 px-3 py-1 text-[15px] font-medium text-foreground";

/** As seis etapas, com a atual marcada em texto e em ícone. Os traços das etapas por chegar têm contraste de controlo (3:1 ou mais). */
function Etapas({ fase }: { fase: number }) {
  return (
    <ol aria-label="Etapa da pessoa" className="grid grid-cols-3 gap-x-2 gap-y-3 sm:grid-cols-6">
      {FASES.map((nome, i) => {
        const I = i < fase ? Check : FASE_ICONE[i], atual = i === fase;
        return (
          <li key={nome} aria-current={atual ? "step" : undefined} className={cn("border-t-2 pt-2 text-[15px]", atual ? "border-primary font-semibold text-foreground" : i < fase ? "border-foreground text-foreground" : cn(BORDA_CTRL, "text-muted-foreground"))}>
            <span className="flex items-center gap-1.5">
              <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-md", i <= fase ? FASE_COR[i] : "bg-muted text-muted-foreground")} aria-hidden="true"><I className="h-4 w-4" /></span>
              {nome}
            </span>
            {atual && <span className="block">Atual</span>}
          </li>
        );
      })}
    </ol>
  );
}

function Saude({ f }: { f: Perfil }) {
  const { score, motivos, maus } = f.saude;
  return (
    <div role="group" aria-label="Saúde da pessoa" className="min-w-0">
      <p className="flex items-center gap-2 text-[15px]"><HeartPulse className="h-4 w-4 text-primary" aria-hidden="true" />Saúde <span className="text-base font-semibold tabular-nums">{score}/100</span><span className="text-muted-foreground">exemplo</span></p>
      <Progress value={score} aria-label={`Saúde ${score} em 100`} className="mt-1.5 h-2" />
      <ul className="mt-2 grid gap-1">
        {motivos.map((m, i) => {
          const I: LucideIcon = maus[i] ? CircleAlert : CheckCircle2;
          return <li key={m} className="flex items-center gap-2 text-[15px]"><I className={cn("h-4 w-4 shrink-0", maus[i] ? "text-destructive" : "text-emerald-700")} aria-hidden="true" />{m}</li>;
        })}
      </ul>
    </div>
  );
}

function Etiquetas({ f }: { f: Perfil }) {
  const item = (I: LucideIcon, t: string, k: string) => <Badge key={k} variant="outline" className={ETIQUETA}><I className="h-4 w-4 text-primary" aria-hidden="true" />{t}</Badge>;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Origem, canal, campanha, comercial e etiquetas">
      {[item(Megaphone, f.origem, "o"), item(Share2, f.canal, "c"), ...(f.campanha ? [item(Tag, f.campanha, "k")] : []), item(UserRound, f.comercial, "u"), item(CalendarDays, `Criada ${f.criadaHa || f.criada}`, "d")]
        .map((b, i) => <li key={i}>{b}</li>)}
      {f.tags.map((t) => <li key={t}><Badge variant="secondary" className={ETIQUETA}>{t}</Badge></li>)}
    </ul>
  );
}

function Contactos({ f, nome }: { f: Perfil; nome: string }) {
  const wa = soDigitos(f.telefone), ligar = f.telefone.replace(/[^\d+]/g, ""), aria = (t: string) => `${t} ${nome}`;
  return (
    <>
      {wa && <Button asChild variant="outline" className="min-h-11 text-[15px]"><a href={`tel:${ligar}`} aria-label={aria("Ligar a")}><Phone aria-hidden="true" />Ligar</a></Button>}
      {wa && <Button asChild variant="outline" className="min-h-11 text-[15px]"><a href={`https://wa.me/${wa.startsWith("351") ? wa : "351" + wa}`} target="_blank" rel="noopener noreferrer" aria-label={`${aria("WhatsApp para")} (abre noutro separador)`}><MessageCircle aria-hidden="true" />WhatsApp</a></Button>}
      {f.email && <Button asChild variant="outline" className="min-h-11 text-[15px]"><a href={`mailto:${f.email}`} aria-label={aria("Email para")}><Mail aria-hidden="true" />Email</a></Button>}
    </>
  );
}

export interface FichaProps extends Pick<Ctx, "S" | "A" | "go"> {
  p: PessoaApp;
  voltar: () => void;
  sep: SepFicha;
  aoMudarSep: (s: SepFicha) => void;
}

export function PessoaFicha({ S, A, go, p, voltar, sep, aoMudarSep }: FichaProps) {
  const f = perfilDe(p, S), d = p.principal, nx = proximoDe(p, S);
  const separadores = separadoresDe(p.papel), ativo = separadores.some((s) => s.id === sep) ? sep : "resumo";
  const abrir = (id: number) => go(() => A.abrir(id));
  // No telemóvel a ficha ocupa o ecrã: o foco vai para o nome, que anuncia a pessoa. No computador a lista mantém o foco.
  const nome = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (typeof window.matchMedia === "function" && !window.matchMedia("(min-width: 1024px)").matches) nome.current?.focus();
  }, []);
  return (
    <article className="px-4 pb-24 pt-4 sm:px-6 lg:px-8 lg:pb-10 lg:pt-6">
      <button type="button" onClick={go(() => { A.perderNao(); voltar(); })}
        className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg text-[15px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:hidden">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />Voltar às pessoas
      </button>
      <header className="mt-2 grid gap-5 lg:mt-0">
        <div className="flex items-center gap-4">
          <AvatarPessoa nome={p.nome} className="h-16 w-16 text-lg" />
          <div className="min-w-0">
            <h2 ref={nome} tabIndex={-1} className="break-words text-2xl font-semibold tracking-tight">{p.nome}</h2>
            <p className="text-base text-muted-foreground">{p.papel === "lead" ? `Lead · ${etapaDe(p)}` : "Cliente"} · {f.morada.localidade}</p>
          </div>
        </div>
        <Etapas fase={d.fase} />
        <div className="grid gap-5 sm:grid-cols-[minmax(0,16rem)_1fr]"><Saude f={f} /><Etiquetas f={f} /></div>
        <div className="flex flex-wrap items-center gap-2">
          <Contactos f={f} nome={p.nome} />
          <Button size="lg" className="min-h-11 cursor-pointer text-[15px] sm:ml-auto" onClick={go(() => (nx.act ? fazer(A, nx.act, d.id) : A.abrir(d.id)))}>
            {nx.btn || "Abrir negócio"}<ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </header>

      <Tabs value={ativo} onValueChange={(v) => aoMudarSep(v as SepFicha)} className="mt-6">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 p-1" aria-label={p.papel === "cliente" ? "Ficha do cliente" : "Ficha da lead"}>
          {separadores.map(({ id, nome }) => (
            <TabsTrigger key={id} value={id} className="min-h-11 cursor-pointer px-4 text-[15px] data-[state=active]:bg-foreground data-[state=active]:text-background">{nome}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="resumo" className="mt-5"><FichaResumo S={S} A={A} go={go} p={p} f={f} voltar={voltar} /></TabsContent>
        <TabsContent value="negocios" className="mt-5"><SepNegocios S={S} p={p} abrir={abrir} /></TabsContent>
        <TabsContent value="entradas" className="mt-5"><SepEntradas S={S} p={p} /></TabsContent>
        <TabsContent value="atividade" className="mt-5"><SepAtividade S={S} p={p} f={f} /></TabsContent>
        {p.papel === "cliente" && <TabsContent value="contratos" className="mt-5"><SepDocumentos S={S} p={p} abrir={abrir} /></TabsContent>}
      </Tabs>
    </article>
  );
}
