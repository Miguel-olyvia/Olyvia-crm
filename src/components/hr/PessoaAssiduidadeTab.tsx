/**
 * A assiduidade de uma pessoa: o mes dia a dia, e o dia ao detalhe.
 *
 * PORQUE E QUE ESTE SEPARADOR CARREGA E OS OUTROS NAO
 * ---------------------------------------------------
 * Os separadores da ficha recebem tudo de `usePessoa`, que carrega a ficha
 * inteira de uma vez. A assiduidade nao cabe la: depende de uma JANELA DE
 * DATAS que muda enquanto se navega, e trazer todas as picagens de sempre com
 * a ficha seria carregar milhares de linhas para mostrar trinta. Por isso este
 * separador tem hook proprio, `useAssiduidadeDaPessoa`, e recarrega quando o
 * mes muda.
 *
 * A SEMANA E O MES NAO TEM GRELHA DE HORAS
 * ----------------------------------------
 * Uma grelha de altura fixa obriga a inventar um dia-padrao, e e exactamente
 * isso que falha em quem tem semanas irregulares. Aqui os dias empilham-se e
 * cada um ocupa o que precisa: um dia com tres intervalos ocupa tres linhas, e
 * um dia sem trabalho ocupa uma linha esbatida. Quem tem semanas irregulares
 * ve a irregularidade, que e o que se passa.
 */
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { SemAcessoCard } from "@/components/hr/SemAcessoCard";
import { BotaoPicar } from "@/components/hr/assiduidade/BotaoPicar";
import { LocalEtiqueta } from "@/components/hr/assiduidade/LocalEtiqueta";
import { PainelDoDia } from "@/components/hr/assiduidade/PainelDoDia";
import { useAssiduidadeDaPessoa } from "@/hooks/useAssiduidadeDaPessoa";
import { useLocaisTrabalho } from "@/hooks/useLocaisTrabalho";
import {
  LEITOR_FALTAS,
  LEITOR_PICAGENS,
  LEITOR_REALIZADO,
  emVigor,
  formatarDuracao,
  hojeIso,
} from "@/lib/hr/assiduidade";
import { leituraDoPlaneado } from "@/lib/hr/planeadoDoDia";
import type { PermissoesAssiduidade } from "@/types/hrAssiduidade";

interface PessoaAssiduidadeTabProps {
  pessoaId: string;
  pessoaNome: string;
  souAPessoa: boolean;
  permissoes: PermissoesAssiduidade;
}

/** O primeiro e o ultimo dia de um mes, em ISO, sem passar por UTC. */
function limitesDoMes(ano: number, mes: number): { de: string; ate: string } {
  const doisDigitos = (valor: number) => String(valor).padStart(2, "0");
  const ultimoDia = new Date(ano, mes + 1, 0).getDate();
  return {
    de: `${ano}-${doisDigitos(mes + 1)}-01`,
    ate: `${ano}-${doisDigitos(mes + 1)}-${doisDigitos(ultimoDia)}`,
  };
}

export function PessoaAssiduidadeTab({
  pessoaId,
  pessoaNome,
  souAPessoa,
  permissoes,
}: PessoaAssiduidadeTabProps) {
  const { t, language } = useTranslation();
  const hoje = hojeIso();

  const [mesVisivel, setMesVisivel] = useState(() => {
    const agora = new Date();
    return { ano: agora.getFullYear(), mes: agora.getMonth() };
  });

  const janela = useMemo(
    () => limitesDoMes(mesVisivel.ano, mesVisivel.mes),
    [mesVisivel.ano, mesVisivel.mes],
  );

  const assiduidade = useAssiduidadeDaPessoa(pessoaId, janela);
  const { locais } = useLocaisTrabalho();
  const [diaAberto, setDiaAberto] = useState<string | null>(null);

  const podeVer = permissoes.view || permissoes.equipaView || (souAPessoa && permissoes.viewOwn);

  /** Um resumo por dia do mes, com o que ha para ver de relance. */
  const dias = useMemo(() => {
    const realizadoEmVigor = emVigor(assiduidade.realizado, LEITOR_REALIZADO).filter(
      (linha) => !linha.deleted_at,
    );
    const faltasEmVigor = emVigor(assiduidade.faltas, LEITOR_FALTAS);
    const picagensEmVigor = emVigor(assiduidade.picagens, LEITOR_PICAGENS);

    const ultimo = Number(janela.ate.slice(8, 10));
    const linhas = [];
    for (let dia = 1; dia <= ultimo; dia += 1) {
      const iso = `${janela.de.slice(0, 8)}${String(dia).padStart(2, "0")}`;
      const doDia = realizadoEmVigor.filter((linha) => linha.data === iso);
      const faltasDoDia = faltasEmVigor.filter((falta) => falta.data === iso);
      const planeado = leituraDoPlaneado(assiduidade.planeado, iso);
      linhas.push({
        iso,
        minutos: doDia.reduce((soma, linha) => soma + (linha.minutos ?? 0), 0),
        locais: [...new Set(doDia.map((linha) => linha.local_id))],
        faltas: faltasDoDia.length,
        minutosEmFalta: faltasDoDia.reduce((soma, falta) => soma + (falta.minutos ?? 0), 0),
        picagens: picagensEmVigor.filter((picagem) => picagem.data_local === iso).length,
        planeados: planeado.intervalos.length,
        naoTrabalha: planeado.naoTrabalha,
      });
    }
    return linhas;
  }, [assiduidade.realizado, assiduidade.faltas, assiduidade.picagens, assiduidade.planeado, janela]);

  const picagensDeHoje = useMemo(
    () => emVigor(assiduidade.picagens, LEITOR_PICAGENS).filter((p) => p.data_local === hoje),
    [assiduidade.picagens, hoje],
  );
  const planeadoDeHoje = useMemo(
    () => leituraDoPlaneado(assiduidade.planeado, hoje).intervalos,
    [assiduidade.planeado, hoje],
  );

  const nomeDoMes = new Intl.DateTimeFormat(language, { month: "long", year: "numeric" }).format(
    new Date(mesVisivel.ano, mesVisivel.mes, 1),
  );

  if (!podeVer) return <SemAcessoCard />;
  if (assiduidade.loading) return <OlyviaLoader />;

  const mudarMes = (passo: number) =>
    setMesVisivel(({ ano, mes }) => {
      const proximo = new Date(ano, mes + passo, 1);
      return { ano: proximo.getFullYear(), mes: proximo.getMonth() };
    });

  return (
    <div className="space-y-4">
      {souAPessoa && permissoes.picar && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4 text-muted-foreground" />
              {t("hr.assiduidade.picar.titulo")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BotaoPicar
              picagensDeHoje={picagensDeHoje}
              planeadoDeHoje={planeadoDeHoje}
              locais={locais}
              podePicar={permissoes.picar}
              aGravar={assiduidade.saving}
              onPicar={(args) =>
                assiduidade.picar({
                  sentido: args.sentido,
                  localId: args.localId,
                  latitude: args.latitude,
                  longitude: args.longitude,
                  precisaoMetros: args.precisaoMetros,
                  origem: "web",
                })
              }
              idPrefixo="hr-ficha-picar"
            />
          </CardContent>
        </Card>
      )}

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
          <ul className="divide-y">
            {dias.map((dia) => (
              <li key={dia.iso}>
                <button
                  type="button"
                  onClick={() => setDiaAberto(dia.iso)}
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 py-2 text-left text-sm hover:bg-muted/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <span className="w-24 tabular-nums text-muted-foreground">{dia.iso}</span>

                  {dia.minutos > 0 ? (
                    <span className="tabular-nums font-medium">{formatarDuracao(dia.minutos)}</span>
                  ) : dia.naoTrabalha ? (
                    <span className="text-muted-foreground">
                      {t("hr.assiduidade.dia.naoTrabalha")}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      {t("hr.assiduidade.dia.semRegisto")}
                    </span>
                  )}

                  {dia.locais.map((localId) => (
                    <LocalEtiqueta
                      key={localId ?? "sem-local"}
                      locais={locais}
                      localId={localId}
                      className="text-xs text-muted-foreground"
                    />
                  ))}

                  {dia.faltas > 0 && (
                    <Badge variant="outline" className="font-normal">
                      {t("hr.assiduidade.dia.faltaDe", {
                        duracao: formatarDuracao(dia.minutosEmFalta),
                      })}
                    </Badge>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {diaAberto && (
        <PainelDoDia
          aberto
          data={diaAberto}
          pessoaNome={pessoaNome}
          souAPessoa={souAPessoa}
          assiduidade={assiduidade}
          locais={locais}
          permissoes={permissoes}
          onFechar={() => setDiaAberto(null)}
        />
      )}
    </div>
  );
}
