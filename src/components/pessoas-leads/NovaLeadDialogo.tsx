import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Check, ChevronRight, X } from "lucide-react";
import { PlanLimitWarning } from "@/components/billing/PlanLimitWarning";
import { FOCO } from "@/components/negocio-metas/estilos";
import type { ComercialLido, NoArvoreOrg } from "@/hooks/pessoas/novaLead/comerciaisNovaLead";
import type { DefinicaoCampo } from "@/hooks/pessoas/novaLead/fluxoNovaLead";
import type { FormularioLido, OrigemLida } from "@/hooks/pessoas/novaLead/leituraNovaLead";
import type { ErroDialogo } from "@/hooks/pessoas/novaLead/useNovaLead";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { CampanhaOrigemNovaLead, SEM_ORIGEM } from "./CampanhaOrigemNovaLead";
import { CamposNovaLead } from "./CamposNovaLead";
import { ComercialNovaLead } from "./ComercialNovaLead";
import { errosDoPasso, passoComErro, passosNovaLead, textoDoValor, type IdPasso, type PassoNovaLead } from "./passosNovaLead";

const N = "pessoasPagina.real.newLead.";
const INVALIDO = 'input[aria-invalid="true"], select[aria-invalid="true"], textarea[aria-invalid="true"]';
const CAMPO = "input:not([disabled]), select:not([disabled]), textarea:not([disabled])";
const SEM_ERROS: Record<string, string> = {};

export interface NovaLeadDialogoProps {
  aberto: boolean;
  organizationId: string | null;
  aoMudarAberto: (aberto: boolean) => void;
  camposCampanha: readonly DefinicaoCampo[];
  valores: Readonly<Record<string, unknown>>;
  errosCampo: Readonly<Record<string, string>>;
  aoMudarValor: (chave: string, valor: unknown) => void;
  formularios: readonly FormularioLido[];
  formularioId: string;
  aoMudarFormulario: (id: string) => void;
  /** A campanha ligada ao formulário escolhido (derivada): serve aos distritos e ao nome mostrado; vazia sem campanha. */
  campanhaId: string;
  campanhaNome: string;
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

/**
 * O diálogo «Nova lead». 4/11 (Rúben): guiado, um passo de cada vez — como chegou (formulário e fonte), quem é (dados base), o formulário
 * (os campos dele, se tiver), quem acompanha (comercial) e confirmar (o resumo). Os campos e a gravação são os de sempre. «Continuar» valida
 * o passo com a mesma validação de «Criar lead»; se «Criar lead» encontrar um erro, volta-se ao passo dele. Só dados e callbacks por props.
 */
export function NovaLeadDialogo(p: NovaLeadDialogoProps) {
  const { t } = useTranslation();
  const conteudo = useRef<HTMLDivElement>(null);
  const corpo = useRef<HTMLDivElement>(null);
  const passos = useMemo(() => passosNovaLead(p.baseVisivel, p.camposCampanha), [p.baseVisivel, p.camposCampanha]);
  const [idPasso, setIdPasso] = useState<IdPasso>("origem");
  const [alcancado, setAlcancado] = useState(0);
  const [errosPasso, setErrosPasso] = useState<Record<string, string>>(SEM_ERROS);
  // Cada abertura começa no primeiro passo (o que se escreveu antes fica: é o formulário que o guarda).
  useEffect(() => {
    if (!p.aberto) return;
    setIdPasso("origem"); setAlcancado(0); setErrosPasso(SEM_ERROS);
  }, [p.aberto]);
  // Sem o passo do formulário (escolheu-se «Sem formulário»), quem lá estava passa para o seguinte.
  const i = Math.max(0, passos.findIndex((x) => x.id === idPasso));
  const atual: PassoNovaLead = passos.findIndex((x) => x.id === idPasso) >= 0 ? passos[i] : passos.find((x) => x.id === "comercial")!;
  const ultimo = atual.id === "confirmar";
  // Depois de um «Criar» com campos inválidos, vai-se ao passo do primeiro campo marcado.
  useEffect(() => {
    const alvo = passoComErro(passos, p.errosCampo);
    if (alvo) setIdPasso(alvo);
  }, [p.errosCampo]); // eslint-disable-line react-hooks/exhaustive-deps -- só quando chegam erros novos
  // Ao chegar a um passo (ou com erros), o foco vai para o primeiro campo marcado ou, sem nenhum, para o primeiro campo do passo.
  const primeiraVez = useRef(true);
  useEffect(() => {
    if (primeiraVez.current) { primeiraVez.current = false; return; }
    const marcado = corpo.current?.querySelector<HTMLElement>(INVALIDO);
    (marcado ?? corpo.current?.querySelector<HTMLElement>(CAMPO) ?? corpo.current?.querySelector<HTMLElement>("button:not([disabled])"))?.focus();
  }, [idPasso, p.errosCampo, errosPasso]);
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
    const marcado = conteudo.current?.querySelector<HTMLElement>(INVALIDO);
    (marcado ?? criarRef.current)?.focus();
  }, [p.aCriar, p.aberto]);
  // Enquanto grava, o diálogo não se fecha (nem por Cancelar, Escape ou clique fora): o resultado chegaria a um diálogo já fechado.
  const aoMudarAberto = (aberto: boolean) => {
    if (!aberto && p.aCriar) return;
    p.aoMudarAberto(aberto);
  };
  // Sem campos da campanha, ou sem campanhas, origens ou comerciais, não se cria: a lead sairia sem campanha ou sem comercial sem se querer.
  // Com o que se escreveu por gravar, um clique fora não fecha o painel (Escape e «Fechar» fecham): perder o formulário por um toque ao lado custa caro.
  const sujo = Object.values(p.valores).some((v) => v !== undefined && v !== null && v !== "") || p.formularioId !== "" || p.origemId !== "";
  const semCampos = p.camposACarregar || p.camposErro || p.erroApoio;
  const distrito = [p.valores.distrito, p.valores.district].find((v) => typeof v === "string" && v) as string | undefined;
  // Os erros que se mostram: os do último «Criar lead» e os do «Continuar» deste passo; escrever num campo tira o erro do passo dele.
  const erros = { ...p.errosCampo, ...errosPasso };
  const aoMudarValor = (chave: string, valor: unknown) => {
    if (errosPasso[chave]) setErrosPasso(({ [chave]: _x, ...resto }) => resto);
    p.aoMudarValor(chave, valor);
  };
  const irPara = (k: number) => {
    const destino = passos[Math.max(0, Math.min(k, passos.length - 1))];
    setErrosPasso(SEM_ERROS);
    setIdPasso(destino.id);
  };
  const avancar = () => {
    // Os campos do formulário ainda não chegaram (ou falharam): não se avança para um passo que os perderia.
    if (atual.id === "origem" && (p.camposACarregar || p.camposErro)) return;
    const e = errosDoPasso(atual, p.valores);
    if (Object.keys(e).length > 0) { setErrosPasso(e); return; }
    setAlcancado((a) => Math.max(a, i + 1));
    irPara(i + 1);
  };
  const podeAvancar = !(atual.id === "origem" && (p.camposACarregar || p.camposErro));
  const titulo = (x: PassoNovaLead) => t(`${N}step.${x.id}`);
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
          {/* Os passos: os já feitos voltam-se a abrir com um clique; os da frente só depois de «Continuar». */}
          <nav aria-label={t(`${N}step.nav`)} className="pt-2">
            <ol className="flex gap-1.5">
              {passos.map((x, k) => {
                // feito: já se passou por ele com «Continuar» (os da frente de onde se voltou também contam)
                const feito = k !== i && (k < i || k < alcancado);
                return (
                  <li key={x.id} className="min-w-0 flex-1">
                    <button
                      type="button" disabled={k > alcancado || p.aCriar} aria-current={k === i ? "step" : undefined} onClick={() => irPara(k)}
                      className={cn("group w-full rounded-md pb-1 text-left disabled:cursor-default", FOCO)}
                    >
                      <span className={cn("block h-1.5 rounded-full transition-colors", k === i ? "bg-primary" : feito ? "bg-primary/45" : "bg-muted")} aria-hidden="true" />
                      <span className={cn("mt-1.5 flex items-center gap-1 truncate text-xs", k === i ? "font-semibold text-foreground" : "text-muted-foreground", k <= alcancado && k !== i && "group-hover:text-foreground")}>
                        {feito && <Check className="h-3 w-3 shrink-0" aria-hidden="true" />}
                        <span className="truncate">{titulo(x)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>
        </SheetHeader>
        <form noValidate className="flex min-h-0 flex-1 flex-col" onSubmit={(e) => { e.preventDefault(); if (ultimo) p.aoCriar(); else avancar(); }}>
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
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{t(`${N}step.of`, { n: i + 1, total: passos.length })}</p>
            <h3 className="text-base font-semibold text-foreground">{titulo(atual)}</h3>
            <p className="text-sm text-muted-foreground">{t(`${N}step.${atual.id}Desc`)}</p>
          </div>
          {/* Enquanto grava, os campos ficam bloqueados: o pedido em curso leva o que estava escrito ao clicar, e o ecrã não pode mostrar outra coisa. */}
          <fieldset disabled={p.aCriar} aria-busy={p.aCriar || undefined} className="m-0 min-w-0 space-y-4 border-0 p-0">
            <div ref={corpo} className="space-y-4">
              {atual.id === "origem" && (
                <CampanhaOrigemNovaLead
                  formularios={p.formularios} formularioId={p.formularioId} aoMudarFormulario={p.aoMudarFormulario} campanhaNome={p.campanhaNome}
                  nCamposExtra={p.camposCampanha.length} origens={p.origens} origemId={p.origemId}
                  aoMudarOrigem={p.aoMudarOrigem} aoCriarFormulario={p.aoCriarFormulario}
                />
              )}
              {atual.id === "contacto" && (
                <CamposNovaLead
                  titulo={t(`${N}baseForm`)} idSecao="nl-base-titulo" campos={p.baseVisivel} valores={p.valores} tituloEscondido
                  erros={erros} campanhaId={p.campanhaId || null} aoMudar={aoMudarValor}
                />
              )}
              {atual.id === "pedido" && (
                <CamposNovaLead
                  titulo={t(`${N}extraFields`)} idSecao="nl-extra-titulo" campos={p.camposCampanha} valores={p.valores} erros={erros} tituloEscondido
                  campanhaId={p.campanhaId || null} aoMudar={aoMudarValor}
                />
              )}
              {atual.id === "comercial" && (
                <ComercialNovaLead
                  comerciais={p.comerciais} arvore={p.arvore} atribuidoId={typeof p.valores._assigned_to === "string" ? p.valores._assigned_to : ""}
                  aoMudarAtribuido={(id) => p.aoMudarValor("_assigned_to", id)} orgFiltro={p.orgFiltro} aoMudarOrgFiltro={p.aoMudarOrgFiltro}
                  distritoDaLead={distrito ?? ""}
                />
              )}
              {atual.id === "confirmar" && <Resumo p={p} passos={passos} irPara={irPara} />}
            </div>
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
          <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-background px-6 py-4 sm:flex-row sm:items-center">
            <Button type="button" variant="ghost" className={`min-h-11 ${FOCO}`} disabled={p.aCriar} onClick={() => p.aoMudarAberto(false)}>{t(`${N}cancel`)}</Button>
            <div className="flex flex-col-reverse gap-2 sm:ml-auto sm:flex-row">
              {i > 0 && (
                <Button type="button" variant="outline" className={`min-h-11 ${FOCO}`} disabled={p.aCriar} onClick={() => irPara(i - 1)}>{t(`${N}previous`)}</Button>
              )}
              {ultimo ? (
                <Button ref={criarRef} type="submit" className={`min-h-11 ${FOCO}`} disabled={p.aCriar || semCampos} aria-busy={p.aCriar}>
                  {p.aCriar ? t(`${N}creating`) : t(`${N}create`)}
                </Button>
              ) : (
                <Button type="submit" className={`min-h-11 ${FOCO}`} disabled={!podeAvancar}>{t(`${N}next`)}</Button>
              )}
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/** O último passo: o que se vai criar, por passo, com «Alterar» para voltar a cada um. */
function Resumo({ p, passos, irPara }: { p: NovaLeadDialogoProps; passos: readonly PassoNovaLead[]; irPara: (k: number) => void }) {
  const { t } = useTranslation();
  const sim = t(`${N}summary.yes`), nao = t(`${N}summary.no`), vazio = t(`${N}summary.empty`);
  const formulario = p.formularios.find((f) => f.id === p.formularioId)?.name ?? t(`${N}summary.noForm`);
  const origem = p.origemId && p.origemId !== SEM_ORIGEM ? p.origens.find((o) => o.id === p.origemId)?.name ?? "" : t(`${N}source.none`);
  const atribuido = typeof p.valores._assigned_to === "string" ? p.comerciais.find((c) => c.id === p.valores._assigned_to)?.name ?? "" : "";
  const linhasDosCampos = (campos: readonly DefinicaoCampo[]): [string, string][] => campos.map((c) => [c.field_label, textoDoValor(p.valores[c.field_key], sim, nao)]);
  const grupos: { id: IdPasso; linhas: [string, string][] }[] = [
    { id: "origem", linhas: [[t(`${N}summary.form`), formulario], ...(p.campanhaNome ? [[t(`${N}summary.campaign`), p.campanhaNome] as [string, string]] : []), [t(`${N}summary.source`), origem]] },
    { id: "contacto", linhas: linhasDosCampos(p.baseVisivel) },
    ...(p.camposCampanha.length > 0 ? [{ id: "pedido" as const, linhas: linhasDosCampos(p.camposCampanha) }] : []),
    { id: "comercial", linhas: [[t(`${N}summary.commercial`), atribuido]] },
  ];
  return (
    <div className="space-y-4">
      {grupos.map((g) => {
        const k = passos.findIndex((x) => x.id === g.id);
        const nome = t(`${N}step.${g.id}`);
        return (
          <section key={g.id} aria-labelledby={`nl-resumo-${g.id}`} className="rounded-xl border border-border">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
              <h4 id={`nl-resumo-${g.id}`} className="text-sm font-semibold">{nome}</h4>
              <Button type="button" variant="ghost" size="sm" className={`min-h-11 ${FOCO}`} onClick={() => irPara(k)} aria-label={t(`${N}summary.editAria`, { passo: nome })}>
                {t(`${N}summary.edit`)}
              </Button>
            </div>
            <dl className="divide-y divide-border px-4">
              {g.linhas.map(([rotulo, valor]) => (
                <div key={rotulo} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2 text-sm">
                  <dt className="text-muted-foreground">{rotulo}</dt>
                  <dd className={cn("min-w-0 break-words text-right", valor ? "font-medium" : "text-muted-foreground")}>{valor || vazio}</dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
    </div>
  );
}
