/** Mostra o pipeline do fluxo 6 a funcionar: dado um tempo feito, diz se nasce uma hora extra e porquê. */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { hojeIso } from "@/components/rh-exemplo/dados/datas";
import { useEstadoRh } from "@/components/rh-exemplo/dados/loja";
import { useTranslation } from "@/hooks/useTranslation";
import { minutosEmHoras } from "./formatosC";
import type { TipoHorarioHE } from "./horasExtraRegras";
import { registarTempoAMais, type RespostaTempoAMais } from "./lojaFluxosC";

const TIPOS: TipoHorarioHE[] = ["normal", "repartido", "livre", "isencao", "banco_horas"];
const ESPECIAIS = ["nenhum", "feriado", "descanso"] as const;

interface Props {
  aberto: boolean;
  aoFechar: () => void;
}

const numero = (v: string): number => (v.trim() === "" ? 0 : Number(v));

export function RegistarTempoAMaisDialog({ aberto, aoFechar }: Props) {
  const { t } = useTranslation();
  const ordem = useEstadoRh((e) => e.ordem);
  const fichas = useEstadoRh((e) => e.fichas);
  const activas = ordem.filter((id) => fichas[id]?.pessoa.estado_registo === "activo");
  const [pessoaId, setPessoaId] = useState("");
  const [data, setData] = useState(hojeIso());
  const [tipo, setTipo] = useState<TipoHorarioHE>("normal");
  const [especial, setEspecial] = useState<(typeof ESPECIAIS)[number]>("nenhum");
  const [feito, setFeito] = useState("570");
  const [planeado, setPlaneado] = useState("480");
  const [nocturno, setNocturno] = useState("0");
  const [excesso, setExcesso] = useState("0");
  const [resposta, setResposta] = useState<RespostaTempoAMais | null>(null);

  const valido = pessoaId !== "" && /^\d{4}-\d{2}-\d{2}$/.test(data) && [feito, planeado, nocturno, excesso].every((v) => Number.isFinite(numero(v)) && numero(v) >= 0);

  const calcular = () => {
    if (!valido) return;
    setResposta(registarTempoAMais({
      pessoaId, data, tipo, diaEspecial: especial === "nenhum" ? null : especial,
      feitoMin: numero(feito), planeadoMin: numero(planeado), nocturnoMin: numero(nocturno),
      excessoSobreSaldoMaxMin: numero(excesso), motivoOrigem: t("rhFluxosC.he.registar.motivoOrigem"),
    }));
  };

  return (
    <Dialog open={aberto} onOpenChange={(a) => !a && aoFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("rhFluxosC.he.registar.titulo")}</DialogTitle>
          <DialogDescription>{t("rhFluxosC.he.registar.descricao")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="he-reg-pessoa">{t("rhFluxosC.he.registar.pessoa")}</Label>
            <NativeSelect id="he-reg-pessoa" value={pessoaId} onValueChange={setPessoaId} placeholder={t("rhFluxosC.he.registar.escolher")}
              options={activas.map((id) => ({ value: id, label: fichas[id].pessoa.nome_completo }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="he-reg-data">{t("rhFluxosC.he.registar.data")}</Label>
            <Input id="he-reg-data" type="date" className="min-h-11" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="he-reg-tipo">{t("rhFluxosC.he.registar.tipo")}</Label>
            <NativeSelect id="he-reg-tipo" value={tipo} onValueChange={(v) => setTipo(v as TipoHorarioHE)}
              options={TIPOS.map((v) => ({ value: v, label: t(`rhFluxosC.he.tipo.${v}`) }))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="he-reg-especial">{t("rhFluxosC.he.registar.especial")}</Label>
            <NativeSelect id="he-reg-especial" value={especial} onValueChange={(v) => setEspecial(v as (typeof ESPECIAIS)[number])}
              options={ESPECIAIS.map((v) => ({ value: v, label: t(`rhFluxosC.he.especial.${v}`) }))} />
          </div>
          {[
            ["feito", feito, setFeito], ["planeado", planeado, setPlaneado], ["nocturno", nocturno, setNocturno],
            ...(tipo === "banco_horas" ? [["excesso", excesso, setExcesso] as const] : []),
          ].map(([id, valor, definir]) => (
            <div key={id as string} className="space-y-1.5">
              <Label htmlFor={`he-reg-${id}`}>{t(`rhFluxosC.he.registar.${id}`)}</Label>
              <Input id={`he-reg-${id}`} type="number" min={0} inputMode="numeric" className="min-h-11" value={valor as string}
                onChange={(e) => (definir as (v: string) => void)(e.target.value)} />
            </div>
          ))}
        </div>
        {resposta && (
          <p role="status" className="rounded-md border bg-muted/50 p-3 text-sm">
            {t(`rhFluxosC.he.resultado.${resposta.resultado}`).replace("{t}", minutosEmHoras(resposta.minutos))}
            {resposta.alerta && ` ${t("rhFluxosC.he.resultado.alerta")}`}
            {resposta.acimaDoLimiteMin > 0 && ` ${t("rhFluxosC.he.resultado.acima").replace("{t}", minutosEmHoras(resposta.acimaDoLimiteMin))}`}
          </p>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" className="min-h-11" onClick={aoFechar}>{t("rhFluxosC.comum.fechar")}</Button>
          <Button type="button" className="min-h-11" disabled={!valido} onClick={calcular}>{t("rhFluxosC.he.registar.calcular")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
