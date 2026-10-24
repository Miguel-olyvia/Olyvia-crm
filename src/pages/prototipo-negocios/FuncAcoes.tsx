// As ações rápidas da V2 funcional: os botões de ícone de cada linha (Ligar, WhatsApp, Email, Registar chamada, Adiar) e a barra de ações
// da ficha (os mesmos, com texto, mais Nota e, nas leads em curso, Marcar como perdida). Ícones com aria-hidden e botões com aria-label;
// os tooltips só repetem o rótulo (não são essenciais).
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { CalendarClock, Mail, MessageCircle, NotebookPen, Phone, PhoneCall, XCircle, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Perfil } from "./perfilDocs";
import { BORDA_CTRL } from "./PessoaLinha";
import { Adiar, NotaRapida, RegistarChamada } from "./FuncRegistos";

export interface Contactos { tel: string | null; wa: string | null; mail: string | null }

/** Os links de contacto (tel:, wa.me e mailto:), ou `null` quando falta o dado. O WhatsApp leva o indicativo 351 se não o tiver. */
export function contactosDe(f: Pick<Perfil, "telefone" | "email">): Contactos {
  const digitos = f.telefone.replace(/\D/g, ""), ligar = f.telefone.replace(/[^\d+]/g, "");
  return {
    tel: digitos ? `tel:${ligar}` : null,
    wa: digitos ? `https://wa.me/${digitos.startsWith("351") ? digitos : "351" + digitos}` : null,
    mail: f.email.trim() ? `mailto:${encodeURIComponent(f.email.trim())}` : null,
  };
}

const ICONE = "min-h-11 min-w-11 px-0";

/** Um botão (ou link) de ícone, com aria-label e o rótulo em tooltip. Aceita o ref e os eventos de um gatilho de popover. */
const BotaoIcone = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<"button"> & { icone: LucideIcon; rotulo: string }>(
  ({ icone: I, rotulo, className, ...resto }, ref) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button ref={ref} type="button" variant="ghost" aria-label={rotulo} className={cn(ICONE, className)} {...resto}><I className="h-5 w-5" aria-hidden="true" /></Button>
      </TooltipTrigger>
      <TooltipContent className="calma">{rotulo}</TooltipContent>
    </Tooltip>
  ),
);
BotaoIcone.displayName = "BotaoIcone";

function LinkIcone({ href, icone: I, rotulo, externo }: { href: string; icone: LucideIcon; rotulo: string; externo?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button asChild variant="ghost" className={ICONE}>
          <a href={href} aria-label={rotulo} onClick={(e) => e.stopPropagation()} {...(externo ? { target: "_blank", rel: "noopener noreferrer" } : {})}><I className="h-5 w-5" aria-hidden="true" /></a>
        </Button>
      </TooltipTrigger>
      <TooltipContent className="calma">{rotulo}</TooltipContent>
    </Tooltip>
  );
}

interface AcoesProps { nome: string; f: Pick<Perfil, "telefone" | "email">; avisar: (msg: string) => void; leitura?: boolean; className?: string }

/** Os botões de ícone de uma linha. Em lg com rato aparecem com o foco ou o hover da linha; abaixo de lg e nos ecrãs táteis estão sempre à vista. */
export function AcoesLinha({ nome, f, avisar, leitura, className }: AcoesProps) {
  const c = contactosDe(f);
  // Só Enter e Espaço ficam no botão (não chegam à linha, que abre a ficha); j, k, setas e ? continuam para os atalhos.
  const parar = (e: React.SyntheticEvent): void => e.stopPropagation();
  const pararTecla = (e: React.KeyboardEvent): void => { if (e.key === "Enter" || e.key === " ") e.stopPropagation(); };
  return (
    <div role="group" aria-label={`Ações rápidas: ${nome}`} onClick={parar} onKeyDown={pararTecla}
      className={cn("flex shrink-0 flex-wrap items-center gap-0.5 transition-opacity motion-reduce:transition-none lg:[@media(hover:hover)]:opacity-0 lg:[@media(hover:hover)]:group-hover:opacity-100 lg:[@media(hover:hover)]:group-focus-within:opacity-100", className)}>
      {c.tel && <LinkIcone href={c.tel} icone={Phone} rotulo={`Ligar a ${nome}`} />}
      {c.wa && <LinkIcone href={c.wa} icone={MessageCircle} rotulo={`WhatsApp para ${nome} (abre noutro separador)`} externo />}
      {c.mail && <LinkIcone href={c.mail} icone={Mail} rotulo={`Email para ${nome}`} />}
      <RegistarChamada nome={nome} avisar={avisar} leitura={leitura} gatilho={<BotaoIcone icone={PhoneCall} rotulo={`Registar chamada de ${nome}`} />} />
      <Adiar nome={nome} avisar={avisar} leitura={leitura} gatilho={<BotaoIcone icone={CalendarClock} rotulo={`Adiar ${nome}`} />} />
    </div>
  );
}

const BotaoTexto = forwardRef<HTMLButtonElement, ComponentPropsWithoutRef<"button"> & { icone: LucideIcon; children: ReactNode }>(
  ({ icone: I, children, className, ...resto }, ref) => (
    <Button ref={ref} type="button" variant="outline" className={cn("min-h-11 min-w-11 text-[15px]", BORDA_CTRL, className)} {...resto}>
      <I className="h-4 w-4" aria-hidden="true" />{children}
    </Button>
  ),
);
BotaoTexto.displayName = "BotaoTexto";

function LinkTexto({ href, icone: I, rotulo, aria, externo }: { href: string; icone: LucideIcon; rotulo: string; aria: string; externo?: boolean }) {
  return (
    <Button asChild variant="outline" className={cn("min-h-11 min-w-11 text-[15px]", BORDA_CTRL)}>
      <a href={href} aria-label={aria} {...(externo ? { target: "_blank", rel: "noopener noreferrer" } : {})}><I className="h-4 w-4" aria-hidden="true" />{rotulo}</a>
    </Button>
  );
}

interface BarraProps extends AcoesProps {
  /** Só nas leads em curso: leva ao Resumo com a confirmação "Marcar como perdida". */
  perder?: () => void;
  /** O aviso da última ação, dentro do painel (o resto da página fica escondida enquanto ele está aberto). */
  aviso: string;
}

/** A barra de ações fixa no topo da ficha. */
export function BarraFicha({ nome, f, avisar, leitura, perder, aviso }: BarraProps) {
  const c = contactosDe(f);
  return (
    <div role="group" aria-label="Ações" className="flex min-w-0 flex-wrap items-center gap-2">
      {c.tel && <LinkTexto href={c.tel} icone={Phone} rotulo="Ligar" aria={`Ligar a ${nome}`} />}
      {c.wa && <LinkTexto href={c.wa} icone={MessageCircle} rotulo="WhatsApp" aria={`WhatsApp para ${nome} (abre noutro separador)`} externo />}
      {c.mail && <LinkTexto href={c.mail} icone={Mail} rotulo="Email" aria={`Email para ${nome}`} />}
      <RegistarChamada nome={nome} avisar={avisar} leitura={leitura} gatilho={<BotaoTexto icone={PhoneCall} aria-label="Registar chamada rápida">Registar chamada</BotaoTexto>} />
      <NotaRapida nome={nome} avisar={avisar} leitura={leitura} gatilho={<BotaoTexto icone={NotebookPen}>Nota</BotaoTexto>} />
      <Adiar nome={nome} avisar={avisar} leitura={leitura} gatilho={<BotaoTexto icone={CalendarClock}>Adiar</BotaoTexto>} />
      {perder && <BotaoTexto icone={XCircle} onClick={perder}>Marcar como perdida</BotaoTexto>}
      <p className="sr-only" aria-live="polite" aria-atomic="true">{aviso}</p>
    </div>
  );
}
