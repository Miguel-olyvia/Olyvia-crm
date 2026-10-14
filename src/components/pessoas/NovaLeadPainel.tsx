import { useId, useRef, useState, type FormEvent, type Ref } from "react";
import { AlertCircle, ChevronRight, Sparkles, X } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { FOCO } from "@/components/negocio-metas/estilos";
import { COMERCIAL_POR_OMISSAO, COMERCIAIS_EXEMPLO } from "@/components/negocio-metas/novoNegocio";
import { MAX_NOTA_LEAD, ORIGENS_LEAD, validarNovaLead, type DadosNovaLead, type ErroLead, type ErrosNovaLead } from "./novaLead";
import type { OrigemPessoa } from "./pessoasTipos";

const L = "pessoasPagina.newLead.";

const DADOS_VAZIOS: DadosNovaLead = {
  nome: "", telefone: "", email: "", localidade: "", origem: "telefone", formulario: "", comercial: COMERCIAL_POR_OMISSAO, nota: "",
};

interface NovaLeadPainelProps {
  aberto: boolean;
  aoMudarAberto: (aberto: boolean) => void;
  /** Chamado ao confirmar, com o painel já a fechar. */
  aoCriar: (dados: DadosNovaLead) => void;
}

/** O erro de um campo: ícone e texto (a cor não é o único sinal), ligado ao campo por aria-describedby. */
function Erro({ id, campo, erro }: { id: string; campo: string; erro: ErroLead | undefined }) {
  const { t } = useTranslation();
  if (!erro) return null;
  return (
    <p id={id} className="flex items-center gap-1.5 text-sm text-destructive">
      <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
      {t(`${L}error.${campo}.${erro}`)}
    </p>
  );
}

interface CampoTextoProps {
  id: string;
  campo: keyof DadosNovaLead;
  valor: string;
  erro?: ErroLead;
  obrigatorio?: boolean;
  tipo?: string;
  inputMode?: "tel" | "email";
  autoComplete?: string;
  inputRef?: Ref<HTMLInputElement>;
  aoMudar: (campo: keyof DadosNovaLead, valor: string) => void;
}

function CampoTexto({ id, campo, valor, erro, obrigatorio, tipo = "text", inputMode, autoComplete, inputRef, aoMudar }: CampoTextoProps) {
  const { t } = useTranslation();
  const idCampo = `${id}-${campo}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={idCampo}>
        {t(`${L}${campo}`)}
        {obrigatorio && (
          <>
            <span aria-hidden="true"> *</span>
            <span className="sr-only"> ({t(`${L}required`)})</span>
          </>
        )}
      </Label>
      <Input
        ref={inputRef} id={idCampo} type={tipo} inputMode={inputMode} autoComplete={autoComplete} value={valor}
        aria-required={obrigatorio || undefined} aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? `${idCampo}-erro` : undefined} className={cn("min-h-11", FOCO, erro && "border-destructive")}
        onChange={(e) => aoMudar(campo, e.target.value)}
      />
      <Erro id={`${idCampo}-erro`} campo={campo} erro={erro} />
    </div>
  );
}

interface CamposProps {
  id: string;
  dados: DadosNovaLead;
  erros: ErrosNovaLead;
  primeiroCampo: Ref<HTMLInputElement>;
  aoMudar: (campo: keyof DadosNovaLead, valor: string) => void;
}

function CampoNota({ id, valor, erro, aoMudar }: { id: string; valor: string; erro?: ErroLead; aoMudar: CamposProps["aoMudar"] }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${id}-nota`}>{t(`${L}nota`)}</Label>
      <Textarea
        id={`${id}-nota`} value={valor} rows={3} aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? `${id}-nota-erro` : undefined} className={cn(FOCO, erro && "border-destructive")}
        onChange={(e) => aoMudar("nota", e.target.value)}
      />
      <p className="text-xs text-muted-foreground">{t(`${L}nota.count`, { count: valor.trim().length, max: MAX_NOTA_LEAD })}</p>
      <Erro id={`${id}-nota-erro`} campo="nota" erro={erro} />
    </div>
  );
}

/** Os campos do formulário: só o nome é obrigatório. */
function Campos({ id, dados, erros, primeiroCampo, aoMudar }: CamposProps) {
  const { t } = useTranslation();
  const comum = { id, aoMudar };
  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
      <CampoTexto {...comum} campo="nome" valor={dados.nome} erro={erros.nome} obrigatorio autoComplete="off" inputRef={primeiroCampo} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <CampoTexto {...comum} campo="telefone" valor={dados.telefone} erro={erros.telefone} tipo="tel" inputMode="tel" autoComplete="off" />
        <CampoTexto {...comum} campo="email" valor={dados.email} erro={erros.email} inputMode="email" autoComplete="off" />
      </div>
      <CampoTexto {...comum} campo="localidade" valor={dados.localidade} autoComplete="off" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-origem`}>{t(`${L}origem`)}</Label>
          <NativeSelect
            id={`${id}-origem`} value={dados.origem} className={cn("h-11", FOCO)}
            options={ORIGENS_LEAD.map((o) => ({ value: o, label: t(`pessoasPagina.origin.${o}`) }))}
            onValueChange={(v) => aoMudar("origem", v as OrigemPessoa)}
          />
        </div>
        <CampoTexto {...comum} campo="formulario" valor={dados.formulario} autoComplete="off" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-comercial`}>{t(`${L}comercial`)}</Label>
        <NativeSelect
          id={`${id}-comercial`} value={dados.comercial} className={cn("h-11", FOCO)}
          options={COMERCIAIS_EXEMPLO.map((c) => ({ value: c, label: c }))} onValueChange={(v) => aoMudar("comercial", v)}
        />
      </div>
      <CampoNota id={id} valor={dados.nota} erro={erros.nota} aoMudar={aoMudar} />
      <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">{t(`${L}first`)}</p>
    </div>
  );
}

function Formulario({ aoCriar, primeiroCampo, aoSujar }: { aoCriar: (d: DadosNovaLead) => void; primeiroCampo: Ref<HTMLInputElement>; aoSujar: () => void }) {
  const { t } = useTranslation();
  const id = useId();
  const [dados, setDados] = useState<DadosNovaLead>(DADOS_VAZIOS);
  const [tentou, setTentou] = useState(false);
  const mudar = (campo: keyof DadosNovaLead, valor: string) => { aoSujar(); setDados((d) => ({ ...d, [campo]: valor })); };

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setTentou(true);
    const primeiro = (["nome", "telefone", "email", "nota"] as const).find((c) => validarNovaLead(dados)[c]);
    if (primeiro) document.getElementById(`${id}-${primeiro}`)?.focus();
    else aoCriar(dados);
  };
  return (
    <form onSubmit={enviar} noValidate className="flex min-h-0 flex-1 flex-col">
      <Campos id={id} dados={dados} erros={tentou ? validarNovaLead(dados) : {}} primeiroCampo={primeiroCampo} aoMudar={mudar} />
      <SheetFooter className="shrink-0 gap-2 border-t border-border px-6 py-4 sm:space-x-0">
        <SheetClose asChild>
          <Button type="button" variant="outline" className={cn("min-h-11", FOCO)}>{t(`${L}cancel`)}</Button>
        </SheetClose>
        <Button type="submit" className={cn("min-h-11", FOCO)}>{t(`${L}submit`)}</Button>
      </SheetFooter>
    </form>
  );
}

/**
 * "Nova lead": um painel lateral com o formulário curto (nome, telefone, email, localidade, origem, formulário, comercial e
 * nota), como o de "Novo negócio". Só o nome é obrigatório. Ao confirmar, a página cria a pessoa em memória (etapa "Por
 * contactar") e abre-lhe a ficha. Um clique fora não fecha com alterações por gravar; Esc e Cancelar fecham.
 */
export function NovaLeadPainel({ aberto, aoMudarAberto, aoCriar }: NovaLeadPainelProps) {
  const { t } = useTranslation();
  const primeiroCampo = useRef<HTMLInputElement>(null);
  const sujo = useRef(false);
  const criou = useRef(false);
  return (
    <Sheet open={aberto} onOpenChange={(valor) => { if (valor) sujo.current = false; aoMudarAberto(valor); }}>
      <SheetContent
        onOpenAutoFocus={(e) => { e.preventDefault(); primeiroCampo.current?.focus(); }}
        onInteractOutside={(e) => { if (sujo.current) e.preventDefault(); }}
        onCloseAutoFocus={(e) => { if (criou.current) e.preventDefault(); criou.current = false; }}
        className="flex w-full flex-col gap-0 p-0 sm:w-1/2 sm:min-w-[640px] sm:max-w-none motion-reduce:!animate-none [&>button:last-child]:hidden"
      >
        <SheetHeader className="space-y-2 border-b border-border p-6 text-left">
          <div className="flex items-start justify-between gap-3">
            <nav aria-label={t(`${L}breadcrumb`)}>
              <ol className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <li>{t("pessoasPagina.title")}</li>
                <li aria-hidden="true"><ChevronRight className="h-3.5 w-3.5" /></li>
                <li aria-current="page" className="font-medium text-foreground">{t("pessoasPagina.newLead")}</li>
              </ol>
            </nav>
            <SheetClose asChild>
              <Button type="button" variant="ghost" size="icon" aria-label={t(`${L}close`)} className={cn("-mr-2 -mt-2 h-11 w-11", FOCO)}>
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </SheetClose>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <SheetTitle className="text-lg">{t("pessoasPagina.newLead")}</SheetTitle>
            <span className="inline-flex items-center gap-1 rounded-sm border border-primary px-1.5 py-0.5 text-xs font-semibold text-primary dark:text-violet-300">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              {t(`${L}badge`)}
            </span>
          </div>
          <SheetDescription>{t(`${L}description`)}</SheetDescription>
        </SheetHeader>
        <Formulario
          primeiroCampo={primeiroCampo} aoSujar={() => { sujo.current = true; }}
          aoCriar={(dados) => { criou.current = true; aoMudarAberto(false); aoCriar(dados); }}
        />
      </SheetContent>
    </Sheet>
  );
}
