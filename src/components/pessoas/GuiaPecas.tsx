// As peças do guia do passo seguinte: a barra de fases (com a atual em `aria-current`), a lista de verificação da fase e o cartão do cliente com
// os últimos acontecimentos. Só apresentação: tudo chega por props e só se usam os tokens do tema (nada de cores fixas).
import { useId } from "react";
import { Check, Circle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { ligacoes } from "@/components/ficha-comum/ligacoesContacto";
import type { EstadoFase } from "./fasesDoNegocio";
import type { FaseGuia, ItemChecklist } from "./processo/passoGuiado";

const P = "pessoasPagina.";

const COR_SEGMENTO: Record<EstadoFase, string> = {
  feita: "bg-primary",
  atual: "bg-primary/50",
  porFazer: "bg-muted",
  perdida: "bg-destructive",
};

/**
 * A barra de fases: um segmento por fase com o nome por baixo. A atual leva `aria-current="step"` e o estado diz-se sempre por texto
 * (só para o leitor de ecrã), nunca só pela cor. No telemóvel só o nome da atual cabe: as outras ficam para o leitor de ecrã.
 */
export function BarraFasesGuia({ fases }: { fases: readonly FaseGuia[] }) {
  const { t } = useTranslation();
  if (fases.length === 0) return null;
  const indice = fases.findIndex((f) => f.estado === "atual" || f.estado === "perdida");
  return (
    <div className="space-y-1.5">
      <ol aria-label={t(`${P}guia.fases`)} className="grid list-none gap-1 p-0" style={{ gridTemplateColumns: `repeat(${fases.length}, minmax(0, 1fr))` }}>
        {fases.map((f) => {
          const atual = f.estado === "atual" || f.estado === "perdida";
          return (
            <li key={f.id} aria-current={atual ? "step" : undefined} className="min-w-0 space-y-1">
              <div aria-hidden="true" className={cn("h-1.5 rounded-full", COR_SEGMENTO[f.estado])} />
              <span className={cn("block truncate text-xs", atual ? "font-semibold text-foreground" : "text-muted-foreground", !atual && "max-sm:sr-only")}>
                {t(f.rotuloChave)}
              </span>
              <span className="sr-only">, {t(`${P}phases.state.${f.estado}`)}</span>
            </li>
          );
        })}
      </ol>
      {indice >= 0 && <p className="text-sm text-muted-foreground sm:hidden">{t(`${P}phases.progress`, { current: indice + 1, total: fases.length })}</p>}
    </div>
  );
}

/** A lista da fase: um visto (ícone) ou um círculo vazio mais o texto, e «feito» ou «por fazer» para o leitor de ecrã. */
export function ChecklistDoPasso({ itens, rotulo, id, className }: { itens: readonly ItemChecklist[]; rotulo: string; id?: string; className?: string }) {
  const { t } = useTranslation();
  return (
    <div id={id} className={className}>
      <p className="mb-2 text-sm text-muted-foreground">{rotulo}</p>
      <ul className="list-none space-y-2 p-0">
        {itens.map((c) => (
          <li key={c.id} className="flex min-h-8 items-center gap-2.5 text-[15px] text-foreground">
            <span
              aria-hidden="true"
              className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full", c.feito ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground")}
            >
              {c.feito ? <Check className="h-3 w-3" /> : <Circle className="h-2 w-2" />}
            </span>
            <span>{t(c.rotuloChave)}</span>
            <span className="sr-only">, {t(`${P}guia.check.${c.feito ? "feito" : "porFazer"}`)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Um dado da pessoa que o cartão não tem de série (distrito, NIF, empresa...): a chave dá o rótulo (`pessoasPagina.contact.label.<chave>`). */
export interface ExtraClienteGuia {
  chave: string;
  valor: string;
}

export interface DadosClienteGuia {
  telefone: string | null;
  email: string | null;
  morada: string | null;
  linha: string | null;
  /** O que o contacto antigo da ficha mostrava a mais (só se a pessoa o tem): um só conjunto de dados do cliente. */
  extras?: readonly ExtraClienteGuia[];
}

export interface AcontecimentoGuia {
  id: string;
  texto: string;
  /** Já formatado para mostrar (o dia). */
  quando: string;
}

function Campo({ rotulo, valor, href }: { rotulo: string; valor: string | null; href?: string }) {
  const { t } = useTranslation();
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{rotulo}</dt>
      <dd className={cn("break-words text-[15px]", valor ? "font-medium text-foreground" : "text-muted-foreground")}>
        {valor && href ? <a href={href} className="rounded-sm underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">{valor}</a> : valor ?? t(`${P}guia.cliente.vazio`)}
      </dd>
    </div>
  );
}

/** O cartão «Cliente» (o que a ficha sabe) e os «Últimos acontecimentos» (os mais recentes que a ficha já carregou). */
/** `nivel` é o dos títulos do cartão: h3 na ficha (o nome é o h2), h4 fora dela. */
export function CartaoClienteGuia({ cliente, acontecimentos, comLinha, nivel = "h4" }: { cliente: DadosClienteGuia; acontecimentos: readonly AcontecimentoGuia[]; comLinha: boolean; nivel?: "h3" | "h4" }) {
  const Titulo = nivel;
  const { t } = useTranslation();
  const id = useId();
  const l = ligacoes({ telefone: cliente.telefone, email: cliente.email });
  return (
    <aside className="space-y-4 rounded-xl border border-border bg-background p-4">
      <section aria-labelledby={`${id}-cliente`} className="space-y-3">
        <Titulo id={`${id}-cliente`} className="text-base font-semibold text-foreground">{t(`${P}guia.cliente`)}</Titulo>
        {/* Larga: duas colunas; no ecrã de três colunas (o cartão fica à direita) uma só. */}
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2 min-[1800px]:grid-cols-1">
          <Campo rotulo={t(`${P}guia.cliente.telefone`)} valor={cliente.telefone} href={l.telefone} />
          <Campo rotulo={t(`${P}guia.cliente.email`)} valor={cliente.email} href={l.email} />
          <Campo rotulo={t(`${P}guia.cliente.morada`)} valor={cliente.morada} />
          {comLinha && <Campo rotulo={t(`${P}guia.cliente.linha`)} valor={cliente.linha} />}
          {cliente.extras?.map((e) => <Campo key={e.chave} rotulo={t(`pessoasPagina.contact.label.${e.chave}`)} valor={e.valor} />)}
        </dl>
      </section>
      <section aria-labelledby={`${id}-acontecimentos`} className="space-y-2">
        <Titulo id={`${id}-acontecimentos`} className="text-base font-semibold text-foreground">{t(`${P}guia.acontecimentos`)}</Titulo>
        {acontecimentos.length === 0 ? (
          <p className="text-[15px] text-muted-foreground">{t(`${P}guia.acontecimentos.vazio`)}</p>
        ) : (
          <ul className="list-none space-y-2 p-0">
            {acontecimentos.map((a) => (
              <li key={a.id}>
                <p className="text-[15px] text-foreground">{a.texto}</p>
                <p className="text-sm tabular-nums text-muted-foreground">{a.quando}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  );
}
