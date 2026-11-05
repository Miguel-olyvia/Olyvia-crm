/**
 * O mes de assiduidade de muita gente -- o mapa da organizacao.
 *
 * SO HA UM CONSUMIDOR, DE PROPOSITO
 * ----------------------------------
 * Ate esta ronda havia dois ecras sobre este mesmo componente ("o ponto da
 * equipa" e "o mapa da organizacao"), separados pela AUDIENCIA -- a RLS de
 * `pessoas_picagens` sozinha decidia quem aparecia consoante a permissao
 * (`hr.assiduidade.equipa.view` para a cadeia de chefia, `hr.assiduidade.view`
 * para a organizacao inteira). "O ponto da equipa" saiu por nao fazer
 * sentido como ecra proprio; a permissao `hr.assiduidade.equipa.view` fica
 * viva -- continua a decidir o ambito na RLS e em dois separadores da ficha
 * da pessoa (`PessoaAssiduidadeTab`, `PessoaHorarioTab`).
 *
 * UMA LISTA VAZIA NUNCA PROVA AUSENCIA DE DADOS: os tres ramos da RLS das
 * picagens sao permissao-dependentes. Quando a leitura foi recusada mostra-se
 * o bloco de sem acesso, nunca uma grelha vazia nem um zero de horas.
 */
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { SemAcessoCard } from "@/components/rh-exemplo/SemAcessoCard";
import { AvisoDeLeitura } from "@/components/rh-exemplo/AvisoDeLeitura";
import { FaltasPainel } from "@/components/rh-exemplo/fluxosB/faltas/FaltasPainel";
import { ListaFilaPessoas } from "@/components/rh-exemplo/assiduidade/fila/ListaFilaPessoas";
import { textoDasPendencias } from "@/components/rh-exemplo/assiduidade/fila/aspectoTipoFila";
import { MapaAssiduidadeMes } from "@/components/rh-exemplo/assiduidade/MapaAssiduidadeMes";
import { PainelDoDiaDePessoa } from "@/components/rh-exemplo/assiduidade/PainelDoDiaDePessoa";
import { RelatorioAssiduidadeMensalOrganizacao } from "@/components/rh-exemplo/hooks/RelatorioAssiduidadeMensalOrganizacaoReal";
import { useAssiduidadeDaOrganizacao } from "@/components/rh-exemplo/hooks/useAssiduidadeDaOrganizacao";
import { useFilaDeTrabalho } from "@/components/rh-exemplo/hooks/useFilaDeTrabalho";
import { useLocaisTrabalho } from "@/components/rh-exemplo/hooks/useLocaisTrabalho";
import { useMinhaPessoa } from "@/components/rh-exemplo/hooks/useMinhaPessoa";
import { usePessoas } from "@/components/rh-exemplo/hooks/usePessoas";
import { useTranslation } from "@/hooks/useTranslation";
import type { PermissoesAssiduidade } from "@/components/rh-exemplo/tiposAssiduidade";

interface EcraMapaAssiduidadeProps {
  titulo: string;
  permissoes: PermissoesAssiduidade;
}

function limitesDoMes(ano: number, mes: number) {
  const doisDigitos = (valor: number) => String(valor).padStart(2, "0");
  const ultimo = new Date(ano, mes + 1, 0).getDate();
  const de = `${ano}-${doisDigitos(mes + 1)}-01`;
  const dias = Array.from(
    { length: ultimo },
    (_, indice) => `${ano}-${doisDigitos(mes + 1)}-${doisDigitos(indice + 1)}`,
  );
  return { de, ate: dias[dias.length - 1], dias };
}

export function EcraMapaAssiduidade({ titulo, permissoes }: EcraMapaAssiduidadeProps) {
  const { t, language } = useTranslation();
  const [mesVisivel, setMesVisivel] = useState(() => {
    const agora = new Date();
    return { ano: agora.getFullYear(), mes: agora.getMonth() };
  });

  const { de, ate, dias } = useMemo(
    () => limitesDoMes(mesVisivel.ano, mesVisivel.mes),
    [mesVisivel.ano, mesVisivel.mes],
  );

  const janela = useMemo(() => ({ de, ate }), [de, ate]);
  const organizacao = useAssiduidadeDaOrganizacao(janela);
  const { pessoas } = usePessoas();
  // So para mostrar o nome de cada picagem (LocalEtiqueta/MapaAssiduidadeMes)
  // -- nunca um selector aqui -- por isso inclui os desactivados: um mes
  // antigo pode ter picagens num centro entretanto desactivado.
  const { locais } = useLocaisTrabalho({ apenasAtivos: false });
  const { pessoaId: minhaPessoaId } = useMinhaPessoa();

  const [aberto, setAberto] = useState<{ pessoaId: string; data: string } | null>(null);
  const [exportarTudoAberto, setExportarTudoAberto] = useState(false);
  const nomePorPessoaId = useMemo(
    () => new Map(pessoas.map((pessoa) => [pessoa.id, pessoa.nome_completo])),
    [pessoas],
  );
  // A fila de trabalho (horas extra, justificações e alertas do fim do dia) lê-se UMA vez, por pessoa: o contador do
  // separador e a lista saem do mesmo resultado. Segue o período da folha em curso, não o mês visível do mapa.
  const fila = useFilaDeTrabalho(nomePorPessoaId);
  // Para leitores de ecra: «41 pessoas com 86 pendências», ou «Pelo menos 41 pessoas com 86 pendências» se as horas extra foram cortadas.
  const textoDoContadorDaFila = fila.pessoas.length > 0
    ? t(fila.horasExtraCortadas ? "rhFila.contador.ariaMinimo" : "rhFila.contador.aria", {
        pessoas: t(fila.pessoas.length === 1 ? "rhFila.pessoas.um" : "rhFila.pessoas.varios", { n: String(fila.pessoas.length) }),
        pendencias: textoDasPendencias(t, fila.totalPendencias),
      })
    : "";
  // Tudo o que mexe nos desvios ou nas justificações fora da fila (mapa, painel do dia, faltas) relê também a fila.
  const recarregarMapaEFila = (): void => {
    void organizacao.recarregar();
    void fila.recarregar();
  };
  // Com um filtro da fila no endereço (ligação partilhada, recarregar) abre-se o separador da fila.
  const [parametros] = useSearchParams();
  const separadorInicial = parametros.has("fila_tipo") || parametros.has("fila_q") ? "fila" : "mapa";

  /** Todas as pessoas, por nome: e daqui que se escolhe a quem marcar uma falta. */
  const pessoasParaFaltas = useMemo(
    () =>
      pessoas
        .map((pessoa) => ({ id: pessoa.id, nome: pessoa.nome_completo }))
        .sort((a, b) => a.nome.localeCompare(b.nome)),
    [pessoas],
  );

  /**
   * So as pessoas com alguma coisa na janela. Uma grelha com trezentas linhas
   * vazias esconde as cinco que interessam.
   */
  const pessoasDoMapa = useMemo(
    () =>
      [...organizacao.pessoasComRegisto]
        .map((id) => ({ id, nome: nomePorPessoaId.get(id) ?? id }))
        .sort((a, b) => a.nome.localeCompare(b.nome)),
    [organizacao.pessoasComRegisto, nomePorPessoaId],
  );

  /** A mesma lista do mapa, com cargo e data de admissao para o cabecalho impresso de cada pessoa. */
  const pessoaCompletaPorId = useMemo(() => new Map(pessoas.map((pessoa) => [pessoa.id, pessoa])), [pessoas]);
  const pessoasParaExportar = useMemo(
    () =>
      pessoasDoMapa.map((pessoa) => {
        const completa = pessoaCompletaPorId.get(pessoa.id);
        return {
          id: pessoa.id,
          nome: pessoa.nome,
          cargo: completa?.cargo ?? null,
          dataAdmissao: completa?.data_admissao ?? null,
        };
      }),
    [pessoasDoMapa, pessoaCompletaPorId],
  );

  const nomeDoMes = new Intl.DateTimeFormat(language, { month: "long", year: "numeric" }).format(
    new Date(mesVisivel.ano, mesVisivel.mes, 1),
  );

  const mudarMes = (passo: number) =>
    setMesVisivel(({ ano, mes }) => {
      const proximo = new Date(ano, mes + passo, 1);
      return { ano: proximo.getFullYear(), mes: proximo.getMonth() };
    });

  // `loading` so e true no primeiro carregamento de uma janela: as releituras depois de gravar sao silenciosas e
  // mantem a arvore montada (separador activo, pedido da fila, painel do dia, foco).
  if (organizacao.loading) return <OlyviaLoader />;

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-xl font-semibold">{titulo}</h1>

      {organizacao.recusado ? (
        <SemAcessoCard />
      ) : (
        <Tabs defaultValue={separadorInicial} className="space-y-4">
          <TabsList>
            <TabsTrigger value="mapa">{t("hr.assiduidade.mapa.separador")}</TabsTrigger>
            <TabsTrigger value="fila" className="gap-2">
              {t("hr.assiduidade.desvios.separador")}
              {fila.pessoas.length > 0 && (
                <>
                  {/* O numero visivel e decorativo; o leitor de ecra ouve a frase completa (um aria-label num span sem papel seria ignorado). */}
                  <span aria-hidden="true" data-testid="rhd-contador-fila" className="rounded-full border px-1.5 text-xs tabular-nums">
                    {fila.contador}
                  </span>
                  <span className="sr-only" data-testid="rhd-contador-fila-texto">{textoDoContadorDaFila}</span>
                </>
              )}
            </TabsTrigger>
            <TabsTrigger value="faltas">{t("rhExemplo.fal.separador")}</TabsTrigger>
          </TabsList>

          <TabsContent value="mapa">
            <Card>
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-base capitalize">{nomeDoMes}</CardTitle>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("hr.assiduidade.mesAnterior")}
                    onClick={() => mudarMes(-1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("hr.assiduidade.mesSeguinte")}
                    onClick={() => mudarMes(1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  {pessoasDoMapa.length > 0 && (
                    <Button variant="outline" size="sm" onClick={() => setExportarTudoAberto(true)}>
                      <Printer className="mr-2 h-4 w-4" />
                      {t("hr.assiduidade.mapa.exportarTudo")}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <AvisoDeLeitura
                  estado={{ recusado: organizacao.realizadoRecusado, erro: organizacao.realizadoErro }}
                  onTentarDeNovo={() => void organizacao.recarregar()}
                />
                <MapaAssiduidadeMes
                  pessoas={pessoasDoMapa}
                  dias={dias}
                  celulas={organizacao.celulas}
                  locais={locais}
                  onAbrirDia={(pessoaId, data) => setAberto({ pessoaId, data })}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="fila" className="space-y-4">
            <ListaFilaPessoas
              fila={fila}
              permissoes={permissoes}
              locais={locais}
              minhaPessoaId={minhaPessoaId}
              aoAlterarMapa={() => void organizacao.recarregar()}            />
          </TabsContent>

          <TabsContent value="faltas">
            <FaltasPainel
              faltas={organizacao.faltas}
              desvios={organizacao.desvios}
              pessoas={pessoasParaFaltas}
              permissoes={permissoes}
              onAlterado={recarregarMapaEFila}
              leituraFaltas={{ recusado: organizacao.faltasRecusado, erro: organizacao.faltasErro }}
              leituraDesvios={{ recusado: organizacao.desviosRecusado, erro: organizacao.desviosErro }}
              onTentarDeNovo={() => void organizacao.recarregar()}
            />
          </TabsContent>
        </Tabs>
      )}

      {aberto && (
        <PainelDoDiaDePessoa
          pessoaId={aberto.pessoaId}
          pessoaNome={nomePorPessoaId.get(aberto.pessoaId) ?? aberto.pessoaId}
          data={aberto.data}
          souAPessoa={minhaPessoaId === aberto.pessoaId}
          locais={locais}
          permissoes={permissoes}
          onFechar={() => setAberto(null)}
          onDepoisDeGravar={recarregarMapaEFila}
        />
      )}

      {exportarTudoAberto && (
        <RelatorioAssiduidadeMensalOrganizacao
          aberto={exportarTudoAberto}
          onFechar={() => setExportarTudoAberto(false)}
          ano={mesVisivel.ano}
          mes={mesVisivel.mes}
          pessoas={pessoasParaExportar}
          permissoes={permissoes}
        />
      )}
    </div>
  );
}
