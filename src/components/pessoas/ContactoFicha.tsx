// Os dados de contacto da ficha: rótulo e valor, com um botão de ícone "Copiar" ao lado (irmão do valor, nunca dentro
// de um botão). Telefone e email são ligações. Copia para a área de transferência e, se não puder, seleciona o texto.
import { useId, useRef } from "react";
import { Copy } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/negocio-metas/estilos";
import type { Traduzir } from "@/components/negocio-metas/saudeNegocio";
import { ligacoes } from "./acoesPessoa";
import { useAnunciar } from "./anuncioFicha";
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

function selecionarTexto(el: HTMLElement | null): void {
  const selecao = window.getSelection();
  if (!el || !selecao) return;
  const intervalo = document.createRange();
  intervalo.selectNodeContents(el);
  selecao.removeAllRanges();
  selecao.addRange(intervalo);
}

/** Copia (ou, se não puder, seleciona o texto) e diz o resultado num toast e na região de anúncios da ficha. */
async function copiar(campo: Campo, el: HTMLElement | null, t: Traduzir, anunciar: (m: string) => void): Promise<void> {
  try {
    await navigator.clipboard.writeText(campo.valor);
    const mensagem = t(`pessoasPagina.contact.copied.${campo.chave}`);
    toast.success(mensagem);
    anunciar(mensagem);
  } catch {
    selecionarTexto(el);
    const mensagem = t("pessoasPagina.contact.selected");
    toast.info(mensagem);
    anunciar(mensagem);
  }
}

function LinhaContacto({ campo }: { campo: Campo }) {
  const { t } = useTranslation();
  const valor = useRef<HTMLSpanElement>(null);
  const anunciar = useAnunciar();
  return (
    <div className="grid grid-cols-[8rem_1fr] items-center gap-2 border-b border-border py-1 last:border-b-0">
      <dt className="text-xs text-muted-foreground">{t(`pessoasPagina.contact.label.${campo.chave}`)}</dt>
      <dd className="flex min-w-0 items-center justify-between gap-1">
        <span ref={valor} className="min-w-0 break-words text-sm text-foreground">
          {campo.href ? (
            <a href={campo.href} className={cn("inline-flex min-h-11 items-center rounded-sm text-primary underline underline-offset-2", FOCO)}>
              {campo.valor}
            </a>
          ) : campo.valor}
        </span>
        {!campo.semCopia && (
          <Button
            type="button" variant="ghost" className={cn("h-11 w-11 shrink-0 p-0", FOCO)}
            aria-label={t(`pessoasPagina.contact.copy.${campo.chave}`)} onClick={() => void copiar(campo, valor.current, t, anunciar)}
          >
            <Copy aria-hidden="true" />
          </Button>
        )}
      </dd>
    </div>
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
        <dl>{campos.map((c) => <LinhaContacto key={c.chave} campo={c} />)}</dl>
      )}
    </section>
  );
}
