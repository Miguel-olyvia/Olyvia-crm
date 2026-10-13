import { useId, useRef, useState } from "react";
import { Copy } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FOCO } from "@/components/negocio-metas/estilos";
import { FichaNegocios } from "./FichaNegocios";
import { FichaNotas, FichaSubmissoes } from "./FichaSubmissoesNotas";
import { TAB_PESSOAS } from "./estilosPessoas";
import type { NotaPessoa, ResumoPessoa, Submissao } from "./pessoasTipos";
import { SeloEtapa, SeloPapel, SeloVoltou } from "./SelosPessoa";

type AbaFicha = "negocios" | "submissoes" | "notas";

export interface FichaPessoaProps {
  /** A pessoa aberta; `null` com a ficha fechada. */
  resumo: ResumoPessoa | null;
  hoje: string;
  /** As submissões pendentes desta pessoa, já ordenadas; vazias sem permissão para as ver. */
  submissoes: Submissao[];
  notas: NotaPessoa[];
  podeVerSubmissoes: boolean;
  aoFechar: () => void;
  aoPedir: (submissaoId: string, pessoaId: string) => void;
  aoVerTodasSubmissoes: () => void;
}

/** A linha do contacto: telefone · email, ou "Sem contacto". */
const textoContacto = (r: ResumoPessoa, vazio: string): string =>
  [r.pessoa.contacto.telefone, r.pessoa.contacto.email].filter(Boolean).join(" · ") || vazio;

/** "Copiar contacto" (só um aviso de exemplo) e "Ver submissões (n)". */
function FaixaAcoes({ resumo, pendentes, aoVerSubmissoes }: { resumo: ResumoPessoa; pendentes: number; aoVerSubmissoes: () => void }) {
  const { t } = useTranslation();
  const idMotivo = useId();
  const { nome, contacto } = resumo.pessoa;
  const semContacto = !contacto.telefone && !contacto.email;
  return (
    <div role="group" aria-label={t("pessoasPagina.actions.label")} className="flex flex-wrap gap-2 border-b border-border px-6 py-3">
      <Button
        type="button" variant="outline" aria-disabled={semContacto || undefined} aria-describedby={semContacto ? idMotivo : undefined}
        className={cn("min-h-11 gap-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-50", FOCO)}
        onClick={() => { if (!semContacto) toast.info(t("pessoasPagina.actions.copyToast", { name: nome })); }}
      >
        <Copy className="h-4 w-4" aria-hidden="true" />
        {t("pessoasPagina.actions.copy")}
      </Button>
      {semContacto && <span id={idMotivo} className="self-center text-xs text-muted-foreground">{t("pessoasPagina.actions.noContact")}</span>}
      {pendentes > 0 && (
        <Button type="button" className={cn("min-h-11", FOCO)} onClick={aoVerSubmissoes}>
          {t("pessoasPagina.actions.submissions", { count: pendentes })}
        </Button>
      )}
    </div>
  );
}

/** O cabeçalho fixo: nome, selos de papel e etapa, e o contacto. */
function CabecalhoFicha({ resumo, voltou }: { resumo: ResumoPessoa; voltou: boolean }) {
  const { t } = useTranslation();
  return (
    <SheetHeader className="space-y-2 border-b border-border p-6 pr-12 text-left">
      <SheetTitle className="text-xl">{resumo.pessoa.nome}</SheetTitle>
      <div className="flex flex-wrap gap-1.5">
        <SeloPapel papel={resumo.papel} />
        <SeloEtapa etapa={resumo.pessoa.etapa} />
        {voltou && <SeloVoltou />}
      </div>
      <SheetDescription>{textoContacto(resumo, t("pessoasPagina.noContact"))}</SheetDescription>
    </SheetHeader>
  );
}

function FichaInterior(p: FichaPessoaProps & { resumo: ResumoPessoa }) {
  const { t } = useTranslation();
  const [aba, setAba] = useState<AbaFicha>("negocios");
  const { resumo, submissoes, notas } = p;
  const verSubmissoes = () => setAba("submissoes");
  return (
    <>
      <CabecalhoFicha resumo={resumo} voltou={submissoes.length > 0} />
      <FaixaAcoes resumo={resumo} pendentes={submissoes.length} aoVerSubmissoes={verSubmissoes} />
      <Tabs value={aba} onValueChange={(v) => setAba(v as AbaFicha)} className="flex min-h-0 flex-1 flex-col">
        <TabsList aria-label={t("pessoasPagina.fichaTabs.label")} className="mx-6 mt-3 h-auto self-start">
          <TabsTrigger value="negocios" className={TAB_PESSOAS}>{t("pessoasPagina.fichaTabs.deals", { count: resumo.negocios.length })}</TabsTrigger>
          {p.podeVerSubmissoes && (
            <TabsTrigger value="submissoes" className={TAB_PESSOAS}>{t("pessoasPagina.fichaTabs.subs", { count: submissoes.length })}</TabsTrigger>
          )}
          <TabsTrigger value="notas" className={TAB_PESSOAS}>{t("pessoasPagina.fichaTabs.notes", { count: notas.length })}</TabsTrigger>
        </TabsList>
        <div data-foco-ficha tabIndex={-1} className="flex-1 overflow-y-auto p-6 outline-none">
          <TabsContent value="negocios" className="mt-0"><FichaNegocios negocios={resumo.negocios} hoje={p.hoje} /></TabsContent>
          <TabsContent value="submissoes" className="mt-0">
            <FichaSubmissoes
              submissoes={submissoes} hoje={p.hoje} aoPedir={(id) => p.aoPedir(id, resumo.pessoa.id)} aoVerTodas={p.aoVerTodasSubmissoes}
            />
          </TabsContent>
          <TabsContent value="notas" className="mt-0">
            <FichaNotas notas={notas} hoje={p.hoje} pendentes={submissoes.length} aoVerSubmissoes={verSubmissoes} />
          </TabsContent>
        </div>
      </Tabs>
    </>
  );
}

/** O foco depois de fechar: o elemento que abriu a ficha; se já não existe (abriu por ?open=, ou a ficha fechou-se a si própria), o separador ativo ou o título da página. */
function focoDeRegresso(origem: HTMLElement | null): HTMLElement | null {
  if (origem && origem.isConnected && origem !== document.body) return origem;
  const titulo = document.querySelector<HTMLElement>("h1");
  titulo?.setAttribute("tabindex", "-1");
  return document.querySelector<HTMLElement>('[role="tab"][data-state="active"]') ?? titulo;
}

/** A ficha da pessoa, num painel lateral (Sheet): cabeçalho e ações fixos e três separadores por baixo. */
export function FichaPessoa(p: FichaPessoaProps) {
  const { resumo, aoFechar } = p;
  const origem = useRef<HTMLElement | null>(null);
  return (
    <Sheet open={resumo !== null} onOpenChange={(aberto) => { if (!aberto) aoFechar(); }}>
      <SheetContent
        className="flex w-full flex-col gap-0 p-0 sm:max-w-xl motion-reduce:!animate-none"
        onOpenAutoFocus={() => { origem.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
        onCloseAutoFocus={(e) => {
          const alvo = focoDeRegresso(origem.current);
          if (!alvo) return;
          e.preventDefault();
          alvo.focus();
        }}
      >
        {resumo && <FichaInterior key={resumo.pessoa.id} {...p} resumo={resumo} />}
      </SheetContent>
    </Sheet>
  );
}
