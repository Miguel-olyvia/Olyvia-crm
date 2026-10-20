import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  // Enquanto grava, o diálogo não se fecha (nem por Cancelar, Escape ou clique fora): o resultado chegaria a um diálogo já fechado.
  const aoMudarAberto = (aberto: boolean) => {
    if (!aberto && p.aCriar) return;
    p.aoMudarAberto(aberto);
  };
  const semCampos = p.camposACarregar || p.camposErro;
  const distrito = [p.valores.distrito, p.valores.district].find((v) => typeof v === "string" && v) as string | undefined;
  return (
    <Dialog open={p.aberto} onOpenChange={aoMudarAberto}>
      <DialogContent
        ref={conteudo} hideClose={p.aCriar}
        className="max-h-[85vh] max-w-4xl overflow-y-auto"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          conteudo.current?.querySelector<HTMLElement>("input, select, textarea")?.focus();
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          p.aoFocarOrigem();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t(`${N}title`)}</DialogTitle>
          <DialogDescription>{t(`${N}description`)}</DialogDescription>
        </DialogHeader>
        <PlanLimitWarning organizationId={p.organizationId} limitType="leads" />
        <form noValidate className="space-y-4" onSubmit={(e) => { e.preventDefault(); p.aoCriar(); }}>
          {p.erroApoio && (
            <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm">
              <p>{t(`${N}supportError`)}</p>
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
          <div className="sticky bottom-0 -mx-6 -mb-6 flex flex-col-reverse gap-2 border-t bg-background px-6 py-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" className={`min-h-11 ${FOCO}`} disabled={p.aCriar} onClick={() => p.aoMudarAberto(false)}>{t(`${N}cancel`)}</Button>
            <Button type="submit" className={`min-h-11 ${FOCO}`} disabled={p.aCriar || semCampos} aria-busy={p.aCriar}>
              {p.aCriar ? t(`${N}creating`) : t(`${N}create`)}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
