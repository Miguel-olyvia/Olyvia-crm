/**
 * «Custos» (módulo do RH de exemplo): o custo de cada pessoa num mês — retribuição do «Cálculo do mês», encargos, valores
 * avulsos e equipamentos amortizados —, com os totais da organização, filtros, ordenação e a composição de cada custo.
 * Clicar numa pessoa abre a ficha dela já no separador Custo. Atribuir equipamento e registar um valor avulso funcionam
 * aqui, em memória, e mudam logo os totais. Só dados de exemplo: nada fala com base de dados.
 */
import { useMemo, useState } from "react";
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
import { useEstadoRh } from "@/components/rh-exemplo/dados/loja";
import { definirMesCusto, useCusto } from "@/components/rh-exemplo/dados/lojaCusto";
import { useCompany } from "@/components/rh-exemplo/hooks/useCompany";
import { useMinhaPessoa } from "@/components/rh-exemplo/hooks/useMinhaPessoa";
import {
  SEM_FILTRO, filtrarLinhas, ordenarLinhas, totaisDaOrganizacao, type ColunaCusto, type FiltrosCusto,
} from "@/components/rh-exemplo/lib/custoOrganizacao";
import { useTranslation } from "@/hooks/useTranslation";

const FILTROS_INICIAIS: FiltrosCusto = { texto: "", local: SEM_FILTRO, contrato: SEM_FILTRO };
const ORDEM_INICIAL: Ordem = { coluna: "nome", sentido: "asc" };

/** As pessoas de que se pode escolher uma nos painéis «Atribuir equipamento» e «Registar valor avulso». */
function usePessoasEscolhiveis(): PessoaEscolhivel[] {
  const ordem = useEstadoRh((e) => e.ordem);
  const fichas = useEstadoRh((e) => e.fichas);
  return useMemo(() => ordem.flatMap((id) => (fichas[id] ? [{ id, nome: fichas[id].pessoa.nome_completo }] : [])), [ordem, fichas]);
}

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
  const linhas = useCustoDaOrganizacao(mes);
  const pessoas = usePessoasEscolhiveis();
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
    <div className="space-y-5 p-6">
      <CabecalhoPagina aoRegistarAvulso={() => setAvulsoAberto(true)} aoAtribuirEquipamento={() => setEquipamentoAberto(true)} />

      <SeletorMesCusto id="rhCustos-mes" />
      <p role="status" aria-live="polite" className="min-h-5 text-sm text-muted-foreground">{aviso || t("rhCustos.mesVisto", { mes: nomeDoMes(mes, language) })}</p>
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
        ficha={ficha} idsVisiveis={visiveis.map((l) => l.pessoaId)} pessoas={pessoas} autor={autor}
        avulsoAberto={avulsoAberto} equipamentoAberto={equipamentoAberto}
        aoFecharFicha={() => setFicha((f) => ({ ...f, aberta: false }))} aoIrParaFicha={(id) => setFicha({ id, aberta: true })}
        aoFecharAvulso={() => setAvulsoAberto(false)} aoFecharEquipamento={() => setEquipamentoAberto(false)}
        aoRegistarAvulso={aoRegistarAvulso} aoAtribuir={aoAtribuir}
      />
    </div>
  );
}
