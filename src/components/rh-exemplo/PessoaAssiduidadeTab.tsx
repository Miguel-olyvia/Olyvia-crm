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
 * O MES E UM CALENDARIO
 * ---------------------
 * Cada dia mostra o previsto (pelo tipo de horario em vigor), o feito e a diferenca (ver `calendarioPessoa/`). Clicar
 * num dia abre o detalhe; dai chega-se ao registo do dia (`PainelDoDia`) para corrigir ou justificar. O mes visivel
 * vive aqui porque tambem decide a janela de datas que este hook carrega.
 */
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, Clock } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { SemAcessoCard } from "@/components/rh-exemplo/SemAcessoCard";
import { BotaoPicar } from "@/components/rh-exemplo/assiduidade/BotaoPicar";
import { JustificarFalhaDeMarcacao } from "@/components/rh-exemplo/fluxosB/alertas/JustificarFalhaDeMarcacao";
import { HorasExtraDaPessoa } from "@/components/rh-exemplo/fluxosC/HorasExtraDaPessoa";
import { PainelDoDia } from "@/components/rh-exemplo/assiduidade/PainelDoDia";
import { CalendarioPessoa, type MesVisivel } from "@/components/rh-exemplo/calendarioPessoa/CalendarioPessoa";
import { PessoaRelatorioAssiduidadeMensal } from "@/components/rh-exemplo/PessoaRelatorioAssiduidadeMensal";
import { useAssiduidadeDaPessoa } from "@/components/rh-exemplo/hooks/useAssiduidadeDaPessoa";
import { useLocaisTrabalho } from "@/components/rh-exemplo/hooks/useLocaisTrabalho";
import { LEITOR_PICAGENS, emVigor, hojeIso } from "@/components/rh-exemplo/lib/assiduidade";
import { leituraDoPlaneado } from "@/components/rh-exemplo/lib/planeadoDoDia";
import type { PermissoesAssiduidade } from "@/components/rh-exemplo/tiposAssiduidade";

interface PessoaAssiduidadeTabProps {
  pessoaId: string;
  pessoaNome: string;
  souAPessoa: boolean;
  permissoes: PermissoesAssiduidade;
  /** Cabecalho do relatorio mensal. Omissos quando o chamador nao os tem a mao. */
  cargo?: string | null;
  dataAdmissao?: string | null;
}

/** O primeiro e o ultimo dia de um mes (1 a 12), em ISO, sem passar por UTC. */
function limitesDoMes(ano: number, mes: number): { de: string; ate: string } {
  const doisDigitos = (valor: number) => String(valor).padStart(2, "0");
  const ultimoDia = new Date(ano, mes, 0).getDate();
  return {
    de: `${ano}-${doisDigitos(mes)}-01`,
    ate: `${ano}-${doisDigitos(mes)}-${doisDigitos(ultimoDia)}`,
  };
}

export function PessoaAssiduidadeTab({
  pessoaId,
  pessoaNome,
  souAPessoa,
  permissoes,
  cargo = null,
  dataAdmissao = null,
}: PessoaAssiduidadeTabProps) {
  const { t } = useTranslation();
  const hoje = hojeIso();

  const [mesVisivel, setMesVisivel] = useState<MesVisivel>(() => {
    const agora = new Date();
    return { ano: agora.getFullYear(), mes: agora.getMonth() + 1 };
  });
  const [relatorioAberto, setRelatorioAberto] = useState(false);

  const janela = useMemo(
    () => limitesDoMes(mesVisivel.ano, mesVisivel.mes),
    [mesVisivel.ano, mesVisivel.mes],
  );

  const assiduidade = useAssiduidadeDaPessoa(pessoaId, janela);
  // So para mostrar o nome de cada picagem -- nunca um selector aqui --
  // por isso inclui os desactivados (ver EcraMapaAssiduidade).
  const { locais } = useLocaisTrabalho({ apenasAtivos: false });
  const [diaAberto, setDiaAberto] = useState<string | null>(null);

  const podeVer = permissoes.view || permissoes.equipaView || (souAPessoa && permissoes.viewOwn);

  const picagensDeHoje = useMemo(
    () => emVigor(assiduidade.picagens, LEITOR_PICAGENS).filter((p) => p.data_local === hoje),
    [assiduidade.picagens, hoje],
  );
  const planeadoDeHoje = useMemo(
    () => leituraDoPlaneado(assiduidade.planeado, hoje).intervalos,
    [assiduidade.planeado, hoje],
  );

  if (!podeVer) return <SemAcessoCard />;
  if (assiduidade.loading) return <OlyviaLoader />;

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

      {souAPessoa && <JustificarFalhaDeMarcacao pessoaId={pessoaId} />}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {t("rhCal.titulo")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CalendarioPessoa
            pessoaId={pessoaId}
            pessoaNome={pessoaNome}
            mes={mesVisivel}
            aoMudarMes={setMesVisivel}
            souAPessoa={souAPessoa}
            permissoes={permissoes}
            aoAbrirRegisto={setDiaAberto}
            acoes={
              <Button type="button" variant="outline" className="min-h-11" onClick={() => setRelatorioAberto(true)}>
                {t("rhExemplo.relatorio.abrir")}
              </Button>
            }
          />
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

      <PessoaRelatorioAssiduidadeMensal
        aberto={relatorioAberto}
        onFechar={() => setRelatorioAberto(false)}
        pessoaId={pessoaId}
        pessoaNome={pessoaNome}
        cargo={cargo}
        dataAdmissao={dataAdmissao}
        permissoes={permissoes}
      />
      <section aria-labelledby="rhd-he-ficha-titulo" className="space-y-3" data-testid="rhd-he-ficha">
        <h3 id="rhd-he-ficha-titulo" className="text-base font-semibold">{t("rhFluxosD.ficha.horasExtra")}</h3>
        <HorasExtraDaPessoa pessoaId={pessoaId} />
      </section>
    </div>
  );
}
