// Uma linha de contacto de uma ficha: rótulo e valor (o valor pode ser uma ligação tel:, mailto: ou wa.me). Sem botão
// de copiar. Os textos chegam já traduzidos por props: este ficheiro não importa de pessoas nem de negocio-metas.
import { cn } from "@/lib/utils";
import { FOCO } from "./estilosAbas";

export interface LinhaContactoProps {
  rotulo: string;
  valor: string;
  /** Torna o valor uma ligação (tel:, mailto:). */
  href?: string;
  /** Opt-in: uma segunda ligação, ao lado do valor, para o WhatsApp (wa.me); abre noutro separador. */
  whatsapp?: { href: string; rotulo: string; avisoNovoSeparador: string };
  /** "ficha": o aspeto das secções da ficha (linhas compactas com uma linha fina a separá-las). Por defeito, o do painel. */
  variante?: "painel" | "ficha";
}

/** Na ficha a ligação não estica a linha: o alvo de 44 px vem de uma área invisível (::after) por cima e por baixo do texto. */
const LIGACAO = {
  painel: "inline-flex min-h-11 items-center rounded-sm text-primary underline underline-offset-2 dark:text-violet-300",
  ficha: "relative inline-flex items-center rounded-sm text-primary underline underline-offset-2 after:absolute after:inset-x-0 after:-inset-y-[11px] after:content-[''] dark:text-violet-300",
};

export const GRELHA = {
  painel: "grid grid-cols-1 items-center gap-x-2 sm:grid-cols-[8rem_1fr] border-b border-border py-1 last:border-b-0",
  ficha: "grid min-h-10 grid-cols-1 items-center gap-x-4 gap-y-0.5 border-b border-border py-1.5 last:border-b-0 sm:grid-cols-[9rem_minmax(0,1fr)]",
};
const ROTULO = { painel: "text-xs text-muted-foreground", ficha: "text-[15px] text-muted-foreground" };
const VALOR = { painel: "text-sm", ficha: "text-[15px]" };

export function LinhaContacto({ rotulo, valor, href, whatsapp, variante = "painel" }: LinhaContactoProps) {
  return (
    <div className={GRELHA[variante]}>
      <dt className={ROTULO[variante]}>{rotulo}</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-x-3">
        <span className={cn("min-w-0 break-words text-foreground", VALOR[variante])}>
          {href ? <a href={href} className={cn(LIGACAO[variante], FOCO)}>{valor}</a> : valor}
        </span>
        {whatsapp && (
          <a href={whatsapp.href} target="_blank" rel="noopener noreferrer" className={cn(LIGACAO[variante], VALOR[variante], FOCO)}>
            {whatsapp.rotulo}
            <span className="sr-only">{whatsapp.avisoNovoSeparador}</span>
          </a>
        )}
      </dd>
    </div>
  );
}
