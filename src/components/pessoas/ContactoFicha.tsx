// Os dados de contacto da ficha: rótulo e valor, sem botão de copiar (ver `ficha-comum/LinhaContacto`). Telefone e
// email são ligações.
import { useTranslation } from "@/hooks/useTranslation";
import { LinhaContacto } from "@/components/ficha-comum/LinhaContacto";
import { Seccao } from "@/components/ficha-comum/Seccao";
import { ligacoes } from "./acoesPessoa";
import { MarcaExemplo } from "./SelosPessoa";
import type { Pessoa } from "./pessoasTipos";

type ChaveCampo = "telefone" | "email" | "morada" | "distrito" | "nif" | "empresa" | "nifEmpresa" | "contacto";

interface Campo {
  chave: ChaveCampo;
  valor: string;
  href?: string;
}

/** Os campos que a pessoa tem, pela ordem em que se mostram. */
export function camposDeContacto(pessoa: Pessoa): Campo[] {
  const l = ligacoes(pessoa.contacto);
  const { telefone, email } = pessoa.contacto;
  const m = pessoa.morada;
  const campos: (Campo | null)[] = [
    telefone ? { chave: "telefone", valor: telefone, href: l.telefone } : null,
    email ? { chave: "email", valor: email, href: l.email } : null,
    m ? { chave: "morada", valor: `${m.linha}, ${m.cp} ${m.localidade}` } : null,
    pessoa.distrito ? { chave: "distrito", valor: pessoa.distrito } : null,
    pessoa.nif ? { chave: "nif", valor: pessoa.nif } : null,
    pessoa.empresa ? { chave: "empresa", valor: pessoa.empresa.nome } : null,
    pessoa.empresa?.nif ? { chave: "nifEmpresa", valor: pessoa.empresa.nif } : null,
    pessoa.empresa?.contacto ? { chave: "contacto", valor: pessoa.empresa.contacto } : null,
  ];
  return campos.filter((c): c is Campo => c !== null);
}

function LinhaDoCampo({ campo }: { campo: Campo }) {
  const { t } = useTranslation();
  return (
    <LinhaContacto
      variante="ficha" rotulo={t(`pessoasPagina.contact.label.${campo.chave}`)} valor={campo.valor} href={campo.href}
    />
  );
}

export function ContactoFicha({ pessoa }: { pessoa: Pessoa }) {
  const { t } = useTranslation();
  const campos = camposDeContacto(pessoa);
  return (
    <Seccao titulo={t("pessoasPagina.contact.title")} marca={<MarcaExemplo />}>
      {campos.length === 0 ? (
        <p className="text-[15px] text-muted-foreground">{t("pessoasPagina.contact.none")}</p>
      ) : (
        <dl>{campos.map((c) => <LinhaDoCampo key={c.chave} campo={c} />)}</dl>
      )}
    </Seccao>
  );
}
