/**
 * «Ativos» (/ativos, fase 1: só o registo): o que a empresa comprou, em três grupos (Serviço, Estrutura, Pessoas). No topo, o VALOR ATUAL
 * do separador aberto em grande, com a barra «Amortizado / Valor atual» e quatro indicadores; depois os separadores (ícone, contagem e
 * descrição curta), a barra de ferramentas (pesquisa com o atalho «/», filtro de estado e contagem, sempre à vista) e a lista: nome, o
 * que o liga, a vida, o valor e o estado. O resto da informação e as ações abrem no DETALHE de cada ativo. O valor atual calcula-se aqui
 * (depreciação linear, `valorAtivo.ts`). Ver pede `ativos.view`; registar, editar, desativar e reativar pedem `ativos.edit`. Cada ativo
 * é comprado ou alugado: os totais (compra, amortizado, valor atual) são só dos comprados e os alugados vão nas rendas; a ficha diz quem
 * paga cada mês. O equipamento atribuído no RH passa a ser um ativo sozinho, por isso Ligar e Desligar saíram. Os custos por pessoa
 * continuam no RH e nada daqui entra em preços ou orçamentos. Cliente tolerante: sem o registo na base (migration por aplicar) ou sem
 * acesso, o ecrã diz-o. O quarto separador, «Saídas» (quem sai e o que tem por devolver), e a faixa de aviso por baixo do título são de
 * `SaidasPorDevolver` e `FaixaPorDevolver`; não são um grupo de ativos, por isso o seu estado fica à parte do grupo.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CircleCheck, Plus, Search, TriangleAlert, X } from "lucide-react";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { AtivoDetalhe } from "@/components/ativos/AtivoDetalhe";
import { AtivoSheet, type AvisoGuardado } from "@/components/ativos/AtivoSheet";
import { AvisoAtivo } from "@/components/ativos/AvisoAtivo";
import { DesativarAtivoDialog } from "@/components/ativos/DesativarAtivoDialog";
import { FaixaPorDevolver } from "@/components/ativos/FaixaPorDevolver";
import { GrupoPessoas } from "@/components/ativos/GrupoPessoas";
import { ListaAtivos } from "@/components/ativos/ListaAtivos";
import { ReativarAtivoDialog } from "@/components/ativos/ReativarAtivoDialog";
import { SaidasPorDevolver } from "@/components/ativos/SaidasPorDevolver";
import { SeparadorSaidas, VALOR_SEPARADOR_SAIDAS } from "@/components/ativos/SeparadorSaidas";
import { TotaisGrupo } from "@/components/ativos/TotaisGrupo";
import { custoParadoDosAtivos } from "@/components/ativos/lib/amortizacaoAtivo";
import { ICONE_GRUPO, TOM_GRUPO } from "@/components/ativos/lib/ativosUi";
import { doEstado, filtrarAtivos, FILTROS_ESTADO, type FiltroEstado } from "@/components/ativos/lib/filtrarAtivos";
import { estadoDoAtivo, totaisAtivos } from "@/components/ativos/lib/resumoAtivo";
import { GRUPOS_ATIVO, type Ativo, type AtivosLidos, type GrupoAtivo } from "@/components/ativos/lib/tipos";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { toneBadge } from "@/components/inventory/ui/tones";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCompany } from "@/contexts/CompanyContext";
import { useAtivos } from "@/hooks/ativos/useAtivos";
import { usePermissions } from "@/hooks/usePermissions";
import { useTranslation } from "@/hooks/useTranslation";
import { hojeLocal } from "@/lib/hr/custoBase";
import { cn } from "@/lib/utils";

export const PERMISSAO_VER_ATIVOS = "ativos.view";
export const PERMISSAO_EDITAR_ATIVOS = "ativos.edit";
// O valor em produtos de um armazém ligado: a base exige as duas (inventory.view e products.view_cost).
const PERMISSAO_VER_STOCK = "inventory.view";
const PERMISSAO_VER_CUSTO_STOCK = "products.view_cost";
// A viatura por devolver só leva à Frota a quem a pode ver.
const PERMISSAO_VER_FROTA = "fleet.view";

const ID_PROCURAR = "ativos-procurar";
const CARTAO = "rounded-2xl border bg-card shadow-sm";
const BOTAO_PRINCIPAL = cn("min-h-11 gap-2 rounded-xl px-5 font-semibold shadow-md shadow-primary/20", FOCO);

interface PainelSheet {
  grupo: GrupoAtivo;
  ativo: Ativo | null;
}

const procurarEm = (dados: AtivosLidos, id: string): Ativo | null =>
  [...dados.servico, ...dados.estrutura, ...dados.pessoa].find((a) => a.id === id) ?? null;

/** O atalho «/» leva à pesquisa, desde que não se esteja a escrever noutro campo nem haja uma folha ou um diálogo aberto. */
function useAtalhoPesquisa() {
  useEffect(() => {
    const aoTeclar = (ev: KeyboardEvent) => {
      if (ev.key !== "/" || ev.defaultPrevented || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const alvo = ev.target as HTMLElement | null;
      if (alvo && (alvo.isContentEditable || /^(input|textarea|select)$/i.test(alvo.tagName))) return;
      if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) return;
      const campo = document.getElementById(ID_PROCURAR);
      if (!campo) return;
      ev.preventDefault();
      campo.focus();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, []);
}

/** O esqueleto enquanto a lista carrega (decorativo: quem anuncia é o indicador com `role="status"`). */
function Esqueleto() {
  const bloco = "rounded-2xl bg-muted motion-safe:animate-pulse";
  return (
    <div aria-hidden="true" className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <div className={cn(bloco, "h-56")} />
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className={cn(bloco, "h-24")} />)}
        </div>
      </div>
      <div className={cn(bloco, "h-[4.5rem]")} />
      <div className={cn(CARTAO, "space-y-3 p-4 sm:p-5")}>
        <div className="h-11 w-full rounded-xl bg-muted motion-safe:animate-pulse" />
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-16 w-full rounded-xl bg-muted/70 motion-safe:animate-pulse" />)}
      </div>
    </div>
  );
}

export default function Ativos() {
  const { t } = useTranslation();
  const { activeCompany, isLoading } = useCompany();
  const { hasPermission, loading: permissoesACarregar } = usePermissions();
  const podeVer = hasPermission(PERMISSAO_VER_ATIVOS);
  const podeEditar = hasPermission(PERMISSAO_EDITAR_ATIVOS);
  const podeVerValorStock = hasPermission(PERMISSAO_VER_STOCK) && hasPermission(PERMISSAO_VER_CUSTO_STOCK);

  const [grupo, setGrupo] = useState<GrupoAtivo>("servico");
  // «Saídas» não é um grupo de ativos: abre-se à parte (também por `?aba=saidas`, a ligação que vem do RH).
  const [params] = useSearchParams();
  const [emSaidas, setEmSaidas] = useState(() => params.get("aba") === VALOR_SEPARADOR_SAIDAS);
  const [texto, setTexto] = useState("");
  const [estado, setEstado] = useState<FiltroEstado>("ativos");
  const [aviso, setAviso] = useState<string | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [painel, setPainel] = useState<PainelSheet | null>(null);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [aDesativar, setADesativar] = useState<Ativo | null>(null);
  const [aReativar, setAReativar] = useState<Ativo | null>(null);
  // Quem abriu a folha ou o diálogo (o ativo da lista, ou o botão «Registar ativo»): ao fechar, o foco volta lá.
  const origem = useRef<HTMLElement | null>(null);
  useAtalhoPesquisa();

  // «Todos» e «Desativados» pedem também os desativados à base; «Desativados» filtra-se depois no ecrã.
  const leitura = useAtivos({ incluirDesativados: estado !== "ativos", enabled: podeVer && !permissoesACarregar });
  const dados = leitura.dados;
  const hoje = hojeLocal();
  const mes = hoje.slice(0, 7);
  const rhOculto = dados?.rhOculto ?? true;

  const contagens = useMemo(
    () => Object.fromEntries(GRUPOS_ATIVO.map((g) => [g, dados ? doEstado(dados[g], estado).length : 0])) as Record<GrupoAtivo, number>,
    [dados, estado],
  );

  if (isLoading || permissoesACarregar) return <OlyviaLoader />;
  if (!activeCompany) return <NoOrganizationState />;

  const naoPodeVer = !podeVer || leitura.estado === "recusado";
  const detalhe = detalheId && dados ? procurarEm(dados, detalheId) : null;
  const mudarGrupo = (g: string) => {
    setEmSaidas(g === VALOR_SEPARADOR_SAIDAS);
    if (g !== VALOR_SEPARADOR_SAIDAS) setGrupo(g as GrupoAtivo);
    setAviso(null);
    setErroAcao(null);
  };
  const registar = (mensagem: string) => { setAviso(mensagem); setErroAcao(null); };

  const aoGuardar = ({ nome, edicao }: AvisoGuardado) => registar(t(edicao ? "ativos.aviso.guardado" : "ativos.aviso.criado", { nome }));
  // A origem só se guarda ao abrir a partir da lista ou dos botões «Registar»; ao passar do detalhe para um painel ou diálogo mantém-se.
  const lembrar = (el: HTMLElement) => { origem.current = el; };
  const registarAtivo = (g: GrupoAtivo, el: HTMLElement) => { lembrar(el); setPainel({ grupo: g, ativo: null }); };
  // Só devolve o foco quando já não há outra folha ou diálogo aberto (senão roubava o foco ao que acabou de abrir).
  const devolverFoco = (ev: Event) => {
    if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) return;
    const alvo = origem.current;
    if (alvo?.isConnected) {
      ev.preventDefault();
      alvo.focus();
    }
  };
  const editar = (a: Ativo) => { setDetalheId(null); setPainel({ grupo: a.grupo, ativo: a }); };
  const desativar = (a: Ativo) => { setDetalheId(null); setADesativar(a); };
  // Reativar apaga a data de desativação e muda o passado: pede confirmação, com o aviso, antes de chamar a base.
  const reativar = (a: Ativo) => { setDetalheId(null); setAReativar(a); };

  const estadoVazio = (g: GrupoAtivo): JSX.Element => {
    const Icone = ICONE_GRUPO[g];
    return estado === "desativados" ? (
      <p data-testid="estado-vazio" className="m-4 rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground sm:m-5">{t("ativos.vazio.desativados")}</p>
    ) : (
      <div data-testid="estado-vazio" className="flex flex-col items-center gap-4 px-5 py-12 text-center">
        <span aria-hidden="true" className={cn("grid h-14 w-14 place-items-center rounded-2xl", TOM_GRUPO[g])}>
          <Icone className="h-7 w-7" />
        </span>
        <div className="max-w-md space-y-1">
          <p className="text-base font-semibold">{t(`ativos.vazio.titulo.${g}`)}</p>
          <p className="text-sm text-muted-foreground">{t(`ativos.vazio.corpo.${g}`)}</p>
        </div>
        {podeEditar
          ? (
            <Button type="button" onClick={(e) => registarAtivo(g, e.currentTarget)} className={BOTAO_PRINCIPAL}>
              <Plus className="h-4 w-4" aria-hidden="true" />{t("ativos.novo")}
            </Button>
          )
          : <p className="text-sm text-muted-foreground">{t("ativos.vazio.ajudaSoVer")}</p>}
      </div>
    );
  };

  const lista = (g: GrupoAtivo, dadosDoGrupo: readonly Ativo[]): JSX.Element => {
    if (doEstado(dadosDoGrupo, estado).length === 0) return estadoVazio(g);
    const filtrado = filtrarAtivos(dadosDoGrupo, estado, texto, rhOculto);
    return filtrado.length === 0
      ? (
        <div className="flex flex-col items-center gap-2 px-5 py-12 text-center">
          <Search aria-hidden="true" className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("ativos.vazio.pesquisa")}</p>
        </div>
      )
      : <ListaAtivos grupo={g} ativos={filtrado} mes={mes} rhOculto={rhOculto} aoAbrir={(a, el) => { lembrar(el); setDetalheId(a.id); }} />;
  };

  const resumo = (dadosDoGrupo: readonly Ativo[]): string =>
    t("ativos.resumo", { n: filtrarAtivos(dadosDoGrupo, estado, texto, rhOculto).length, total: doEstado(dadosDoGrupo, estado).length });
  const pesquisaAtiva = texto.trim() !== "";

  const painelDoGrupo = (g: GrupoAtivo, d: AtivosLidos): JSX.Element => (
    <div className={cn(CARTAO, "overflow-hidden")}>
      <div className="flex flex-wrap items-center gap-3 border-b p-4 sm:px-5">
        <div className="relative min-w-0 flex-[1_1_16rem]">
          <Label htmlFor={ID_PROCURAR} className="sr-only">{t("ativos.filtro.procurar")}</Label>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={ID_PROCURAR} type="search" value={texto} placeholder={t("ativos.filtro.procurarMarca")} autoComplete="off"
            onChange={(e) => { setTexto(e.target.value); setAviso(null); }}
            className={cn("h-11 rounded-xl pl-10 pr-12 [&::-webkit-search-cancel-button]:hidden", FOCO)}
          />
          {pesquisaAtiva ? (
            <button
              type="button" onClick={() => setTexto("")} aria-label={t("ativos.filtro.limpar")}
              className={cn("absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground", FOCO)}
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          ) : (
            <kbd aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border bg-muted/50 px-1.5 py-0.5 font-sans text-[11px] font-semibold text-muted-foreground sm:block">/</kbd>
          )}
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Label htmlFor="ativos-estado" className="shrink-0 text-sm font-normal text-muted-foreground">{t("ativos.filtro.estado")}</Label>
          <div className="min-w-0 flex-1 sm:w-44 sm:flex-none">
            <NativeSelect
              id="ativos-estado" className={cn("h-11 rounded-xl", FOCO)} value={estado} onValueChange={(v) => { setEstado(v as FiltroEstado); setAviso(null); }}
              options={FILTROS_ESTADO.map((f) => ({ value: f, label: t(`ativos.filtro.estado.${f}`) }))}
            />
          </div>
        </div>
        <p
          role="status" aria-live="polite" data-testid="ativos-resumo"
          className={cn(
            "min-h-5 text-sm tabular-nums text-muted-foreground sm:ml-auto",
            aviso && cn("flex w-full items-start gap-2 rounded-xl px-3 py-2 font-medium sm:w-auto", toneBadge.ok),
          )}
        >
          {aviso && <CircleCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />}
          {aviso ?? resumo(d[g])}
        </p>
      </div>
      {(erroAcao || d.truncado) && (
        <div className="space-y-2 border-b p-4 sm:px-5">
          {erroAcao && <AvisoAtivo tom="erro" role="alert">{erroAcao}</AvisoAtivo>}
          {/* A base devolve no máximo 2000 ativos no total (por ordem de nome): não se sabe de que grupo ficaram de fora, por isso o aviso vale para todos. */}
          {d.truncado && <AvisoAtivo tom="aviso" data-testid="aviso-truncado">{t("ativos.truncado")}</AvisoAtivo>}
        </div>
      )}
      {g === "pessoa"
        ? <GrupoPessoas rhOculto={rhOculto}>{lista(g, d[g])}</GrupoPessoas>
        : lista(g, d[g])}
    </div>
  );

  const livres = dados ? dados.pessoa.filter((a) => a.estado === "ativo" && estadoDoAtivo(a).chave === "semPessoa").length : 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 pb-16 sm:p-6 sm:pb-20">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("ativos.titulo")}</h1>
          <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">{t("ativos.sub")}</p>
        </div>
        {podeEditar && leitura.estado === "ok" && (
          <Button type="button" onClick={(e) => registarAtivo(grupo, e.currentTarget)} className={cn(BOTAO_PRINCIPAL, "w-full sm:w-auto")}>
            <Plus className="h-4 w-4" aria-hidden="true" />{t("ativos.novo")}
          </Button>
        )}
      </div>

      <FaixaPorDevolver organizationId={activeCompany.id} aoVer={() => mudarGrupo(VALOR_SEPARADOR_SAIDAS)} enabled={podeVer && !permissoesACarregar} />

      {leitura.estado === "a_carregar" && !naoPodeVer && (
        <div className="space-y-5">
          <OlyviaLoader size={16} text={t("ativos.aCarregar")} className="flex-row justify-start" />
          <Esqueleto />
        </div>
      )}
      {leitura.estado === "indisponivel" && (
        <div role="status" className={cn(CARTAO, "space-y-1 border-dashed p-6 shadow-none")}>
          <p className="font-semibold">{t("ativos.indisponivel")}</p>
          <p className="text-sm text-muted-foreground">{t("ativos.indisponivelAjuda")}</p>
        </div>
      )}
      {naoPodeVer && (
        <div role="status" className={cn(CARTAO, "space-y-1 border-dashed p-6 shadow-none")}>
          <p className="font-semibold">{t("ativos.semAcesso")}</p>
          <p className="text-sm text-muted-foreground">{t("ativos.semAcessoAjuda")}</p>
        </div>
      )}
      {leitura.estado === "erro" && !naoPodeVer && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm font-medium text-red-700 dark:text-red-400">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{leitura.mensagem ?? t("ativos.erroLer")}</span>
          <Button type="button" variant="outline" onClick={leitura.refazer} className={cn("min-h-11 rounded-xl", FOCO)}>{t("ativos.tentarDeNovo")}</Button>
        </div>
      )}

      {/* Uma releitura que falha com dados na mão não tira o ecrã: a lista fica e este aviso diz que falhou. */}
      {leitura.estado === "ok" && leitura.mensagem && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm font-medium text-red-700 dark:text-red-400">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1">{leitura.mensagem}</span>
          <Button type="button" variant="outline" onClick={leitura.refazer} className={cn("min-h-11 rounded-xl", FOCO)}>{t("ativos.tentarDeNovo")}</Button>
        </div>
      )}

      {leitura.estado === "ok" && dados && !naoPodeVer && (
        <>
          {!emSaidas && (
            <TotaisGrupo
              grupo={grupo} totais={totaisAtivos(dados[grupo], mes)} parcial={dados.truncado} soEmUso={estado !== "ativos"}
              parado={grupo === "estrutura" ? custoParadoDosAtivos(dados.pessoa, mes, hoje) : null}
              livres={grupo === "pessoa" ? livres : null}
            />
          )}
          <Tabs value={emSaidas ? VALOR_SEPARADOR_SAIDAS : grupo} onValueChange={mudarGrupo} className="space-y-4" aria-busy={leitura.aAtualizar}>
            <TabsList aria-label={t("ativos.separadores")} className="grid h-auto w-full grid-cols-2 gap-1.5 rounded-2xl border bg-muted/50 p-1.5 sm:grid-cols-4">
              {GRUPOS_ATIVO.map((g) => {
                const Icone = ICONE_GRUPO[g];
                return (
                  <TabsTrigger
                    key={g} value={g}
                    className={cn(
                      "group min-h-11 min-w-0 justify-start gap-3 whitespace-normal rounded-xl px-2.5 py-2.5 text-left text-muted-foreground sm:px-3.5 sm:py-3",
                      "transition-[background-color,box-shadow,color] duration-150 hover:text-foreground motion-reduce:transition-none",
                      "data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-md data-[state=active]:ring-1 data-[state=active]:ring-border",
                      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    )}
                  >
                    <span aria-hidden="true" className={cn("hidden h-10 w-10 shrink-0 place-items-center rounded-xl sm:grid", TOM_GRUPO[g])}>
                      <Icone className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold sm:text-[15px]">
                        {t(`ativos.grupo.${g}`)}
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums",
                            toneBadge.neutral, "group-data-[state=active]:bg-primary/10 group-data-[state=active]:text-primary dark:group-data-[state=active]:bg-primary/20 dark:group-data-[state=active]:text-violet-300",
                          )}
                        >
                          {contagens[g]}
                        </span>
                      </span>
                      <span className="mt-0.5 hidden truncate text-xs font-normal text-muted-foreground md:block">{t(`ativos.grupo.${g}.curto`)}</span>
                    </span>
                  </TabsTrigger>
                );
              })}
              <SeparadorSaidas />
            </TabsList>
            {GRUPOS_ATIVO.map((g) => (
              <TabsContent key={g} value={g} className="mt-0 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
                {painelDoGrupo(g, dados)}
              </TabsContent>
            ))}
            <TabsContent value={VALOR_SEPARADOR_SAIDAS} className="mt-0 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
              <SaidasPorDevolver organizationId={activeCompany.id} ligacaoFrota={hasPermission(PERMISSAO_VER_FROTA)} />
            </TabsContent>
          </Tabs>
        </>
      )}

      <AtivoDetalhe
        ativo={detalhe} mes={mes} hoje={hoje} centrosCusto={dados?.centrosCusto ?? []} rhOculto={rhOculto} podeEditar={podeEditar} podeVerValorStock={podeVerValorStock}
        aoFechar={() => setDetalheId(null)} aoFecharFoco={devolverFoco} aoEditar={editar} aoDesativar={desativar} aoReativar={reativar}
      />
      <AtivoSheet aberto={painel !== null} grupo={painel?.grupo ?? grupo} ativo={painel?.ativo ?? null} aoFechar={() => setPainel(null)} aoFecharFoco={devolverFoco} aoGuardar={aoGuardar} />
      <DesativarAtivoDialog
        ativo={aDesativar} aoFechar={() => setADesativar(null)} aoFecharFoco={devolverFoco}
        aoDesativar={({ nome }) => registar(t("ativos.aviso.desativado", { nome }))}
      />
      <ReativarAtivoDialog
        ativo={aReativar} aoFechar={() => setAReativar(null)} aoFecharFoco={devolverFoco}
        aoReativar={({ nome, aviso: mudaPassado }) => registar(t(mudaPassado ? "ativos.aviso.reativadoMudaPassado" : "ativos.aviso.reativado", { nome }))}
      />
    </div>
  );
}
