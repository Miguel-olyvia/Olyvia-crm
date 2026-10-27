/**
 * O RH MARCA a falta (fluxo 7): pessoa, dia, hora de inicio e de fim, e o motivo. O sistema so sugere; aqui e
 * que a falta nasce, pela RPC real `rpc_hr_falta_marcar`. A base recusa se cruza tempo trabalhado, outra falta ou
 * ausencia aprovada, e devolve a razao; antes disso confere-se com o que ja esta lido dessa pessoa nesse dia.
 * A falta nasce «activa» e «sem justificacao».
 */
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { useAssiduidadeDaPessoa } from "@/components/rh-exemplo/hooks/useAssiduidadeDaPessoa";
import { LEITOR_FALTAS, LEITOR_REALIZADO, emVigor } from "@/components/rh-exemplo/lib/assiduidade";
import { validarMarcacaoFalta } from "@/components/rh-exemplo/lib/faltasB";
import { MOTIVOS_FALTA, type MotivoFalta } from "@/components/rh-exemplo/tiposAssiduidade";

export interface FaltaPreenchida {
  pessoaId: string;
  data: string;
  inicio: string;
  fim: string;
  alertaId: string | null;
}

export interface PessoaDaLista {
  id: string;
  nome: string;
}

interface MarcarFaltaFormProps {
  inicial: FaltaPreenchida | null;
  pessoas: readonly PessoaDaLista[];
  onFechar: () => void;
  /** Depois de a falta ficar gravada, para a lista de tras se actualizar. */
  onMarcada?: () => void;
}

export function MarcarFaltaForm({ inicial, pessoas, onFechar, onMarcada }: MarcarFaltaFormProps) {
  const { t } = useTranslation();
  const [pessoaId, setPessoaId] = useState(inicial?.pessoaId ?? "");
  const [data, setData] = useState(inicial?.data ?? "");
  const [inicio, setInicio] = useState(inicial?.inicio ?? "09:00");
  const [fim, setFim] = useState(inicial?.fim ?? "13:00");
  const [motivo, setMotivo] = useState<MotivoFalta | "">("");
  const [erro, setErro] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);

  // A assiduidade so da pessoa e do dia escolhidos: nao se le nada antes de haver as duas coisas.
  const janela = useMemo(() => ({ de: data, ate: data }), [data]);
  const assiduidade = useAssiduidadeDaPessoa(pessoaId && data ? pessoaId : undefined, janela);

  const marcar = async () => {
    if (!pessoaId) return setErro(t("rhExemplo.fal.erro.semPessoa"));
    if (!motivo) return setErro(t("rhExemplo.fal.erro.semMotivo"));
    const conferencia = validarMarcacaoFalta(
      { data, inicio, fim },
      motivo,
      {
        realizado: emVigor(assiduidade.realizado, LEITOR_REALIZADO).filter((r) => !r.deleted_at),
        faltas: emVigor(assiduidade.faltas, LEITOR_FALTAS),
        ausencias: [...assiduidade.ausenciaAprovadaPorDia.values()],
      },
    );
    if (!conferencia.ok) return setErro(t(conferencia.erro, { detalhe: conferencia.detalhe ?? "" }));

    const falhou = await assiduidade.marcarFalta({ data, horaInicio: inicio, horaFim: fim, motivoCodigo: motivo });
    if (falhou) return setErro(t(falhou));
    setErro(null);
    setAvisos(conferencia.avisos.map((aviso) => t(aviso)));
    toast.success(t("rhExemplo.fal.faltaMarcada"));
    onMarcada?.();
    if (conferencia.avisos.length === 0) onFechar();
  };

  return (
    <section aria-label={t("rhExemplo.fal.marcarTitulo")} className="space-y-3 rounded-md border p-4">
      <h3 className="text-sm font-semibold">{t("rhExemplo.fal.marcarTitulo")}</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-3">
          <Label htmlFor="rhb-mf-pessoa">{t("rhExemplo.fal.pessoa")}</Label>
          <NativeSelect
            id="rhb-mf-pessoa"
            value={pessoaId}
            placeholder={t("rhExemplo.fal.escolherPessoa")}
            onValueChange={setPessoaId}
            options={pessoas.map((p) => ({ value: p.id, label: p.nome }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rhb-mf-data">{t("rhExemplo.fal.dia")}</Label>
          <Input id="rhb-mf-data" type="date" className="min-h-11" value={data} onChange={(e) => setData(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rhb-mf-inicio">{t("rhExemplo.fal.inicio")}</Label>
          <Input id="rhb-mf-inicio" type="time" className="min-h-11" value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rhb-mf-fim">{t("rhExemplo.fal.fim")}</Label>
          <Input id="rhb-mf-fim" type="time" className="min-h-11" value={fim} onChange={(e) => setFim(e.target.value)} />
        </div>
        <div className="space-y-1.5 sm:col-span-3">
          <Label htmlFor="rhb-mf-motivo">{t("rhExemplo.fal.motivo")}</Label>
          <NativeSelect
            id="rhb-mf-motivo"
            value={motivo}
            placeholder={t("rhExemplo.fal.escolherMotivo")}
            onValueChange={(valor) => setMotivo(valor as MotivoFalta | "")}
            options={MOTIVOS_FALTA.map((m) => ({ value: m, label: t(`hr.assiduidade.motivoFalta.${m}`) }))}
          />
        </div>
      </div>
      {erro && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {erro}
        </p>
      )}
      {avisos.map((aviso) => (
        <p key={aviso} role="status" className="text-sm text-amber-800 dark:text-amber-300">
          {aviso}
        </p>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="min-h-11" disabled={assiduidade.saving} onClick={() => void marcar()}>
          {t("rhExemplo.fal.marcarBotao")}
        </Button>
        <Button type="button" variant="outline" className="min-h-11" onClick={onFechar}>
          {t("rhExemplo.fluxosB.fechar")}
        </Button>
      </div>
    </section>
  );
}
