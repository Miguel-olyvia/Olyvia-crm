/**
 * A accao do RH sobre UM desvio da fila, ligada as RPCs reais:
 *  - Marcar falta: o formulario de faltas abre preenchido com o periodo do desvio (`rpc_hr_falta_marcar`);
 *  - Corrigir: as horas realizadas (`rpc_hr_realizado_corrigir`) ou a picagem por emparelhar (`rpc_hr_picagem_corrigir`);
 *  - Anular a falta coberta por ausencia aprovada (`rpc_hr_falta_anular_por_ausencia`).
 *
 * So se le a assiduidade DESSA pessoa NESSE dia quando a accao e aberta (uma leitura, nao uma por linha da fila).
 * Todos os erros chegam ao utilizador (toast ou texto no painel); nada e engolido.
 */
import { useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { useAssiduidadeDaPessoa } from "@/components/rh-exemplo/hooks/useAssiduidadeDaPessoa";
import { CorrigirRealizadoSheet } from "@/components/rh-exemplo/assiduidade/CorrigirRealizadoSheet";
import { PicagemSheet } from "@/components/rh-exemplo/assiduidade/PicagemSheet";
import { MarcarFaltaForm } from "@/components/rh-exemplo/fluxosB/faltas/MarcarFaltaForm";
import { formatarData } from "@/components/rh-exemplo/fluxosB/horario/formatos";
import { LEITOR_FALTAS, LEITOR_PICAGENS, LEITOR_REALIZADO, emVigor, horaCurta } from "@/components/rh-exemplo/lib/assiduidade";
import type { AccaoDesvio } from "@/components/rh-exemplo/lib/alertasFimDia";
import type { Desvio } from "@/components/rh-exemplo/tiposAssiduidade";
import type { LocalTrabalho } from "@/components/rh-exemplo/tipos";

interface AccaoDoDesvioProps {
  desvio: Desvio;
  accao: AccaoDesvio;
  nome: string;
  locais: LocalTrabalho[];
  /** Depois de a base gravar, para a fila e o mapa lerem outra vez. */
  onAlterado: () => void;
  onFechar: () => void;
}

/**
 * O ultimo valor encontrado. Depois de gravar, a base rele e a linha antiga deixa de estar em vigor (corrigir e
 * inserir uma nova); sem isto o painel piscava «ja nao ha nada para corrigir» entre a releitura e o fecho.
 */
function useUltimoEncontrado<T>(actual: T | null): T | null {
  const guardado = useRef<T | null>(null);
  if (actual !== null) guardado.current = actual;
  return actual ?? guardado.current;
}

export function AccaoDoDesvio({ desvio, accao, nome, locais, onAlterado, onFechar }: AccaoDoDesvioProps) {
  if (accao === "marcar_falta") {
    return (
      <MarcarFaltaForm
        inicial={{
          pessoaId: desvio.pessoa_id,
          data: desvio.data,
          inicio: horaCurta(desvio.hora_inicio),
          fim: horaCurta(desvio.hora_fim),
          alertaId: null,
        }}
        pessoas={[{ id: desvio.pessoa_id, nome }]}
        onFechar={onFechar}
        onMarcada={onAlterado}
      />
    );
  }
  return <AccaoComLeitura desvio={desvio} accao={accao} nome={nome} locais={locais} onAlterado={onAlterado} onFechar={onFechar} />;
}

function AccaoComLeitura({ desvio, accao, nome, locais, onAlterado, onFechar }: AccaoDoDesvioProps) {
  const { t } = useTranslation();
  const janela = useMemo(() => ({ de: desvio.data, ate: desvio.data }), [desvio.data]);
  const assiduidade = useAssiduidadeDaPessoa(desvio.pessoa_id, janela);

  const realizadoLido = useMemo(
    () => emVigor(assiduidade.realizado, LEITOR_REALIZADO).filter((r) => !r.deleted_at).find((r) => r.id === desvio.referencia_id) ?? null,
    [assiduidade.realizado, desvio.referencia_id],
  );
  const picagemLida = useMemo(
    () => emVigor(assiduidade.picagens, LEITOR_PICAGENS).find((p) => p.id === desvio.referencia_id) ?? null,
    [assiduidade.picagens, desvio.referencia_id],
  );
  const faltaLida = useMemo(
    () =>
      emVigor(assiduidade.faltas, LEITOR_FALTAS).find(
        (f) => f.data === desvio.data && horaCurta(f.hora_inicio) === horaCurta(desvio.hora_inicio) && horaCurta(f.hora_fim) === horaCurta(desvio.hora_fim),
      ) ?? null,
    [assiduidade.faltas, desvio.data, desvio.hora_inicio, desvio.hora_fim],
  );
  const ausenciaLida = assiduidade.ausenciaAprovadaPorDia.get(desvio.data) ?? null;
  const realizado = useUltimoEncontrado(realizadoLido);
  const picagem = useUltimoEncontrado(picagemLida);
  const falta = useUltimoEncontrado(faltaLida);
  const ausencia = useUltimoEncontrado(ausenciaLida);

  const depoisDeGravar = async (gravar: Promise<string | null>): Promise<string | null> => {
    const erro = await gravar;
    if (!erro) onAlterado();
    return erro;
  };

  // So se mostra o carregamento enquanto o registo ainda nao chegou: uma releitura depois de gravar nao pode desmontar o painel.
  if (assiduidade.loading && !realizado && !picagem && !(falta && ausencia)) {
    return (
      <p role="status" className="rounded-md border p-3 text-sm text-muted-foreground">
        {t("rhExemplo.pic.real.aLer")}
      </p>
    );
  }

  if (accao === "corrigir" && realizado) {
    return (
      <CorrigirRealizadoSheet
        aberto
        realizadoId={realizado.id}
        horaInicioActual={realizado.hora_inicio}
        horaFimActual={realizado.hora_fim}
        localActual={realizado.local_id}
        locais={locais}
        aGravar={assiduidade.saving}
        onFechar={onFechar}
        onCorrigir={(args) => depoisDeGravar(assiduidade.corrigirRealizado(args))}
        idPrefixo="rhb-desvio-realizado"
      />
    );
  }

  if (accao === "corrigir" && picagem) {
    return (
      <PicagemSheet
        aberto
        modo="corrigir"
        picagem={picagem}
        data={desvio.data}
        locais={locais}
        aGravar={assiduidade.saving}
        onFechar={onFechar}
        // Nunca chamado no modo corrigir; se alguma vez fosse, recusa em vez de gravar em silencio.
        onLancar={async () => "rhExemplo.pic.real.semLinha"}
        onCorrigir={(args) => depoisDeGravar(assiduidade.corrigirPicagem(args))}
        idPrefixo="rhb-desvio-picagem"
      />
    );
  }

  if (accao === "anular_por_ausencia" && falta && ausencia) {
    const anular = async () => {
      const erro = await assiduidade.anularFaltaPorAusencia(falta.id, ausencia.id);
      if (erro) {
        toast.error(t(erro));
        return;
      }
      toast.success(t("hr.assiduidade.falta.anuladaPorAusencia"));
      onAlterado();
      onFechar();
    };
    return (
      <section aria-label={t("hr.assiduidade.accao.anularPorAusencia")} className="space-y-3 rounded-md border p-4">
        <p className="text-sm">{t("rhExemplo.pic.real.confirmarAnular", { nome, data: formatarData(desvio.data) })}</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" className="min-h-11" disabled={assiduidade.saving} onClick={() => void anular()}>
            {t("rhExemplo.pic.real.confirmarAnularBotao")}
          </Button>
          <Button type="button" variant="outline" className="min-h-11" onClick={onFechar}>
            {t("rhExemplo.fluxosB.fechar")}
          </Button>
        </div>
      </section>
    );
  }

  // O registo de que o desvio fala ja nao esta la (mudou desde a leitura da lista): diz-se, nao se abre um formulario vazio.
  const mensagem =
    accao === "anular_por_ausencia"
      ? t(falta ? "rhExemplo.pic.real.semAusencia" : "rhExemplo.pic.real.semFalta")
      : t("rhExemplo.pic.real.semLinha");
  return (
    <section role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-destructive p-3 text-sm text-destructive">
      <span>{mensagem}</span>
      <Button type="button" variant="outline" className="min-h-11" onClick={onFechar}>
        {t("rhExemplo.fluxosB.fechar")}
      </Button>
    </section>
  );
}
