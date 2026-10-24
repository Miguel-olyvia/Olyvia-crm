// Uma submissão pendente na ficha, em linha dividida (não em cartão): selos com ícone e texto, a data e a hora completas bem
// à vista (com o "há quanto"), a campanha e o formulário, as candidatas e os campos submetidos. A mais recente leva "Nova".
import { AlertTriangle, FileText, Mail, Phone } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LinhaCampo, ListaCampos } from "@/components/ficha-comum/ListaCampos";
import { FOCO } from "@/components/negocio-metas/estilos";
import { textoDataCompleta, textoHaQuanto } from "./formatoPessoas";
import type { Pessoa, Submissao } from "./pessoasTipos";

const P = "pessoasPagina.";
const SELO = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium text-foreground";

/** "igual" em texto: a coincidência nunca se diz só pela cor. */
function Igual() {
  const { t } = useTranslation();
  return <span className="rounded-full border border-success bg-success/20 px-1.5 text-[11px] font-semibold text-foreground">{t(`${P}match.same`)}</span>;
}

/** A candidata: nome, email e telefone, com "igual" onde coincide com o que foi submetido. */
function Candidata({ pessoa, emailIgual, telefoneIgual }: { pessoa: Pessoa; emailIgual: boolean; telefoneIgual: boolean }) {
  const { t } = useTranslation();
  const { email, telefone } = pessoa.contacto;
  return (
    <li className="space-y-0.5 text-[15px]">
      <p className="font-medium text-foreground">{pessoa.nome}</p>
      <p className={cn("flex flex-wrap items-center gap-1.5", !email && "text-muted-foreground")}>
        <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
        {email ?? t(`${P}match.noEmail`)}
        {email && emailIgual && <Igual />}
      </p>
      <p className={cn("flex flex-wrap items-center gap-1.5", !telefone && "text-muted-foreground")}>
        <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="tabular-nums">{telefone ?? t(`${P}match.noPhone`)}</span>
        {telefone && telefoneIgual && <Igual />}
      </p>
    </li>
  );
}

interface LinhaSubmissaoProps {
  submissao: Submissao;
  hoje: string;
  /** A mais recente das pendentes: leva a etiqueta "Nova". */
  maisRecente: boolean;
  pessoas: ReadonlyMap<string, Pessoa>;
  /** "É esta pessoa" num conflito; "Registar na ficha como nota" nas outras. */
  aoPedir: () => void;
}

export function LinhaSubmissao({ submissao: s, hoje, maisRecente, pessoas, aoPedir }: LinhaSubmissaoProps) {
  const { t } = useTranslation();
  const conflito = s.codigo === "CONFLITO";
  const candidatas = s.candidatas.flatMap((c) => {
    const pessoa = pessoas.get(c.pessoaId);
    return pessoa ? [{ pessoa, via: c.via }] : [];
  });
  return (
    <li className="space-y-3 border-b border-border py-4 first:pt-0 last:border-b-0">
      <div className="flex flex-wrap items-center gap-1.5">
        {maisRecente && (
          <span className={cn(SELO, "border-primary bg-primary text-primary-foreground")}>{t(`${P}subs.newest`)}</span>
        )}
        {conflito && (
          <span className={cn(SELO, "border-destructive bg-destructive/15")}>
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            {t(`${P}badge.conflict`)}
          </span>
        )}
        <span className={cn(SELO, "border-border bg-muted")}>
          <FileText className="h-3 w-3" aria-hidden="true" />
          {t(`${P}type.${s.tipo}`)}
        </span>
      </div>
      <p className="text-[15px]">
        <span className="font-semibold text-foreground">{textoDataCompleta(t, s.data, hoje)}</span>
        <span className="text-muted-foreground"> · {textoHaQuanto(t, s.data, hoje)}</span>
      </p>
      <p className="text-sm text-muted-foreground">
        {t(`${P}card.campaign`, { name: s.campanha })} · {t(`${P}card.form`, { name: s.formulario })}
      </p>
      <ul className="space-y-2">
        {candidatas.map(({ pessoa, via }) => (
          <Candidata
            key={pessoa.id} pessoa={pessoa} emailIgual={conflito ? via !== "telefone" : s._meta.emailIgual}
            telefoneIgual={conflito ? via !== "email" : s._meta.telefoneIgual}
          />
        ))}
      </ul>
      <ListaCampos>{s.campos.map((c) => <LinhaCampo key={c.rotulo} rotulo={c.rotulo}>{c.valor}</LinhaCampo>)}</ListaCampos>
      <Button type="button" variant={conflito ? "outline" : "default"} className={cn("min-h-11", FOCO)} onClick={aoPedir}>
        {t(conflito ? `${P}action.thisPerson` : `${P}action.register`)}
      </Button>
    </li>
  );
}
