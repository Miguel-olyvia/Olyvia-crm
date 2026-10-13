import { useId } from "react";
import { Mail, Phone } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/negocio-metas/estilos";
import { cn } from "@/lib/utils";
import type { Pessoa } from "./pessoasTipos";

interface BlocoCandidataProps {
  /** O título do bloco: "Coincide com a lead que já existe", "Pelo email", "Pelo telefone". */
  titulo: string;
  pessoa: Pessoa;
  emailIgual: boolean;
  telefoneIgual: boolean;
  /** "É esta pessoa" (conflito); sem ele, o bloco só mostra. */
  aoEscolher?: () => void;
  aoAbrirFicha: (id: string) => void;
}

/** "igual" em texto: a coincidência nunca se diz só pela cor. */
function Igual() {
  const { t } = useTranslation();
  return (
    <span className="rounded-full border border-success bg-success/20 px-1.5 py-0 text-[11px] font-semibold text-foreground">
      {t("pessoasPagina.match.same")}
    </span>
  );
}

function LinhaContacto({ icone, valor, vazio, igual }: { icone: "mail" | "phone"; valor: string | null; vazio: string; igual: boolean }) {
  const Icone = icone === "mail" ? Mail : Phone;
  return (
    <p className={cn("flex flex-wrap items-center gap-1.5 text-sm", !valor && "text-muted-foreground")}>
      <Icone className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="tabular-nums">{valor ?? vazio}</span>
      {valor && igual && <Igual />}
    </p>
  );
}

/** A candidata da lista: nome (abre a ficha), email e telefone com "igual" onde coincidem. */
export function BlocoCandidata({ titulo, pessoa, emailIgual, telefoneIgual, aoEscolher, aoAbrirFicha }: BlocoCandidataProps) {
  const { t } = useTranslation();
  const idTitulo = useId();
  return (
    <div role="group" aria-labelledby={idTitulo} className="space-y-1.5 rounded-lg border border-border bg-muted/40 p-3">
      <h3 id={idTitulo} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</h3>
      <button
        type="button" onClick={() => aoAbrirFicha(pessoa.id)} aria-label={t("pessoasPagina.match.openFile", { name: pessoa.nome })}
        className={cn("min-h-11 rounded-sm text-left text-sm font-medium text-foreground underline-offset-2 hover:underline", FOCO)}
      >
        {pessoa.nome}
      </button>
      <LinhaContacto icone="mail" valor={pessoa.contacto.email} vazio={t("pessoasPagina.match.noEmail")} igual={emailIgual} />
      <LinhaContacto icone="phone" valor={pessoa.contacto.telefone} vazio={t("pessoasPagina.match.noPhone")} igual={telefoneIgual} />
      {aoEscolher && (
        <Button
          type="button" variant="outline" className={cn("mt-1 min-h-11", FOCO)} onClick={aoEscolher}
          aria-label={t("pessoasPagina.action.thisPersonNamed", { name: pessoa.nome })}
        >
          {t("pessoasPagina.action.thisPerson")}
        </Button>
      )}
    </div>
  );
}
