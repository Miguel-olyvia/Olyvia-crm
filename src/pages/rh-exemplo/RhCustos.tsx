/**
 * «Custos» (módulo do RH de exemplo): o custo de cada pessoa num mês — retribuição do processamento salarial, encargos, valores
 * avulsos e equipamentos, cada um contado como foi escolhido —, com os totais da organização, filtros, ordenação e a composição de cada custo.
 * Clicar numa pessoa abre a ficha dela já no separador Custo. Registar um valor avulso grava um lançamento pontual no
 * processamento do mês (na base); atribuir equipamento funciona aqui, em memória, e muda logo os totais.
 *
 * LIGADO À BASE: as pessoas, a retribuição do mês (o total bruto estimado do processamento salarial, a mesma conta da
 * «Visão geral», sem os lançamentos pontuais, que contam à parte como valores avulsos), os valores avulsos (só os que
 * contam de uma vez: lançamentos pontuais), o tipo de contrato e as horas por semana (vínculos) vêm da base. AINDA EM
 * MEMÓRIA: equipamentos e as taxas dos encargos (valores de exemplo) — não existe tabela para eles. Os acumulados não se
 * calculam (precisam de cada mês anterior).
 */
import { useState, useMemo } from "react";
import { TriangleAlert } from "lucide-react";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import type { PessoaEscolhivel } from "@/components/rh-exemplo/custo/EquipamentoSheet";
import { SeletorMesCusto } from "@/components/rh-exemplo/custo/SeletorMesCusto";
import { nomeDoMes } from "@/components/rh-exemplo/custo/formato";
import { CabecalhoPagina } from "@/components/rh-exemplo/custo/modulo/CabecalhoPagina";
import { CabecalhoTotais } from "@/components/rh-exemplo/custo/modulo/CabecalhoTotais";
import { FiltrosCustos } from "@/components/rh-exemplo/custo/modulo/FiltrosCustos";
import { PaineisCustos } from "@/components/rh-exemplo/custo/modulo/PaineisCustos";
import { TabelaCustos, type Ordem } from "@/components/rh-exemplo/custo/modulo/TabelaCustos";
import { useCustoDaOrganizacao } from "@/components/rh-exemplo/custo/useCustoDaPessoa";
import { AvulsosReaisProvider } from "@/components/rh-exemplo/custo/lancamentosCusto";
import { definirMesCusto, useCusto } from "@/components/rh-exemplo/dados/lojaCusto";
import { useCompany } from "@/components/rh-exemplo/hooks/useCompany";
import { useMinhaPessoa } from "@/components/rh-exemplo/hooks/useMinhaPessoa";
import {
  SEM_FILTRO, filtrarLinhas, ordenarLinhas, totaisDaOrganizacao, type ColunaCusto, type FiltrosCusto,
} from "@/components/rh-exemplo/lib/custoOrganizacao";
import { RecolhaDeAssiduidade } from "@/components/rh-exemplo/processamento/useCalculoReal";
import { useTranslation } from "@/hooks/useTranslation";

const FILTROS_INICIAIS: FiltrosCusto = { texto: "", local: SEM_FILTRO, contrato: SEM_FILTRO };
const ORDEM_INICIAL: Ordem = { coluna: "nome", sentido: "asc" };

/** A ordem seguinte ao clicar num cabeçalho: inverte a coluna ativa; numa coluna nova, texto a subir e valores a descer. */
function ordemSeguinte(atual: Ordem, coluna: ColunaCusto): Ordem {
  if (atual.coluna === coluna) return { coluna, sentido: atual.sentido === "asc" ? "desc" : "asc" };
  return { coluna, sentido: coluna === "nome" || coluna === "centro" ? "asc" : "desc" };
}

export default function RhCustos() {
  const { t, language } = useTranslation();
  const { activeCompany, isLoading } = useCompany();
  const minha = useMinhaPessoa();
  const mes = useCusto((e) => e.mes);
  const { linhas, calculo, ano, mesNum, vinculosHook, avulsosPorPessoa, lancamentos } = useCustoDaOrganizacao(mes);
  const pessoas = useMemo<PessoaEscolhivel[]>(
    () => calculo.pessoasActivas.map((p) => ({ id: p.id, nome: p.nome_completo })),
    [calculo.pessoasActivas],
  );
  const [filtros, setFiltros] = useState(FILTROS_INICIAIS);
  const [ordem, setOrdem] = useState(ORDEM_INICIAL);
  const [ficha, setFicha] = useState<{ id: string | null; aberta: boolean }>({ id: null, aberta: false });
  const [avulsoAberto, setAvulsoAberto] = useState(false);
  const [equipamentoAberto, setEquipamentoAberto] = useState(false);
  const [aviso, setAviso] = useState("");

  const visiveis = useMemo(() => ordenarLinhas(filtrarLinhas(linhas, filtros), ordem.coluna, ordem.sentido), [linhas, filtros, ordem]);
  const totaisOrganizacao = useMemo(() => totaisDaOrganizacao(linhas), [linhas]);
  const totaisVisiveis = useMemo(() => totaisDaOrganizacao(visiveis), [visiveis]);
  const filtrado = filtros.texto !== "" || filtros.local !== SEM_FILTRO || filtros.contrato !== SEM_FILTRO;
  const autor = minha.nome ?? t("rhA.custo.autorOmissao");

  if (isLoading) return <OlyviaLoader />;
  if (!activeCompany) return <NoOrganizationState />;

  const limpar = () => setFiltros(FILTROS_INICIAIS);
  const aoRegistarAvulso = (mesContagem: string) => {
    definirMesCusto(mesContagem);
    setAviso(t("rhCustos.registado", { mes: nomeDoMes(mesContagem, language) }));
  };
  const aoAtribuir = (pessoaId: string) =>
    setAviso(t("rhCustos.eq.atribuido", { nome: pessoas.find((p) => p.id === pessoaId)?.nome ?? "" }));

  return (
    <AvulsosReaisProvider valor={avulsosPorPessoa}>
    <div className="space-y-5 p-6">
      <CabecalhoPagina aoRegistarAvulso={() => setAvulsoAberto(true)} aoAtribuirEquipamento={() => setEquipamentoAberto(true)} />

      <SeletorMesCusto id="rhCustos-mes" />
      <p role="status" aria-live="polite" className="min-h-5 text-sm text-muted-foreground">{aviso || t("rhCustos.mesVisto", { mes: nomeDoMes(mes, language) })}</p>
      <RecolhaDeAssiduidade calculo={calculo} ano={ano} mes={mesNum} />
      {calculo.pessoasErro && (
        <p role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 p-3 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {t("rhProcReal.custo.erroPessoas", { erro: calculo.pessoasErro })}
        </p>
      )}
      {calculo.retribuicoesHook.recusado && <p role="status" className="text-sm text-amber-800 dark:text-amber-300">{t("rhProcReal.custo.semPermissaoRetribuicao")}</p>}
      {vinculosHook.error && (
        <p role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 p-3 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {t("rhCustos.erroVinculos", { erro: vinculosHook.error })}
        </p>
      )}
      {vinculosHook.recusado && <p role="status" className="text-sm text-amber-800 dark:text-amber-300">{t("rhCustos.semPermissaoVinculos")}</p>}
      {calculo.incompletas > 0 && <p role="status" className="text-sm text-amber-800 dark:text-amber-300">{t("rhProcReal.custo.incompleto", { n: calculo.incompletas })}</p>}
      {!calculo.aCarregar && !calculo.periodoHook.periodo && !calculo.periodoHook.recusado && (
        <p role="status" className="text-sm text-muted-foreground">{t("rhProcReal.custo.semPeriodo")}</p>
      )}
      {(calculo.pessoasACarregar || calculo.aCarregar) && !calculo.pessoasErro && <OlyviaLoader size={16} />}
      {!calculo.pessoasACarregar && !calculo.aCarregar && calculo.pendentes > 0 && (
        <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <OlyviaLoader size={16} />{t("rhProcReal.custo.aCalcular", { n: calculo.pendentes })}
        </div>
      )}
      <CabecalhoTotais totais={totaisOrganizacao} />
      <FiltrosCustos
        linhas={linhas} filtros={filtros} visiveis={visiveis.length}
        aoMudar={(parcial) => setFiltros((f) => ({ ...f, ...parcial }))} aoLimpar={limpar}
      />
      <TabelaCustos
        linhas={visiveis} totais={totaisVisiveis} mesTexto={nomeDoMes(mes, language)} ordem={ordem}
        aoOrdenar={(coluna) => setOrdem((o) => ordemSeguinte(o, coluna))}
        aoAbrir={(id) => setFicha({ id, aberta: true })} filtrado={filtrado} aoLimpar={limpar}
      />
      <p className="text-xs text-muted-foreground">{t("rhCustos.nota")}</p>

      <PaineisCustos
        ficha={ficha} idsVisiveis={visiveis.map((l) => l.pessoaId)} pessoas={pessoas} autor={autor} mes={mes} lancamentos={lancamentos}
        avulsoAberto={avulsoAberto} equipamentoAberto={equipamentoAberto}
        aoFecharFicha={() => setFicha((f) => ({ ...f, aberta: false }))} aoIrParaFicha={(id) => setFicha({ id, aberta: true })}
        aoFecharAvulso={() => setAvulsoAberto(false)} aoFecharEquipamento={() => setEquipamentoAberto(false)}
        aoRegistarAvulso={aoRegistarAvulso} aoAtribuir={aoAtribuir}
      />
    </div>
    </AvulsosReaisProvider>
  );
}
