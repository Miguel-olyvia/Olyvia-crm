/**
 * Registar tempo a mais a mao: o RH escolhe a pessoa, o dia (ate 12 meses atras), as horas de inicio e de fim e o motivo.
 * E a base que calcula os minutos e as nocturnas, aplica o minimo e os limites, e recusa sobreposicoes.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { MOTIVO_MIN, dataHaMeses, hojeLisboa, useHorasExtraAcoes } from "@/components/rh-exemplo/hooks/horasExtraReal";
import { usePessoas } from "@/components/rh-exemplo/hooks/usePessoas";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";

interface Props {
  aberto: boolean;
  aoFechar: () => void;
}

const MESES_PARA_TRAS = 12;
const HORA_INICIO_OMISSAO = "18:00";
const HORA_FIM_OMISSAO = "20:00";
const HORA = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;

export function RegistarTempoAMaisDialog({ aberto, aoFechar }: Props) {
  const { t } = useTranslation();
  const { pessoas } = usePessoas();
  const { registar, aExecutar } = useHorasExtraAcoes();
  const activas = pessoas.filter((p) => p.estado_registo === "activo");
  const [pessoaId, setPessoaId] = useState("");
  // O dia que a base usa para validar e o de Lisboa: a data nao pode ser futura nem ter mais de 12 meses.
  const hoje = hojeLisboa();
  const minimo = dataHaMeses(hoje, MESES_PARA_TRAS);
  const [data, setData] = useState(hoje);
  const [inicio, setInicio] = useState(HORA_INICIO_OMISSAO);
  const [fim, setFim] = useState(HORA_FIM_OMISSAO);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  // Cada abertura comeca limpa (sem a pessoa, o motivo ou o erro da vez anterior).
  useEffect(() => {
    if (!aberto) return;
    setPessoaId("");
    setData(hojeLisboa());
    setInicio(HORA_INICIO_OMISSAO);
    setFim(HORA_FIM_OMISSAO);
    setMotivo("");
    setErro(null);
  }, [aberto]);

  const valido =
    pessoaId !== "" && /^\d{4}-\d{2}-\d{2}$/.test(data) && data >= minimo && data <= hoje && HORA.test(inicio) && HORA.test(fim) && inicio < fim && motivo.trim().length >= MOTIVO_MIN;

  const fechar = () => {
    setErro(null);
    aoFechar();
  };

  const submeter = async () => {
    if (!valido) return;
    setErro(null);
    const r = await registar({ pessoaId, data, horaInicio: inicio, horaFim: fim, motivo });
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    toast.success(t(r.semAutorizacao ? "rhHeReal.registar.okSemAutorizacao" : r.acimaDoLimite ? "rhHeReal.registar.okAcima" : "rhHeReal.registar.ok"));
    setMotivo("");
    fechar();
  };

  return (
    <Dialog open={aberto} onOpenChange={(a) => !a && fechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("rhFluxosC.he.registar.titulo")}</DialogTitle>
          <DialogDescription>{t("rhHeReal.registar.descricao")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="he-reg-pessoa">{t("rhFluxosC.he.registar.pessoa")}</Label>
            <NativeSelect id="he-reg-pessoa" value={pessoaId} onValueChange={setPessoaId} placeholder={t("rhFluxosC.he.registar.escolher")}
              options={activas.map((p) => ({ value: p.id, label: p.nome_completo || t("rhHeReal.pessoaSemNome") }))} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="he-reg-data">{t("rhFluxosC.he.registar.data")}</Label>
            <Input id="he-reg-data" type="date" className="min-h-11" value={data} min={minimo} max={hoje} onChange={(e) => setData(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="he-reg-inicio">{t("rhHeReal.registar.inicio")}</Label>
            <Input id="he-reg-inicio" type="time" className="min-h-11" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="he-reg-fim">{t("rhHeReal.registar.fim")}</Label>
            <Input id="he-reg-fim" type="time" className="min-h-11" value={fim} onChange={(e) => setFim(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="he-reg-motivo">{t("rhHeReal.registar.motivo")}</Label>
            <Textarea id="he-reg-motivo" value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)} />
          </div>
        </div>
        {!valido && <p className="text-xs text-muted-foreground">{t("rhHeReal.registar.invalido")}</p>}
        {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" className="min-h-11" onClick={fechar}>{t("rhFluxosC.comum.fechar")}</Button>
          <Button type="button" className="min-h-11" disabled={!valido || aExecutar} onClick={() => void submeter()}>{t("rhHeReal.registar.registar")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
