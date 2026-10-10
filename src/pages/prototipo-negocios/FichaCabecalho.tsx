// O cabeçalho da ficha de uma pessoa, em três faixas: (1) quem é, com as setas e Fechar; (2) as ações (Ligar, WhatsApp, Email e o próximo passo);
// (3) as seis etapas numa linha compacta. Os factos e os avisos vivem no Resumo. Tudo com min-w-0 e quebra para baixo quando falta largura.
import type { ReactNode } from "react";
import { ArrowRight, Check, Mail, MessageCircle, Phone, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { FASES, type Proximo } from "./motor";
import { atrasada } from "./leadsDocs";
import type { PessoaApp } from "./pessoasDocs";
import type { Perfil } from "./perfilDocs";
import { etapaTexto } from "./listaDocs";
import { Atrasada, AvatarPessoa, BORDA_CTRL } from "./PessoaLinha";
import { FASE_COR, FASE_ICONE } from "./pecas";

const soDigitos = (t: string): string => t.replace(/\D/g, "");
const BOTAO = "min-h-11 min-w-11 text-[15px]";

/** As seis etapas numa linha. Com largura mostram o nome de cada uma; sem ela só os ícones, e o nome da atual por baixo (ver .etapas em prototipo.css). */
function Etapas({ fase }: { fase: number }) {
  return (
    <div className="etapas-cx">
      <ol aria-label="Etapa da pessoa" className="etapas">
        {FASES.map((nome, i) => {
          const I = i < fase ? Check : FASE_ICONE[i], atual = i === fase;
          return (
            <li key={nome} aria-current={atual ? "step" : undefined} className={cn("border-t-2 pt-1.5 text-[15px]", atual ? "border-primary font-semibold text-foreground" : i < fase ? "border-foreground text-foreground" : cn(BORDA_CTRL, "text-muted-foreground"))}>
              <span className="flex flex-col items-start gap-0.5">
                <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-md", i <= fase ? FASE_COR[i] : "bg-muted text-muted-foreground")} aria-hidden="true"><I className="h-4 w-4" /></span>
                <span className="etapa-nome break-words">{nome}{atual && <span className="sr-only"> (atual)</span>}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="etapa-atual mt-1 text-[15px]" aria-hidden="true">Etapa atual: <span className="font-semibold">{FASES[fase]}</span></p>
    </div>
  );
}

interface ContactoProps { href: string; icone: LucideIcon; rotulo: string; aria: string; externo?: boolean }

/** Um botão secundário com ícone e rótulo; num ecrã estreito fica só o ícone, com o rótulo em tooltip e o aria-label sempre. */
function BotaoContacto({ href, icone: I, rotulo, aria, externo }: ContactoProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button asChild variant="outline" className={cn(BOTAO, BORDA_CTRL)}>
          <a href={href} aria-label={aria} {...(externo ? { target: "_blank", rel: "noopener noreferrer" } : {})}><I aria-hidden="true" /><span className="hidden sm:inline">{rotulo}</span></a>
        </Button>
      </TooltipTrigger>
      <TooltipContent className="calma sm:hidden">{rotulo}</TooltipContent>
    </Tooltip>
  );
}

function Contactos({ f, nome }: { f: Perfil; nome: string }) {
  const wa = soDigitos(f.telefone), ligar = f.telefone.replace(/[^\d+]/g, "");
  return (
    <>
      {wa && <BotaoContacto href={`tel:${ligar}`} icone={Phone} rotulo="Ligar" aria={`Ligar a ${nome}`} />}
      {wa && <BotaoContacto href={`https://wa.me/${wa.startsWith("351") ? wa : "351" + wa}`} icone={MessageCircle} rotulo="WhatsApp" aria={`WhatsApp para ${nome} (abre noutro separador)`} externo />}
      {f.email && <BotaoContacto href={`mailto:${f.email}`} icone={Mail} rotulo="Email" aria={`Email para ${nome}`} />}
    </>
  );
}

interface CabecalhoProps {
  p: PessoaApp;
  f: Perfil;
  nx: Proximo;
  aoProximo: () => void;
  /** As setas Anterior e Seguinte, a posição e Fechar (vêm do painel). */
  topo: ReactNode;
}

export function FichaCabecalho({ p, f, nx, aoProximo, topo }: CabecalhoProps) {
  const subtitulo = [p.papel === "lead" ? "Lead" : "Cliente", etapaTexto(p), f.morada.localidade].filter(Boolean).join(" · ");
  return (
    <header className="grid min-w-0 gap-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 basis-60 items-center gap-3">
          <AvatarPessoa nome={p.nome} className="h-12 w-12 shrink-0 text-lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <SheetTitle tabIndex={-1} className="break-words text-xl font-semibold tracking-tight">{p.nome}</SheetTitle>
              {atrasada(p) && <Atrasada />}
            </div>
            <SheetDescription className="break-words text-base text-muted-foreground">{subtitulo}</SheetDescription>
          </div>
        </div>
        {topo}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Contactos f={f} nome={p.nome} />
        <Button className={cn(BOTAO, "h-auto cursor-pointer whitespace-normal py-2 text-left")} onClick={aoProximo}>
          {nx.btn || "Abrir negócio"}<ArrowRight className="ml-2 h-4 w-4 shrink-0" aria-hidden="true" />
        </Button>
      </div>
      <Etapas fase={p.principal.fase} />
    </header>
  );
}
