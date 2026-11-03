/**
 * «Detetar»: o RH escolhe um intervalo (por omissao o mes atual de Lisboa) e, se quiser, uma pessoa; a base compara o horario
 * planeado com as horas realizadas e cria as horas extra. O hook parte o intervalo (organizacao inteira: semanas acima de 31
 * dias; uma pessoa: janelas de 62 dias), o dialogo diz antes quantos pedidos vai fazer e, se parar, ate que dia correu bem.
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  MAX_JANELAS_DETECAO, diasDoIntervalo, hojeLisboa, limitesDoMes, planoDeDeteccao, useHorasExtraAcoes,
  type ResultadoDeteccao,
} from "@/components/rh-exemplo/hooks/horasExtraReal";
import { usePessoas } from "@/components/rh-exemplo/hooks/usePessoas";
import { useTranslation } from "@/hooks/useTranslation";
import { dataCurta } from "./formatosC";

interface Props {
  aberto: boolean;
  aoFechar: () => void;
}

const TODAS = "";

function mesAtual(): { de: string; ate: string } {
  const hoje = hojeLisboa();
  return limitesDoMes(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)));
}

export function DetetarHorasExtraDialog({ aberto, aoFechar }: Props) {
  const { t } = useTranslation();
  const { pessoas } = usePessoas();
  const { detetar, aExecutar } = useHorasExtraAcoes();
  const [de, setDe] = useState(() => mesAtual().de);
  const [ate, setAte] = useState(() => mesAtual().ate);
  const [pessoaId, setPessoaId] = useState(TODAS);
  const [resposta, setResposta] = useState<ResultadoDeteccao | null>(null);

  // Cada abertura comeca limpa: o mes de hoje, toda a organizacao e sem o resultado da vez anterior.
  useEffect(() => {
    if (!aberto) return;
    const mes = mesAtual();
    setDe(mes.de);
    setAte(mes.ate);
    setPessoaId(TODAS);
    setResposta(null);
  }, [aberto]);

  const intervaloValido = diasDoIntervalo(de, ate) > 0;
  const plano = planoDeDeteccao(de, ate, pessoaId === TODAS ? null : pessoaId);
  const activas = pessoas.filter((p) => p.estado_registo === "activo");

  const executar = async () => {
    if (!intervaloValido || plano.excede) return;
    setResposta(null);
    setResposta(await detetar(de, ate, pessoaId === TODAS ? null : pessoaId));
  };

  const r = resposta?.resumo;
  return (
    <Dialog open={aberto} onOpenChange={(a) => !a && aoFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("rhHeReal.detetar.titulo")}</DialogTitle>
          <DialogDescription>{t("rhHeReal.detetar.descricao")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="he-det-de">{t("rhHeReal.detetar.de")}</Label>
            <Input id="he-det-de" type="date" className="min-h-11" value={de} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="he-det-ate">{t("rhHeReal.detetar.ate")}</Label>
            <Input id="he-det-ate" type="date" className="min-h-11" value={ate} onChange={(e) => setAte(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="he-det-pessoa">{t("rhHeReal.detetar.pessoa")}</Label>
            <NativeSelect id="he-det-pessoa" value={pessoaId} onValueChange={setPessoaId} placeholder={t("rhHeReal.detetar.todas")}
              options={[{ value: TODAS, label: t("rhHeReal.detetar.todas") }, ...activas.map((p) => ({ value: p.id, label: p.nome_completo || t("rhHeReal.pessoaSemNome") }))]} />
          </div>
        </div>
        {!intervaloValido && <p role="alert" className="text-sm text-destructive">{t("rhHeReal.detetar.intervaloInvalido")}</p>}
        {intervaloValido && plano.excede && (
          <p role="alert" className="text-sm text-destructive">
            {t("rhHeReal.erro.intervaloGrande")} ({plano.janelas.length} &gt; {MAX_JANELAS_DETECAO})
          </p>
        )}
        {intervaloValido && !plano.excede && plano.janelas.length > 1 && (
          <p role="note" className="text-xs text-muted-foreground">{t("rhHeReal.detetar.pedidos", { n: String(plano.janelas.length) })}</p>
        )}
        {resposta && r && (
          <div role="status" className="space-y-1 rounded-md border bg-muted/50 p-3 text-sm">
            {resposta.erro && <p role="alert" className="text-destructive">{t("rhHeReal.detetar.parou", { erro: resposta.erro })}</p>}
            {resposta.erro && resposta.ultimoDiaOk && <p>{t("rhHeReal.detetar.ateDia", { dia: dataCurta(resposta.ultimoDiaOk) })}</p>}
            {resposta.janelaFalhada && (
              <p>{t("rhHeReal.detetar.janelaFalhada", { de: dataCurta(resposta.janelaFalhada.de), ate: dataCurta(resposta.janelaFalhada.ate) })}</p>
            )}
            <p>{t("rhHeReal.detetar.resultado", { criadas: String(r.criadas), atualizadas: String(r.atualizadas), inalteradas: String(r.inalteradas) })}</p>
            {resposta.pedidos > 1 && <p>{t("rhHeReal.detetar.partido", { n: String(resposta.pedidos) })}</p>}
            {r.saltadasSemHorario > 0 && <p>{t("rhHeReal.detetar.saltadas", { n: String(r.saltadasSemHorario) })}</p>}
            {r.abaixoMinimo > 0 && <p>{t("rhHeReal.detetar.abaixoMinimo", { n: String(r.abaixoMinimo) })}</p>}
            {r.jaDecididas > 0 && <p>{t("rhHeReal.detetar.jaDecididas", { n: String(r.jaDecididas) })}</p>}
            {r.obsoletas > 0 && <p className="font-medium">{t("rhHeReal.detetar.obsoletas", { n: String(r.obsoletas) })}</p>}
            {r.divergentes > 0 && <p className="font-medium">{t("rhHeReal.detetar.divergentes", { n: String(r.divergentes) })}</p>}
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" className="min-h-11" onClick={aoFechar}>{t("rhFluxosC.comum.fechar")}</Button>
          <Button type="button" className="min-h-11" disabled={!intervaloValido || plano.excede || aExecutar} onClick={() => void executar()}>
            {aExecutar ? t("rhHeReal.detetar.aCorrer") : t("rhHeReal.detetar.executar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
