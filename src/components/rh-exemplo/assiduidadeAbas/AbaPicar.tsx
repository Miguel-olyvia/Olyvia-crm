// A aba «Picar»: o botão de picar, o local e o registo do dia (as picagens de hoje). Só para a própria pessoa.
import { Clock } from "lucide-react";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BotaoPicar } from "@/components/rh-exemplo/assiduidade/BotaoPicar";
import type { useAssiduidadeDaPessoa } from "@/components/rh-exemplo/hooks/useAssiduidadeDaPessoa";
import type { useLocaisTrabalho } from "@/components/rh-exemplo/hooks/useLocaisTrabalho";
import { LEITOR_PICAGENS, emVigor, hojeIso } from "@/components/rh-exemplo/lib/assiduidade";
import { leituraDoPlaneado } from "@/components/rh-exemplo/lib/planeadoDoDia";
import { useTranslation } from "@/hooks/useTranslation";

type PropsBotao = Parameters<typeof BotaoPicar>[0];

function CartaoPicar(props: Omit<PropsBotao, "idPrefixo">) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t("hr.assiduidade.picar.titulo")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <BotaoPicar {...props} idPrefixo="hr-ficha-picar" />
      </CardContent>
    </Card>
  );
}

interface LigadaProps {
  assiduidade: ReturnType<typeof useAssiduidadeDaPessoa>;
  locais: ReturnType<typeof useLocaisTrabalho>["locais"];
  podePicar: boolean;
}

/** A aba «Picar» ligada aos dados da pessoa: as picagens e o planeado de hoje, e a gravação de uma picagem nova. */
export function AbaPicar({ assiduidade, locais, podePicar }: LigadaProps) {
  const hoje = hojeIso();
  const picagensDeHoje = useMemo(
    () => emVigor(assiduidade.picagens, LEITOR_PICAGENS).filter((p) => p.data_local === hoje),
    [assiduidade.picagens, hoje],
  );
  const planeadoDeHoje = useMemo(() => leituraDoPlaneado(assiduidade.planeado, hoje).intervalos, [assiduidade.planeado, hoje]);
  return (
    <CartaoPicar
      picagensDeHoje={picagensDeHoje} planeadoDeHoje={planeadoDeHoje} locais={locais} podePicar={podePicar} aGravar={assiduidade.saving}
      onPicar={(args) =>
        assiduidade.picar({
          sentido: args.sentido, localId: args.localId, latitude: args.latitude, longitude: args.longitude,
          precisaoMetros: args.precisaoMetros, origem: "web",
        })
      }
    />
  );
}
