/**
 * «Ativos» (/ativos, fase 1: só o registo): o que a empresa comprou, em três grupos (Serviço, Estrutura, Pessoas). Cada separador abre
 * com os TOTAIS (quantos ativos em uso, valor de compra e valor atual), segue a pesquisa e o filtro de estado, sempre à vista, e uma
 * lista curta: nome, o que o liga, valor atual e estado. O resto da informação e as ações abrem no DETALHE de cada ativo. O valor
 * atual calcula-se aqui (depreciação linear, `valorAtivo.ts`). Ver pede `ativos.view`; registar, editar, desativar e reativar pedem
 * `ativos.edit`; ligar a uma pessoa pede também `hr.pessoas.retribuicao.edit`. Os custos por pessoa continuam no RH e nada daqui
 * entra em preços ou orçamentos. Cliente tolerante: sem o registo na base (migration por aplicar) ou sem acesso, o ecrã diz-o.
 */
import { useMemo, useRef, useState } from "react";
import { Plus, Search, TriangleAlert } from "lucide-react";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { AtivoDetalhe } from "@/components/ativos/AtivoDetalhe";
import { AtivoSheet, type AvisoGuardado } from "@/components/ativos/AtivoSheet";
import { DesativarAtivoDialog } from "@/components/ativos/DesativarAtivoDialog";
import { DesligarPessoaDialog } from "@/components/ativos/DesligarPessoaDialog";
import { GrupoPessoas } from "@/components/ativos/GrupoPessoas";
import { LigarPessoaDialog } from "@/components/ativos/LigarPessoaDialog";
import { ListaAtivos } from "@/components/ativos/ListaAtivos";
import { TotaisGrupo } from "@/components/ativos/TotaisGrupo";
import { doEstado, filtrarAtivos, FILTROS_ESTADO, type FiltroEstado } from "@/components/ativos/lib/filtrarAtivos";
import { totaisAtivos } from "@/components/ativos/lib/resumoAtivo";
import { GRUPOS_ATIVO, type Ativo, type AtivosLidos, type GrupoAtivo } from "@/components/ativos/lib/tipos";
import { FOCO, ABA, LISTA_ABAS } from "@/components/ficha-comum/estilosAbas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCompany } from "@/contexts/CompanyContext";
import { useAtivoMutacoes } from "@/hooks/ativos/useAtivoMutacoes";
import { useAtivos } from "@/hooks/ativos/useAtivos";
import { usePermissions } from "@/hooks/usePermissions";
import { useTranslation } from "@/hooks/useTranslation";
import { hojeLocal } from "@/lib/hr/custoBase";
import { cn } from "@/lib/utils";

export const PERMISSAO_VER_ATIVOS = "ativos.view";
export const PERMISSAO_EDITAR_ATIVOS = "ativos.edit";
const PERMISSAO_EDITAR_RH = "hr.pessoas.retribuicao.edit";

interface PainelSheet {
  grupo: GrupoAtivo;
  ativo: Ativo | null;
}

const procurarEm = (dados: AtivosLidos, id: string): Ativo | null =>
  [...dados.servico, ...dados.estrutura, ...dados.pessoa].find((a) => a.id === id) ?? null;

export default function Ativos() {
  const { t } = useTranslation();
  const { activeCompany, isLoading } = useCompany();
  const { hasPermission, loading: permissoesACarregar } = usePermissions();
  const podeVer = hasPermission(PERMISSAO_VER_ATIVOS);
  const podeEditar = hasPermission(PERMISSAO_EDITAR_ATIVOS);
  const podeLigar = podeEditar && hasPermission(PERMISSAO_EDITAR_RH);
  const mutacoes = useAtivoMutacoes();

  const [grupo, setGrupo] = useState<GrupoAtivo>("servico");
  const [texto, setTexto] = useState("");
  const [estado, setEstado] = useState<FiltroEstado>("ativos");
  const [aviso, setAviso] = useState<string | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [painel, setPainel] = useState<PainelSheet | null>(null);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [aDesativar, setADesativar] = useState<Ativo | null>(null);
  const [aLigar, setALigar] = useState<Ativo | null>(null);
  const [aDesligar, setADesligar] = useState<Ativo | null>(null);
  // Quem abriu a folha ou o diálogo (o ativo da lista, ou o botão «Registar ativo»): ao fechar, o foco volta lá.
  const origem = useRef<HTMLElement | null>(null);

  // «Todos» e «Desativados» pedem também os desativados à base; «Desativados» filtra-se depois no ecrã.
  const leitura = useAtivos({ incluirDesativados: estado !== "ativos", enabled: podeVer && !permissoesACarregar });
  const dados = leitura.dados;
  const mes = hojeLocal().slice(0, 7);
  const rhOculto = dados?.rhOculto ?? true;

  const contagens = useMemo(
    () => Object.fromEntries(GRUPOS_ATIVO.map((g) => [g, dados ? doEstado(dados[g], estado).length : 0])) as Record<GrupoAtivo, number>,
    [dados, estado],
  );

  if (isLoading || permissoesACarregar) return <OlyviaLoader />;
  if (!activeCompany) return <NoOrganizationState />;

  const naoPodeVer = !podeVer || leitura.estado === "recusado";
  const detalhe = detalheId && dados ? procurarEm(dados, detalheId) : null;
  const mudarGrupo = (g: string) => { setGrupo(g as GrupoAtivo); setAviso(null); setErroAcao(null); };
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
  const ligar = (a: Ativo) => { setDetalheId(null); setALigar(a); };
  const pedirDesligar = (a: Ativo) => { setDetalheId(null); setADesligar(a); };
  const reativar = async (a: Ativo) => {
    const r = await mutacoes.reativar(a.id);
    setDetalheId(null);
    if (r.ok) registar(t("ativos.aviso.reativado", { nome: a.nome }));
    else setErroAcao(r.mensagem ?? "");
  };
  const desligar = async (a: Ativo) => {
    setADesligar(null);
    if (!a.atribuicao) return;
    const r = await mutacoes.desligarPessoa(a.atribuicao.pessoaEquipamentoId);
    if (r.ok) registar(t("ativos.aviso.desligado", { nome: a.nome }));
    else setErroAcao(r.mensagem ?? "");
  };

  const estadoVazio = (g: GrupoAtivo): JSX.Element =>
    estado === "desativados" ? (
      <p data-testid="estado-vazio" className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{t("ativos.vazio.desativados")}</p>
    ) : (
      <div data-testid="estado-vazio" className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
        <div className="max-w-md space-y-1">
          <p className="text-base font-semibold">{t(`ativos.vazio.titulo.${g}`)}</p>
          <p className="text-sm text-muted-foreground">{t(`ativos.vazio.corpo.${g}`)}</p>
        </div>
        {podeEditar
          ? (
            <Button type="button" onClick={(e) => registarAtivo(g, e.currentTarget)} className={cn("min-h-11 gap-2", FOCO)}>
              <Plus className="h-4 w-4" aria-hidden="true" />{t("ativos.novo")}
            </Button>
          )
          : <p className="text-sm text-muted-foreground">{t("ativos.vazio.ajudaSoVer")}</p>}
      </div>
    );

  const lista = (g: GrupoAtivo, dadosDoGrupo: readonly Ativo[]): JSX.Element => {
    if (doEstado(dadosDoGrupo, estado).length === 0) return estadoVazio(g);
    const filtrado = filtrarAtivos(dadosDoGrupo, estado, texto, rhOculto);
    return filtrado.length === 0
      ? <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{t("ativos.vazio.pesquisa")}</p>
      : <ListaAtivos grupo={g} ativos={filtrado} mes={mes} rhOculto={rhOculto} aoAbrir={(a, el) => { lembrar(el); setDetalheId(a.id); }} />;
  };

  const resumo = (dadosDoGrupo: readonly Ativo[]): string =>
    t("ativos.resumo", { n: filtrarAtivos(dadosDoGrupo, estado, texto, rhOculto).length, total: doEstado(dadosDoGrupo, estado).length });
  const pesquisaAtiva = texto.trim() !== "";

  const painelDoGrupo = (g: GrupoAtivo, d: AtivosLidos): JSX.Element => (
    <div className="space-y-4">
      {d[g].some((a) => a.estado === "ativo") && <TotaisGrupo grupo={g} totais={totaisAtivos(d[g], mes)} parcial={d.truncado} soEmUso={estado !== "ativos"} />}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1 space-y-1.5">
          <Label htmlFor="ativos-procurar">{t("ativos.filtro.procurar")}</Label>
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="ativos-procurar" type="search" value={texto} placeholder={t("ativos.filtro.procurarMarca")}
              onChange={(e) => { setTexto(e.target.value); setAviso(null); }} className={cn("h-11 pl-9", FOCO)}
            />
          </div>
        </div>
        <div className="w-full space-y-1.5 sm:w-52">
          <Label htmlFor="ativos-estado">{t("ativos.filtro.estado")}</Label>
          <NativeSelect
            id="ativos-estado" className="h-11" value={estado} onValueChange={(v) => { setEstado(v as FiltroEstado); setAviso(null); }}
            options={FILTROS_ESTADO.map((f) => ({ value: f, label: t(`ativos.filtro.estado.${f}`) }))}
          />
        </div>
        {pesquisaAtiva && <Button type="button" variant="outline" onClick={() => setTexto("")} className={cn("min-h-11", FOCO)}>{t("ativos.filtro.limpar")}</Button>}
      </div>
      <p role="status" aria-live="polite" data-testid="ativos-resumo" className="min-h-5 text-sm tabular-nums text-muted-foreground">{aviso ?? resumo(d[g])}</p>
      {erroAcao && <p role="alert" className="text-sm font-medium text-destructive">{erroAcao}</p>}
      {/* A base devolve no máximo 2000 ativos no total (por ordem de nome): não se sabe de que grupo ficaram de fora, por isso o aviso vale para todos. */}
      {d.truncado && <p data-testid="aviso-truncado" className="text-sm text-amber-800 dark:text-amber-300">{t("ativos.truncado")}</p>}
      {g === "pessoa"
        ? <GrupoPessoas rhOculto={rhOculto} semAtivo={d.atribuicoesSemAtivo}>{lista(g, d[g])}</GrupoPessoas>
        : lista(g, d[g])}
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">{t("ativos.titulo")}</h1>
          <p className="max-w-3xl text-muted-foreground">{t("ativos.sub")}</p>
        </div>
        {podeEditar && leitura.estado === "ok" && (
          <Button type="button" onClick={(e) => registarAtivo(grupo, e.currentTarget)} className={cn("min-h-11 gap-2", FOCO)}>
            <Plus className="h-4 w-4" aria-hidden="true" />{t("ativos.novo")}
          </Button>
        )}
      </div>

      {leitura.estado === "a_carregar" && !naoPodeVer && (
        <OlyviaLoader size={16} text={t("ativos.aCarregar")} className="flex-row justify-start" />
      )}
      {leitura.estado === "indisponivel" && (
        <div role="status" className="space-y-1 rounded-lg border border-dashed p-6">
          <p className="font-medium">{t("ativos.indisponivel")}</p>
          <p className="text-sm text-muted-foreground">{t("ativos.indisponivelAjuda")}</p>
        </div>
      )}
      {naoPodeVer && (
        <div role="status" className="space-y-1 rounded-lg border border-dashed p-6">
          <p className="font-medium">{t("ativos.semAcesso")}</p>
          <p className="text-sm text-muted-foreground">{t("ativos.semAcessoAjuda")}</p>
        </div>
      )}
      {leitura.estado === "erro" && !naoPodeVer && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 p-3 text-sm text-destructive">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{leitura.mensagem ?? t("ativos.erroLer")}</span>
          <Button type="button" variant="outline" onClick={leitura.refazer} className={cn("min-h-11", FOCO)}>{t("ativos.tentarDeNovo")}</Button>
        </div>
      )}

      {/* Uma releitura que falha com dados na mão não tira o ecrã: a lista fica e este aviso diz que falhou. */}
      {leitura.estado === "ok" && leitura.mensagem && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 p-3 text-sm text-destructive">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{leitura.mensagem}</span>
          <Button type="button" variant="outline" onClick={leitura.refazer} className={cn("min-h-11", FOCO)}>{t("ativos.tentarDeNovo")}</Button>
        </div>
      )}

      {leitura.estado === "ok" && dados && !naoPodeVer && (
        <Tabs value={grupo} onValueChange={mudarGrupo} className="space-y-4" aria-busy={leitura.aAtualizar}>
          <TabsList className={LISTA_ABAS} aria-label={t("ativos.separadores")}>
            {GRUPOS_ATIVO.map((g) => (
              <TabsTrigger key={g} value={g} className={ABA}>
                {t(`ativos.grupo.${g}`)}
                <Badge variant="secondary" className="tabular-nums">{contagens[g]}</Badge>
              </TabsTrigger>
            ))}
          </TabsList>
          {GRUPOS_ATIVO.map((g) => (
            <TabsContent key={g} value={g} className="mt-0 space-y-4">
              {painelDoGrupo(g, dados)}
            </TabsContent>
          ))}
        </Tabs>
      )}

      <AtivoDetalhe
        ativo={detalhe} mes={mes} centrosCusto={dados?.centrosCusto ?? []} rhOculto={rhOculto} podeEditar={podeEditar} podeLigar={podeLigar}
        aoFechar={() => setDetalheId(null)} aoFecharFoco={devolverFoco} aoEditar={editar} aoDesativar={desativar} aoReativar={(a) => void reativar(a)} aoLigar={ligar} aoDesligar={pedirDesligar}
      />
      <AtivoSheet aberto={painel !== null} grupo={painel?.grupo ?? grupo} ativo={painel?.ativo ?? null} aoFechar={() => setPainel(null)} aoFecharFoco={devolverFoco} aoGuardar={aoGuardar} />
      <DesativarAtivoDialog
        ativo={aDesativar} aoFechar={() => setADesativar(null)} aoFecharFoco={devolverFoco}
        aoDesativar={({ nome }) => registar(t("ativos.aviso.desativado", { nome }))}
      />
      <LigarPessoaDialog
        ativo={aLigar} atribuicoes={dados?.atribuicoesSemAtivo ?? []} aoFechar={() => setALigar(null)} aoFecharFoco={devolverFoco}
        aoLigar={({ nome, pessoa }) => registar(t("ativos.aviso.ligado", { nome, pessoa }))}
      />
      <DesligarPessoaDialog ativo={aDesligar} aoFechar={() => setADesligar(null)} aoFecharFoco={devolverFoco} aoConfirmar={(a) => void desligar(a)} />
    </div>
  );
}
