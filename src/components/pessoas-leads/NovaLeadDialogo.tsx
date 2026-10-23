import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ChevronRight, X } from "lucide-react";
import { PlanLimitWarning } from "@/components/billing/PlanLimitWarning";
import { FOCO } from "@/components/negocio-metas/estilos";
import type { ComercialLido, NoArvoreOrg } from "@/hooks/pessoas/novaLead/comerciaisNovaLead";
import type { DefinicaoCampo } from "@/hooks/pessoas/novaLead/fluxoNovaLead";
import type { CampanhaLida, OrigemLida } from "@/hooks/pessoas/novaLead/leituraNovaLead";
import type { ErroDialogo } from "@/hooks/pessoas/novaLead/useNovaLead";
import { useTranslation } from "@/hooks/useTranslation";
import { CampanhaOrigemNovaLead } from "./CampanhaOrigemNovaLead";
import { CamposNovaLead } from "./CamposNovaLead";
import { ComercialNovaLead } from "./ComercialNovaLead";

const N = "pessoasPagina.real.newLead.";

export interface NovaLeadDialogoProps {
  aberto: boolean;
  organizationId: string | null;
  aoMudarAberto: (aberto: boolean) => void;
  camposCampanha: readonly DefinicaoCampo[];
  valores: Readonly<Record<string, unknown>>;
  errosCampo: Readonly<Record<string, string>>;
  aoMudarValor: (chave: string, valor: unknown) => void;
  campanhas: readonly CampanhaLida[];
  campanhaId: string;
  aoMudarCampanha: (id: string) => void;
  formularioNome: string;
  temFormulario: boolean;
  origens: readonly OrigemLida[];
  origemId: string;
  aoMudarOrigem: (id: string) => void;
  comerciais: readonly ComercialLido[];
  arvore: readonly NoArvoreOrg[];
  orgFiltro: string;
  aoMudarOrgFiltro: (id: string) => void;
  aCriar: boolean;
  erro: ErroDialogo | null;
  aoCriar: () => void;
  aoCriarFormulario: () => void;
  aoTentarDeNovo: () => void;
  /** Ao fechar sem criar, o foco volta ao botão «Nova lead». */
  aoFocarOrigem: () => void;
  /** Os campos base que a campanha escolhida já cobre não se desenham (nem se gravam). */
  baseVisivel: readonly DefinicaoCampo[];
  /** Há campanha escolhida e os campos dela estão a chegar: criar fica desativado. */
  camposACarregar: boolean;
  /** Há campanha escolhida e os campos dela não se leram: criar fica desativado até se repetir com êxito. */
  camposErro: boolean;
  /** Falhou a leitura das campanhas, das origens ou dos comerciais. */
  erroApoio: boolean;
  aoRepetirDados: () => void;
}

/** O diálogo «Nova lead»: campanha e fonte, dados base, campos da campanha e comercial. Só dados e callbacks por props. */
export function NovaLeadDialogo(p: NovaLeadDialogoProps) {
  const { t } = useTranslation();
  const conteudo = useRef<HTMLDivElement>(null);
  // Depois de um «Criar» com campos inválidos, o foco vai para o primeiro campo marcado.
  useEffect(() => {
    if (Object.keys(p.errosCampo).length === 0) return;
    conteudo.current?.querySelector<HTMLElement>('input[aria-invalid="true"], select[aria-invalid="true"], textarea[aria-invalid="true"]')?.focus();
  }, [p.errosCampo]);
  // O fieldset desativado tira o foco ao botão «Criar lead» (o corpo da página passa a ser o elemento ativo). Quando a gravação acaba e o
  // diálogo continua aberto (um erro), o foco volta ao primeiro campo marcado ou, sem campos marcados, ao botão. Se o foco já está noutro
  // sítio (o diálogo de duplicados, por exemplo), não se mexe.
  const criarRef = useRef<HTMLButtonElement>(null);
  const eraACriar = useRef(false);
  useEffect(() => {
    const acabou = eraACriar.current && !p.aCriar;
    eraACriar.current = p.aCriar;
    if (!acabou || !p.aberto) return;
    const ativo = document.activeElement;
    // Perdido = o corpo da página ou o próprio contentor do diálogo (é para onde a armadilha de foco o manda quando o botão se desativa).
    if (ativo && ativo !== document.body && ativo !== conteudo.current) return;
    const marcado = conteudo.current?.querySelector<HTMLElement>('input[aria-invalid="true"], select[aria-invalid="true"], textarea[aria-invalid="true"]');
    (marcado ?? criarRef.current)?.focus();
  }, [p.aCriar, p.aberto]);
  // Enquanto grava, o diálogo não se fecha (nem por Cancelar, Escape ou clique fora): o resultado chegaria a um diálogo já fechado.
  const aoMudarAberto = (aberto: boolean) => {
    if (!aberto && p.aCriar) return;
    p.aoMudarAberto(aberto);
  };
  // Sem campos da campanha, ou sem campanhas, origens ou comerciais, não se cria: a lead sairia sem campanha ou sem comercial sem se querer.
  // Com o que se escreveu por gravar, um clique fora não fecha o painel (Escape e «Fechar» fecham): perder o formulário por um toque ao lado custa caro.
  const sujo = Object.values(p.valores).some((v) => v !== undefined && v !== null && v !== "") || p.campanhaId !== "" || p.origemId !== "";
  const semCampos = p.camposACarregar || p.camposErro || p.erroApoio;
  const distrito = [p.valores.distrito, p.valores.district].find((v) => typeof v === "string" && v) as string | undefined;
  return (
    <Sheet open={p.aberto} onOpenChange={aoMudarAberto}>
      <SheetContent
        ref={conteudo} hideClose
        className="flex w-full flex-col gap-0 p-0 sm:w-1/2 sm:min-w-[640px] sm:max-w-none motion-reduce:!animate-none"
        onInteractOutside={(e) => { if (sujo || p.aCriar) e.preventDefault(); }}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          conteudo.current?.querySelector<HTMLElement>("input, select, textarea")?.focus();
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          p.aoFocarOrigem();
        }}
      >
        <SheetHeader className="space-y-2 border-b border-border p-6 text-left">
          <div className="flex items-start justify-between gap-3">
            <nav aria-label={t(`${N}breadcrumb`)}>
              <ol className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <li>{t("pessoasPagina.title")}</li>
                <li aria-hidden="true"><ChevronRight className="h-3.5 w-3.5" /></li>
                <li aria-current="page" className="font-medium text-foreground">{t("pessoasPagina.newLead")}</li>
              </ol>
            </nav>
            <SheetClose asChild>
              <Button type="button" variant="ghost" size="icon" disabled={p.aCriar} aria-label={t(`${N}close`)} className={`-mr-2 -mt-2 h-11 w-11 ${FOCO}`}>
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </SheetClose>
          </div>
          <SheetTitle className="text-lg">{t(`${N}title`)}</SheetTitle>
          <SheetDescription>{t(`${N}description`)}</SheetDescription>
        </SheetHeader>
        <form noValidate className="flex min-h-0 flex-1 flex-col" onSubmit={(e) => { e.preventDefault(); p.aoCriar(); }}>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
          <PlanLimitWarning organizationId={p.organizationId} limitType="leads" />
          {p.erroApoio && (
            <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm">
              <div className="space-y-1">
                <p>{t(`${N}supportError`)}</p>
                <p>{t(`${N}supportBlocked`)}</p>
              </div>
              <Button type="button" variant="outline" className={`min-h-11 ${FOCO}`} onClick={p.aoRepetirDados}>{t(`${N}error.retry`)}</Button>
            </div>
          )}
          {/* Enquanto grava, os campos ficam bloqueados: o pedido em curso leva o que estava escrito ao clicar, e o ecrã não pode mostrar outra coisa. */}
          <fieldset disabled={p.aCriar} aria-busy={p.aCriar || undefined} className="m-0 min-w-0 space-y-4 border-0 p-0">
          <CampanhaOrigemNovaLead
            campanhas={p.campanhas} campanhaId={p.campanhaId} aoMudarCampanha={p.aoMudarCampanha} formularioNome={p.formularioNome}
            temFormulario={p.temFormulario} nCamposExtra={p.camposCampanha.length} origens={p.origens} origemId={p.origemId}
            aoMudarOrigem={p.aoMudarOrigem} aoCriarFormulario={p.aoCriarFormulario}
          />
          <CamposNovaLead
            titulo={t(`${N}baseForm`)} descricao={t(`${N}baseFormDesc`)} idSecao="nl-base-titulo" campos={p.baseVisivel} valores={p.valores}
            erros={p.errosCampo} campanhaId={p.campanhaId || null} aoMudar={p.aoMudarValor}
          />
          <CamposNovaLead
            titulo={t(`${N}extraFields`)} idSecao="nl-extra-titulo" campos={p.camposCampanha} valores={p.valores} erros={p.errosCampo}
            campanhaId={p.campanhaId || null} aoMudar={p.aoMudarValor}
          />
          <ComercialNovaLead
            comerciais={p.comerciais} arvore={p.arvore} atribuidoId={typeof p.valores._assigned_to === "string" ? p.valores._assigned_to : ""}
            aoMudarAtribuido={(id) => p.aoMudarValor("_assigned_to", id)} orgFiltro={p.orgFiltro} aoMudarOrgFiltro={p.aoMudarOrgFiltro}
            distritoDaLead={distrito ?? ""}
          />
          </fieldset>
          {p.camposACarregar && <p role="status" className="text-sm text-muted-foreground">{t(`${N}fieldsLoading`)}</p>}
          {p.camposErro && (
            <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm">
              <p>{t(`${N}fieldsError`)}</p>
              <Button type="button" variant="outline" className={`min-h-11 ${FOCO}`} onClick={p.aoRepetirDados}>{t(`${N}error.retry`)}</Button>
            </div>
          )}
          {p.erro && (
            <div role="alert" className="space-y-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm">
              <p className="font-medium">{t(`${N}error.title`)}</p>
              <p>{t(p.erro.chave)}</p>
              <Button type="button" variant="outline" className={`min-h-11 ${FOCO}`} onClick={p.aoTentarDeNovo}>{t(`${N}error.retry`)}</Button>
            </div>
          )}
          <p role="status" aria-live="polite" className="min-h-5 text-xs text-muted-foreground">{p.aCriar ? t(`${N}checking`) : ""}</p>
          </div>
          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-background px-6 py-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" className={`min-h-11 ${FOCO}`} disabled={p.aCriar} onClick={() => p.aoMudarAberto(false)}>{t(`${N}cancel`)}</Button>
            <Button ref={criarRef} type="submit" className={`min-h-11 ${FOCO}`} disabled={p.aCriar || semCampos} aria-busy={p.aCriar}>
              {p.aCriar ? t(`${N}creating`) : t(`${N}create`)}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
