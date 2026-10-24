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
import { agoraExemplo } from "@/components/rh-exemplo/dados/hojeExemplo";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { SemAcessoCard } from "@/components/rh-exemplo/SemAcessoCard";
import { FilaAlertasFimDoDia } from "@/components/rh-exemplo/fluxosB/alertas/FilaAlertasFimDoDia";
import { FaltasPainel } from "@/components/rh-exemplo/fluxosB/faltas/FaltasPainel";
import { FilaJustificacoesDoDia } from "@/components/rh-exemplo/fluxosB/justificacaoDia/FilaJustificacoesDoDia";
import { usePendentesJustificacaoDia } from "@/components/rh-exemplo/fluxosB/justificacaoDia/usePendentesJustificacaoDia";
import { HorasExtraNaFila, usePendentesHorasExtra } from "@/components/rh-exemplo/fluxosC/HorasExtraNaFila";
import { useFluxosB } from "@/components/rh-exemplo/dados/lojaFluxosB";
import { alertasPorTratar } from "@/components/rh-exemplo/lib/alertasFimDia";
import { MapaAssiduidadeMes } from "@/components/rh-exemplo/assiduidade/MapaAssiduidadeMes";
import { PainelDoDiaDePessoa } from "@/components/rh-exemplo/assiduidade/PainelDoDiaDePessoa";
import { useAssiduidadeDaOrganizacao } from "@/components/rh-exemplo/hooks/useAssiduidadeDaOrganizacao";
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
    const agora = agoraExemplo();
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
  const horasExtraPendentes = usePendentesHorasExtra();
  const alertasPendentes = useFluxosB((e) => alertasPorTratar(e.alertas).length);
  const justificacoesPorDecidir = usePendentesJustificacaoDia();
  const porTratarNaFila = horasExtraPendentes + alertasPendentes + justificacoesPorDecidir;

  const nomePorPessoaId = useMemo(
    () => new Map(pessoas.map((pessoa) => [pessoa.id, pessoa.nome_completo])),
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

  const nomeDoMes = new Intl.DateTimeFormat(language, { month: "long", year: "numeric" }).format(
    new Date(mesVisivel.ano, mesVisivel.mes, 1),
  );

  const mudarMes = (passo: number) =>
    setMesVisivel(({ ano, mes }) => {
      const proximo = new Date(ano, mes + passo, 1);
      return { ano: proximo.getFullYear(), mes: proximo.getMonth() };
    });

  if (organizacao.loading) return <OlyviaLoader />;

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-xl font-semibold">{titulo}</h1>

      {organizacao.recusado ? (
        <SemAcessoCard />
      ) : (
        <Tabs defaultValue="mapa" className="space-y-4">
          <TabsList>
            <TabsTrigger value="mapa">{t("hr.assiduidade.mapa.separador")}</TabsTrigger>
            <TabsTrigger value="fila" className="gap-2">
              {t("hr.assiduidade.desvios.separador")}
              {porTratarNaFila > 0 && (
                <span
                  data-testid="rhd-contador-fila"
                  aria-label={t("rhFluxosD.fila.contadorSeparador", { n: String(porTratarNaFila) })}
                  className="rounded-full border px-1.5 text-xs tabular-nums"
                >
                  {porTratarNaFila}
                </span>
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
                </div>
              </CardHeader>
              <CardContent>
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
            <HorasExtraNaFila />
            <FilaJustificacoesDoDia />
            <FilaAlertasFimDoDia />
          </TabsContent>

          <TabsContent value="faltas">
            <FaltasPainel />
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
          onDepoisDeGravar={() => void organizacao.recarregar()}
        />
      )}
    </div>
  );
}
