// Os dados de contacto da ficha: rótulo e valor, com um botão de ícone "Copiar" ao lado (irmão do valor, nunca dentro
// de um botão; ver `ficha-comum/LinhaContacto`). Telefone e email são ligações.
import { useId } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { LinhaContacto } from "@/components/ficha-comum/LinhaContacto";
import { ligacoes } from "./acoesPessoa";
import { MarcaExemplo } from "./SelosPessoa";
import type { Pessoa } from "./pessoasTipos";

type ChaveCampo = "telefone" | "email" | "morada" | "nif" | "empresa" | "nifEmpresa" | "contacto";

interface Campo {
  chave: ChaveCampo;
  valor: string;
  href?: string;
  /** Sem cópia (o nome da empresa só se lê). */
  semCopia?: boolean;
}

/** Os campos que a pessoa tem, pela ordem em que se mostram. */
function camposDeContacto(pessoa: Pessoa): Campo[] {
  const l = ligacoes(pessoa.contacto);
  const { telefone, email } = pessoa.contacto;
  const m = pessoa.morada;
  const campos: (Campo | null)[] = [
    telefone ? { chave: "telefone", valor: telefone, href: l.telefone } : null,
    email ? { chave: "email", valor: email, href: l.email } : null,
    m ? { chave: "morada", valor: `${m.linha}, ${m.cp} ${m.localidade}` } : null,
    pessoa.nif ? { chave: "nif", valor: pessoa.nif } : null,
    pessoa.empresa ? { chave: "empresa", valor: pessoa.empresa.nome, semCopia: true } : null,
    pessoa.empresa?.nif ? { chave: "nifEmpresa", valor: pessoa.empresa.nif } : null,
    pessoa.empresa?.contacto ? { chave: "contacto", valor: pessoa.empresa.contacto } : null,
  ];
  return campos.filter((c): c is Campo => c !== null);
}

function LinhaDoCampo({ campo }: { campo: Campo }) {
  const { t } = useTranslation();
  return (
    <LinhaContacto
      rotulo={t(`pessoasPagina.contact.label.${campo.chave}`)} valor={campo.valor} href={campo.href}
      copia={campo.semCopia ? undefined : {
        rotulo: t(`pessoasPagina.contact.copy.${campo.chave}`),
        mensagemCopiado: t(`pessoasPagina.contact.copied.${campo.chave}`),
        mensagemSelecionado: t("pessoasPagina.contact.selected"),
      }}
    />
  );
}

export function ContactoFicha({ pessoa }: { pessoa: Pessoa }) {
  const { t } = useTranslation();
  const campos = camposDeContacto(pessoa);
  const idTitulo = useId();
  return (
    <section aria-labelledby={idTitulo} className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 id={idTitulo} className="text-sm font-semibold text-foreground">{t("pessoasPagina.contact.title")}</h3>
        <MarcaExemplo />
      </div>
      {campos.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("pessoasPagina.contact.none")}</p>
      ) : (
        <dl>{campos.map((c) => <LinhaDoCampo key={c.chave} campo={c} />)}</dl>
      )}
    </section>
  );
}
