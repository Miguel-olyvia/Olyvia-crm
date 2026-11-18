import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/RichTextEditor";
import { obterIdioma } from "@/lib/idiomaDocumento";
import { textoSimples } from "@/lib/idiomaDocumento/texto";
import { useTranslation } from "@/hooks/useTranslation";

/** O português do template (o que o editor tem em `config`), só o que este separador lê. */
export interface BaseDoConteudo {
  header_text?: string | null;
  footer_text?: string | null;
  terms_conditions?: string | null;
  thank_you_message?: string | null;
  accept_button_text?: string | null;
  reject_button_text?: string | null;
  email_subject?: string | null;
  email_body?: string | null;
  verification_email_subject?: string | null;
  verification_email_body?: string | null;
  accept_enabled?: boolean;
  accept_verification_method?: string;
}

interface ConteudoPorIdiomaProps {
  codigo: string;
  base: BaseDoConteudo;
  valorDoTexto: (campo: string) => string;
  onEscrever: (campo: string, valor: string) => void;
}

type Tipo = "linha" | "caixa" | "html";
type CampoTexto = Exclude<keyof BaseDoConteudo, "accept_enabled" | "accept_verification_method">;

interface CampoDaLista {
  campo: CampoTexto;
  tipo: Tipo;
  linhas?: number;
}

/** HTML sem texto nem imagens (o que o editor rico deixa quando se apaga tudo) conta como vazio. */
function htmlVazio(html: string): boolean {
  return textoSimples(html) === "" && !/<img\b/i.test(html);
}

function CampoDeTexto({ campo, tipo, linhas, codigo, base, valor, onEscrever }: CampoDaLista & {
  codigo: string;
  base: string;
  valor: string;
  onEscrever: (campo: string, valor: string) => void;
}) {
  const { t } = useTranslation();
  const idioma = obterIdioma(codigo)?.nomeNativo ?? codigo;
  const rotulo = t(`proposalTemplateEditor.versions.field.${campo}`);
  const id = `versao-${campo}`;
  const ajuda = `${id}-pt`;
  const portugues = textoSimples(base);

  return (
    <div className="space-y-1">
      <Label id={`${id}-rotulo`} htmlFor={tipo === "html" ? undefined : id} className="text-xs">{rotulo}</Label>
      <p id={ajuda} className="line-clamp-3 text-xs text-muted-foreground">
        <span className="font-medium">{t("proposalTemplateEditor.versions.field.inPortuguese")}: </span>
        {portugues || t("proposalTemplateEditor.versions.field.noPortuguese")}
      </p>
      {tipo === "html" ? (
        <div role="group" aria-labelledby={`${id}-rotulo`} aria-describedby={ajuda}>
          <RichTextEditor
            value={valor}
            onChange={(v) => onEscrever(campo, htmlVazio(v) ? "" : v)}
            placeholder={`${rotulo} (${idioma})`}
            minHeight="120px"
          />
        </div>
      ) : tipo === "caixa" ? (
        <Textarea id={id} aria-describedby={ajuda} value={valor} rows={linhas ?? 3} className="text-xs" onChange={(e) => onEscrever(campo, e.target.value)} />
      ) : (
        <Input id={id} aria-describedby={ajuda} value={valor} className="h-9 text-xs" onChange={(e) => onEscrever(campo, e.target.value)} />
      )}
      <p className="text-[10px] text-muted-foreground">{t("proposalTemplateEditor.versions.field.fallback")}</p>
    </div>
  );
}

export function ConteudoPorIdioma({ codigo, base, valorDoTexto, onEscrever }: ConteudoPorIdiomaProps) {
  const { t } = useTranslation();
  const comVerificacao = base.accept_enabled !== false && base.accept_verification_method === "email";
  const mostrarCabecalho = typeof base.header_text === "string" && base.header_text.trim() !== "";

  const bloco = (campos: CampoDaLista[]) =>
    campos.map((c) => (
      <CampoDeTexto key={c.campo} {...c} codigo={codigo} base={base[c.campo] ?? ""} valor={valorDoTexto(c.campo)} onEscrever={onEscrever} />
    ));

  return (
    <div className="space-y-4">
      {mostrarCabecalho && bloco([{ campo: "header_text", tipo: "caixa", linhas: 2 }])}

      <section aria-label={t("proposalTemplateEditor.versions.field.emailHeading")} className="space-y-3 rounded-lg border bg-muted/30 p-3">
        <h3 className="text-xs font-medium">{t("proposalTemplateEditor.versions.field.emailHeading")}</h3>
        {bloco([{ campo: "email_subject", tipo: "linha" }, { campo: "email_body", tipo: "html" }])}
      </section>

      {bloco([
        { campo: "terms_conditions", tipo: "caixa", linhas: 4 },
        { campo: "thank_you_message", tipo: "caixa", linhas: 2 },
        { campo: "footer_text", tipo: "caixa", linhas: 2 },
        { campo: "accept_button_text", tipo: "linha" },
        { campo: "reject_button_text", tipo: "linha" },
      ])}

      {comVerificacao && (
        <section aria-label={t("proposalTemplateEditor.versions.field.verificationHeading")} className="space-y-3 rounded-lg border bg-muted/30 p-3">
          <h3 className="text-xs font-medium">{t("proposalTemplateEditor.versions.field.verificationHeading")}</h3>
          {bloco([{ campo: "verification_email_subject", tipo: "linha" }, { campo: "verification_email_body", tipo: "html" }])}
        </section>
      )}
    </div>
  );
}
