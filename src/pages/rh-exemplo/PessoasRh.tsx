/**
 * A lista de pessoas -- o ecra "Organizacao" do modulo de RH, no mesmo padrao da lista de Pessoas do resto da aplicacao:
 * linhas compactas, chips de filtro e um unico botao primario ("Nova pessoa"). Clicar numa linha abre a ficha num painel
 * lateral por cima da lista (nao muda de pagina); "Nova pessoa" abre outro painel lateral.
 *
 * Quatro sub-separadores: Pessoas, Organograma, Funcoes e (com `hr.pessoas.vinculos.view`) Contratos a terminar.
 * O separador vive no URL (`?tab=`). A ficha vive no caminho (`/rh-exemplo/pessoas/:id`, que continua a ser uma ligacao
 * direta: abre a lista com a ficha aberta) e abrir, passar a outra pessoa ou fechar atualiza o endereco sem remontar a pagina.
 *
 * RH e a pessoa como TRABALHADORA (filial, contrato, horario); o "estado do acesso" (tem conta ligada?) e o "estado do
 * contrato" sao ciclos de vida separados. A coluna do contrato so se mostra a quem tem `hr.pessoas.vinculos.view`.
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { Aba, ListaAbas } from "@/components/ficha-comum/AbasSublinhadas";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { ContratosATerminarTab } from "@/components/rh-exemplo/fimContrato/ContratosATerminarTab";
import { FichaPessoaRh } from "@/components/rh-exemplo/ficha/FichaPessoaRh";
import { BarraListaRh } from "@/components/rh-exemplo/lista/BarraListaRh";
import { contagens, filtrar, type FiltroAcesso } from "@/components/rh-exemplo/lista/filtros";
import { TabelaPessoasRh } from "@/components/rh-exemplo/lista/TabelaPessoasRh";
import { caminhoDaFicha } from "@/components/rh-exemplo/lista/urlFicha";
import { NovaPessoaDialogo } from "@/components/rh-exemplo/NovaPessoaDialogo";
import { PessoasFuncoesTab } from "@/components/rh-exemplo/PessoasFuncoesTab";
import { PessoasOrganogramaTab } from "@/components/rh-exemplo/PessoasOrganogramaTab";
import { SeloExemplo } from "@/components/rh-exemplo/SeloExemplo";
import { useCompany } from "@/components/rh-exemplo/hooks/useCompany";
import { useLocaisTrabalho } from "@/components/rh-exemplo/hooks/useLocaisTrabalho";
import { usePermissions } from "@/components/rh-exemplo/hooks/usePermissions";
import { usePessoas } from "@/components/rh-exemplo/hooks/usePessoas";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

const SUBTABS = [
  { value: "pessoas", labelKey: "hr.subtabs.pessoas" },
  { value: "organograma", labelKey: "hr.subtabs.organograma" },
  { value: "funcoes", labelKey: "hr.subtabs.funcoes" },
  // So com hr.pessoas.vinculos.view: a lista de contratos a terminar le contratos.
  { value: "contratos", labelKey: "hr.subtabs.contratos" },
] as const;

interface FichaAberta {
  id: string | null;
  aberta: boolean;
}

/** Acerta o endereco do navegador sem mudar de pagina nem acrescentar entradas ao historico. */
function sincronizarEndereco(id: string | null): void {
  const { pathname, search, hash } = window.location;
  const novo = caminhoDaFicha(pathname, id);
  if (novo !== pathname) window.history.replaceState(window.history.state, "", `${novo}${search}${hash}`);
}

interface CabecalhoProps {
  podeCriar: boolean;
  resumo: string;
  aoCriar: () => void;
}

function CabecalhoPessoasRh({ podeCriar, resumo, aoCriar }: CabecalhoProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <h1 className="flex flex-wrap items-center gap-3 text-2xl font-bold">
          {t("hr.pessoas.title")}
          <SeloExemplo />
        </h1>
        <p className="text-muted-foreground">{t("rhForm.lista.sub")}</p>
        <p className="text-sm tabular-nums text-muted-foreground">{resumo}</p>
      </div>
      {podeCriar && (
        <Button type="button" onClick={aoCriar} className={cn("min-h-11 gap-2", FOCO)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t("hr.pessoas.new")}
        </Button>
      )}
    </div>
  );
}

export default function PessoasRh({ pessoaIdInicial }: { pessoaIdInicial?: string }) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "pessoas";

  const { activeCompany, isLoading: companyLoading } = useCompany();
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const podeCriar = hasPermission("hr.pessoas.create");
  const podeVerVinculos = hasPermission("hr.pessoas.vinculos.view");
  const { pessoas, stats, loading, error, criarPessoa } = usePessoas();
  // So para leitura: uma pessoa cujo local actual ja foi desactivado tem de continuar a mostrar o nome.
  const { locais } = useLocaisTrabalho({ apenasAtivos: false });
  const nomeDoLocal = (localId: string | null) => (localId ? (locais.find((l) => l.id === localId)?.nome ?? null) : null);

  const [procura, setProcura] = useState("");
  const [filtro, setFiltro] = useState<FiltroAcesso>("todas");
  const [novaAberta, setNovaAberta] = useState(false);
  const [ficha, setFicha] = useState<FichaAberta>({ id: pessoaIdInicial ?? null, aberta: pessoaIdInicial !== undefined });

  // Uma ligacao direta para outra pessoa (mudou o :id do endereco) abre a ficha dela.
  useEffect(() => {
    if (pessoaIdInicial !== undefined) setFicha({ id: pessoaIdInicial, aberta: true });
  }, [pessoaIdInicial]);

  const filtradas = useMemo(() => filtrar(pessoas, procura, filtro), [pessoas, procura, filtro]);
  const contagemDosChips = useMemo(() => contagens(pessoas, procura), [pessoas, procura]);
  const idsVisiveis = useMemo(() => filtradas.map((p) => p.id), [filtradas]);

  const abrirFicha = (id: string) => {
    setFicha({ id, aberta: true });
    sincronizarEndereco(id);
  };
  const fecharFicha = () => {
    setFicha((atual) => ({ ...atual, aberta: false }));
    sincronizarEndereco(null);
  };

  if (companyLoading || permissionsLoading) return <OlyviaLoader />;
  if (!activeCompany) return <NoOrganizationState />;

  const mudarTab = (valor: string) =>
    setSearchParams(
      (anterior) => {
        const proximos = new URLSearchParams(anterior);
        proximos.set("tab", valor);
        return proximos;
      },
      { replace: true },
    );
  const limpar = () => {
    setProcura("");
    setFiltro("todas");
  };

  return (
    <div className="space-y-6">
      <CabecalhoPessoasRh
        podeCriar={podeCriar} aoCriar={() => setNovaAberta(true)}
        resumo={t("rhForm.lista.resumo", { activos: stats.activos, entradas: stats.entradas90d, saidas: stats.saidas90d })}
      />

      <Tabs value={activeTab} onValueChange={mudarTab} className="space-y-4">
        <ListaAbas>
          {SUBTABS.filter(({ value }) => value !== "contratos" || podeVerVinculos).map(({ value, labelKey }) => (
            <Aba key={value} value={value} rotulo={t(labelKey)} />
          ))}
        </ListaAbas>

        <TabsContent value="pessoas" className="mt-0 space-y-4">
          <BarraListaRh
            pesquisa={procura} aoPesquisar={setProcura} filtro={filtro} aoFiltrar={setFiltro}
            contagens={contagemDosChips} total={filtradas.length}
          />
          {error && <p role="alert" className="text-sm text-destructive">{t("hr.erros.carregarLista")} — {error}</p>}
          {loading ? (
            <OlyviaLoader />
          ) : filtradas.length === 0 ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border p-4">
              <p className="text-sm text-foreground">{pessoas.length === 0 ? t("rhForm.lista.vazia") : t("hr.pessoas.emptyFiltered")}</p>
              {pessoas.length > 0 && <Button type="button" className="min-h-11" onClick={limpar}>{t("rhForm.lista.limpar")}</Button>}
            </div>
          ) : (
            <TabelaPessoasRh
              pessoas={filtradas} nomeDoLocal={nomeDoLocal} comContrato={podeVerVinculos}
              abertaId={ficha.aberta ? ficha.id : null} aoAbrir={abrirFicha}
            />
          )}
        </TabsContent>

        <TabsContent value="organograma" className="mt-0">
          <PessoasOrganogramaTab pessoas={pessoas} loading={loading} error={error} />
        </TabsContent>
        <TabsContent value="funcoes" className="mt-0">
          <PessoasFuncoesTab pessoas={pessoas} loading={loading} />
        </TabsContent>
        {podeVerVinculos && (
          <TabsContent value="contratos" className="mt-0">
            <ContratosATerminarTab organizationId={activeCompany.id} />
          </TabsContent>
        )}
      </Tabs>

      <FichaPessoaRh id={ficha.id} aberta={ficha.aberta} aoFechar={fecharFicha} idsVisiveis={idsVisiveis} aoIrPara={abrirFicha} />

      {podeCriar && (
        <NovaPessoaDialogo
          open={novaAberta} onOpenChange={setNovaAberta}
          colegas={pessoas.map((p) => ({ id: p.id, nome_completo: p.nome_completo }))}
          onCriar={criarPessoa} onCriada={abrirFicha}
        />
      )}
    </div>
  );
}
