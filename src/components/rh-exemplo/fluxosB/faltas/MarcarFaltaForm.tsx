/**
 * O RH MARCA a falta (fluxo 7): pessoa, dia, hora de inicio e de fim, e o motivo. O sistema so sugere; aqui e
 * que a falta nasce. Recusa se cruza tempo trabalhado, outra falta ou ausencia aprovada, e a mensagem diz qual.
 * A falta nasce «ativa» e «sem justificacao».
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { useEstadoRh } from "@/components/rh-exemplo/dados/loja";
import { marcarFaltaDoRh } from "@/components/rh-exemplo/dados/accoesAssiduidadeB";
import { MOTIVOS_FALTA, type MotivoFalta } from "@/components/rh-exemplo/tiposAssiduidade";

export interface FaltaPreenchida {
  pessoaId: string;
  data: string;
  inicio: string;
  fim: string;
  alertaId: string | null;
}

interface MarcarFaltaFormProps {
  inicial: FaltaPreenchida | null;
  onFechar: () => void;
}

export function MarcarFaltaForm({ inicial, onFechar }: MarcarFaltaFormProps) {
  const { t } = useTranslation();
  const fichas = useEstadoRh((e) => e.fichas);
  const ordem = useEstadoRh((e) => e.ordem);
  const [pessoaId, setPessoaId] = useState(inicial?.pessoaId ?? "");
  const [data, setData] = useState(inicial?.data ?? "");
  const [inicio, setInicio] = useState(inicial?.inicio ?? "09:00");
  const [fim, setFim] = useState(inicial?.fim ?? "13:00");
  const [motivo, setMotivo] = useState<MotivoFalta | "">("");
  const [erro, setErro] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);

  const marcar = () => {
    if (!pessoaId) return setErro(t("rhExemplo.fal.erro.semPessoa"));
    if (!motivo) return setErro(t("rhExemplo.fal.erro.semMotivo"));
    const resultado = marcarFaltaDoRh(pessoaId, { data, inicio, fim }, motivo, motivo, inicial?.alertaId ?? null);
    if (resultado.erro) return setErro(t(resultado.erro, { detalhe: resultado.detalhe ?? "" }));
    setErro(null);
    setAvisos((resultado.avisos ?? []).map((aviso) => t(aviso)));
    toast.success(t("rhExemplo.fal.faltaMarcada"));
    if ((resultado.avisos ?? []).length === 0) onFechar();
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
            options={ordem.filter((id) => fichas[id]).map((id) => ({ value: id, label: fichas[id].pessoa.nome_completo }))}
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
        <Button type="button" className="min-h-11" onClick={marcar}>
          {t("rhExemplo.fal.marcarBotao")}
        </Button>
        <Button type="button" variant="outline" className="min-h-11" onClick={onFechar}>
          {t("rhExemplo.fluxosB.fechar")}
        </Button>
      </div>
    </section>
  );
}
