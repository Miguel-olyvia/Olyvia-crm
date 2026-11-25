/**
 * «Ativos» (/ativos, fase 1: só o registo): o que a empresa comprou, em três grupos (Serviço, Estrutura, Pessoas), com o valor
 * atual calculado aqui (depreciação linear, `valorAtivo.ts`). Ver pede `ativos.view`; criar, editar, desativar e reativar pedem
 * `ativos.edit`; ligar um ativo a uma pessoa pede também `hr.pessoas.retribuicao.edit`. Os custos por pessoa continuam no RH e
 * nada daqui entra em preços ou orçamentos. Cliente tolerante: sem o registo na base (migration por aplicar) ou sem acesso, o ecrã
 * diz-o em vez de rebentar.
 */
import { useMemo, useState } from "react";
import { Plus, Search, TriangleAlert } from "lucide-react";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { AtivoSheet, type AvisoGuardado } from "@/components/ativos/AtivoSheet";
import { DesativarAtivoDialog } from "@/components/ativos/DesativarAtivoDialog";
import { GrupoPessoas } from "@/components/ativos/GrupoPessoas";
import { LigarPessoaDialog } from "@/components/ativos/LigarPessoaDialog";
import { ListaAtivos } from "@/components/ativos/ListaAtivos";
import { doEstado, filtrarAtivos, FILTROS_ESTADO, type FiltroEstado } from "@/components/ativos/lib/filtrarAtivos";
import { GRUPOS_ATIVO, type Ativo, type GrupoAtivo } from "@/components/ativos/lib/tipos";
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
  const [aDesativar, setADesativar] = useState<Ativo | null>(null);
  const [aLigar, setALigar] = useState<Ativo | null>(null);

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
  const mudarGrupo = (g: string) => { setGrupo(g as GrupoAtivo); setAviso(null); setErroAcao(null); };
  const registar = (mensagem: string) => { setAviso(mensagem); setErroAcao(null); };

  const aoGuardar = ({ nome, edicao }: AvisoGuardado) => registar(t(edicao ? "ativos.aviso.guardado" : "ativos.aviso.criado", { nome }));
  const reativar = async (a: Ativo) => {
    const r = await mutacoes.reativar(a.id);
    if (r.ok) registar(t("ativos.aviso.reativado", { nome: a.nome }));
    else setErroAcao(r.mensagem);
  };
  const desligar = async (a: Ativo) => {
    if (!a.atribuicao) return;
    const r = await mutacoes.desligarPessoa(a.atribuicao.pessoaEquipamentoId);
    if (r.ok) registar(t("ativos.aviso.desligado", { nome: a.nome }));
    else setErroAcao(r.mensagem);
  };

  const rotuloVazio = (g: GrupoAtivo, lista: readonly Ativo[]): JSX.Element => {
    const doGrupo = dados ? doEstado(dados[g], estado) : [];
    const filtrado = filtrarAtivos(lista, estado, texto, rhOculto);
    if (doGrupo.length === 0) {
      return estado === "desativados"
        ? <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">{t("ativos.vazio.desativados")}</p>
        : (
          <div className="space-y-1 rounded-md border border-dashed p-6 text-center">
            <p className="font-medium">{t(`ativos.vazio.titulo.${g}`)}</p>
            <p className="text-sm text-muted-foreground">{t(podeEditar ? "ativos.vazio.ajuda" : "ativos.vazio.ajudaSoVer")}</p>
          </div>
        );
    }
    return filtrado.length === 0
      ? <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">{t("ativos.vazio.pesquisa")}</p>
      : (
        <ListaAtivos
          grupo={g} ativos={filtrado} mes={mes} rhOculto={rhOculto} podeEditar={podeEditar} podeLigar={podeLigar}
          aoEditar={(a) => setPainel({ grupo: g, ativo: a })} aoDesativar={setADesativar} aoReativar={(a) => void reativar(a)}
          aoLigar={setALigar} aoDesligar={(a) => void desligar(a)}
        />
      );
  };

  const resumo = (): string => {
    const lista = dados ? dados[grupo] : [];
    return t("ativos.resumo", { n: filtrarAtivos(lista, estado, texto, rhOculto).length, total: doEstado(lista, estado).length });
  };
  const pesquisaAtiva = texto.trim() !== "";

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">{t("ativos.titulo")}</h1>
          <p className="max-w-3xl text-muted-foreground">{t("ativos.sub")}</p>
        </div>
        {podeEditar && leitura.estado === "ok" && (
          <Button type="button" onClick={() => setPainel({ grupo, ativo: null })} className={cn("min-h-11 gap-2", FOCO)}>
            <Plus className="h-4 w-4" aria-hidden="true" />{t("ativos.novo")}
          </Button>
        )}
      </div>

      {leitura.estado === "a_carregar" && !naoPodeVer && (
        <OlyviaLoader size={16} text={t("ativos.aCarregar")} className="flex-row justify-start" />
      )}
      {leitura.estado === "indisponivel" && (
        <div role="status" className="space-y-1 rounded-md border border-dashed p-6">
          <p className="font-medium">{t("ativos.indisponivel")}</p>
          <p className="text-sm text-muted-foreground">{t("ativos.indisponivelAjuda")}</p>
        </div>
      )}
      {naoPodeVer && (
        <div role="status" className="space-y-1 rounded-md border border-dashed p-6">
          <p className="font-medium">{t("ativos.semAcesso")}</p>
          <p className="text-sm text-muted-foreground">{t("ativos.semAcessoAjuda")}</p>
        </div>
      )}
      {leitura.estado === "erro" && !naoPodeVer && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/40 p-3 text-sm text-destructive">
          <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{leitura.mensagem ?? t("ativos.erroLer")}</span>
          <Button type="button" variant="outline" onClick={leitura.refazer} className={cn("min-h-11", FOCO)}>{t("ativos.tentarDeNovo")}</Button>
        </div>
      )}

      {leitura.estado === "ok" && dados && !naoPodeVer && (
        <Tabs value={grupo} onValueChange={mudarGrupo} className="space-y-4">
          <TabsList className={LISTA_ABAS} aria-label={t("ativos.separadores")}>
            {GRUPOS_ATIVO.map((g) => (
              <TabsTrigger key={g} value={g} className={ABA}>
                {t(`ativos.grupo.${g}`)}
                <Badge variant="secondary" className="tabular-nums">{contagens[g]}</Badge>
              </TabsTrigger>
            ))}
          </TabsList>

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
            <div className="w-52 space-y-1.5">
              <Label htmlFor="ativos-estado">{t("ativos.filtro.estado")}</Label>
              <NativeSelect
                id="ativos-estado" className="h-11" value={estado} onValueChange={(v) => { setEstado(v as FiltroEstado); setAviso(null); }}
                options={FILTROS_ESTADO.map((f) => ({ value: f, label: t(`ativos.filtro.estado.${f}`) }))}
              />
            </div>
            {pesquisaAtiva && <Button type="button" variant="outline" onClick={() => setTexto("")} className={cn("min-h-11", FOCO)}>{t("ativos.filtro.limpar")}</Button>}
          </div>

          <p role="status" aria-live="polite" data-testid="ativos-resumo" className="min-h-5 text-sm tabular-nums text-muted-foreground">{aviso ?? resumo()}</p>
          {erroAcao && <p role="alert" className="text-sm font-medium text-destructive">{erroAcao}</p>}
          {dados.truncado && <p className="text-sm text-amber-800 dark:text-amber-300">{t("ativos.truncado")}</p>}

          <p className="text-sm text-muted-foreground">{t(`ativos.grupo.${grupo}.ajuda`)}</p>
          <TabsContent value="servico" className="mt-0">{rotuloVazio("servico", dados.servico)}</TabsContent>
          <TabsContent value="estrutura" className="mt-0">{rotuloVazio("estrutura", dados.estrutura)}</TabsContent>
          <TabsContent value="pessoa" className="mt-0">
            <GrupoPessoas rhOculto={rhOculto} semAtivo={dados.atribuicoesSemAtivo}>{rotuloVazio("pessoa", dados.pessoa)}</GrupoPessoas>
          </TabsContent>
        </Tabs>
      )}

      <AtivoSheet aberto={painel !== null} grupo={painel?.grupo ?? grupo} ativo={painel?.ativo ?? null} aoFechar={() => setPainel(null)} aoGuardar={aoGuardar} />
      <DesativarAtivoDialog
        ativo={aDesativar} aoFechar={() => setADesativar(null)} aoDesativar={({ nome }) => registar(t("ativos.aviso.desativado", { nome }))}
      />
      <LigarPessoaDialog
        ativo={aLigar} atribuicoes={dados?.atribuicoesSemAtivo ?? []} aoFechar={() => setALigar(null)}
        aoLigar={({ nome, pessoa }) => registar(t("ativos.aviso.ligado", { nome, pessoa }))}
      />
    </div>
  );
}
