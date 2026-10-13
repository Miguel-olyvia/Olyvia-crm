import { useId } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import type { DadosPessoaPainel } from "@/components/ficha-comum/dadosPessoaPainel";
import { LinhaContacto, type CopiaContacto } from "@/components/ficha-comum/LinhaContacto";
import { ligacoes } from "@/components/ficha-comum/ligacoesContacto";
import { TituloPainel } from "./CamposPainel";
import { formatarData } from "./negocioPainel";

type CampoCopiavel = "phone" | "email" | "address";

/** O que acontece ao copiar um campo: o nome do botão e as duas mensagens (copiado, ou só selecionado). */
function copiaDe(t: (chave: string) => string, campo: CampoCopiavel): CopiaContacto {
  return {
    rotulo: t(`businessGoals.painel.person.copy.${campo}`),
    mensagemCopiado: t(`businessGoals.painel.person.copied.${campo}`),
    mensagemSelecionado: t("businessGoals.painel.person.selected"),
  };
}

function Dados({ pessoa }: { pessoa: DadosPessoaPainel }) {
  const { t } = useTranslation();
  const id = useId();
  const ultimo = pessoa.ultimoContactoDias <= 0
    ? t("businessGoals.painel.person.today")
    : t("businessGoals.painel.person.ago", { dias: t(pessoa.ultimoContactoDias === 1 ? "businessGoals.days.longOne" : "businessGoals.days.long", { count: pessoa.ultimoContactoDias }) });
  const linhas: readonly [string, string | null][] = [
    ["role", t(`businessGoals.painel.person.roles.${pessoa.papel}`)],
    ["stage", t(`businessGoals.painel.person.stages.${pessoa.etapa}`)],
    ["company", pessoa.empresa],
    ["origin", t(`businessGoals.painel.person.origins.${pessoa.origem}`)],
    ["last", ultimo],
    ["owner", pessoa.comercial],
    ["since", pessoa.desde ? formatarData(pessoa.desde) : null],
  ];
  return (
    <section aria-labelledby={id} className="space-y-1">
      <TituloPainel id={id}>{t("businessGoals.painel.person.data")}</TituloPainel>
      <dl>
        {linhas.filter((l): l is [string, string] => l[1] !== null).map(([chave, valor]) => (
          <LinhaContacto key={chave} rotulo={t(`businessGoals.painel.person.label.${chave}`)} valor={valor} />
        ))}
      </dl>
    </section>
  );
}

function Contacto({ pessoa }: { pessoa: DadosPessoaPainel }) {
  const { t } = useTranslation();
  const id = useId();
  const l = ligacoes({ telefone: pessoa.telefone, email: pessoa.email });
  const vazio = !pessoa.telefone && !pessoa.email && !pessoa.morada && !pessoa.distrito;
  return (
    <section aria-labelledby={id} className="space-y-1">
      <TituloPainel id={id}>{t("businessGoals.painel.person.contact")}</TituloPainel>
      {vazio ? (
        <p className="text-sm text-muted-foreground">{t("businessGoals.painel.person.noContact")}</p>
      ) : (
        <dl>
          {pessoa.telefone && (
            <LinhaContacto
              rotulo={t("businessGoals.painel.person.label.phone")} valor={pessoa.telefone} href={l.telefone}
              whatsapp={l.whatsapp ? {
                href: l.whatsapp, rotulo: t("businessGoals.painel.person.whatsapp"), avisoNovoSeparador: t("businessGoals.painel.person.newTab"),
              } : undefined}
              copia={copiaDe(t, "phone")}
            />
          )}
          {pessoa.email && (
            <LinhaContacto rotulo={t("businessGoals.painel.person.label.email")} valor={pessoa.email} href={l.email} copia={copiaDe(t, "email")} />
          )}
          {pessoa.morada && (
            <LinhaContacto rotulo={t("businessGoals.painel.person.label.address")} valor={pessoa.morada} copia={copiaDe(t, "address")} />
          )}
          {pessoa.distrito && <LinhaContacto rotulo={t("businessGoals.painel.person.label.district")} valor={pessoa.distrito} />}
        </dl>
      )}
    </section>
  );
}

/** O separador Pessoa: os dados da ficha e o contacto, com ligações e botões de copiar de 44 px; sem ficha, um estado vazio. */
export function PessoaPainel({ pessoa }: { pessoa: DadosPessoaPainel | null }) {
  const { t } = useTranslation();
  if (!pessoa) return <p className="text-sm text-muted-foreground">{t("businessGoals.painel.person.empty")}</p>;
  return (
    <div className="space-y-5">
      <Dados pessoa={pessoa} />
      <Contacto pessoa={pessoa} />
    </div>
  );
}
