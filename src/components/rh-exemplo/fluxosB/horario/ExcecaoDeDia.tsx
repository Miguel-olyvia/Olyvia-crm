/**
 * Excepcao de um dia (fluxo 4): um horario diferente SO nesse dia, que substitui o da semana. No passado nao
 * se cria (so por correccao). Mostra o horario que vale em cada data com excepcao e deixa tirar a excepcao.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { apagarExcecaoDeDia, gravarExcecaoDeDia } from "@/components/rh-exemplo/dados/accoesHorarioB";
import { formatarData, formatarHorasMinutos } from "@/components/rh-exemplo/fluxosB/horario/formatos";
import { hojeIso } from "@/components/rh-exemplo/lib/assiduidade";
import { minutosDoDiaPadrao, type DiaPadrao, type ExcecaoDia } from "@/components/rh-exemplo/lib/horarioTipos";

interface ExcecaoDeDiaProps {
  pessoaId: string;
  excecoes: ExcecaoDia[];
  podeEditar: boolean;
  onFechar: () => void;
}

const DIA_INICIAL: DiaPadrao = { trabalha: true, entrada: "10:00", saida: "14:00", pausaMin: 0 };

export function ExcecaoDeDia({ pessoaId, excecoes, podeEditar, onFechar }: ExcecaoDeDiaProps) {
  const { t } = useTranslation();
  const [data, setData] = useState("");
  const [dia, setDia] = useState<DiaPadrao>(DIA_INICIAL);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const guardar = () => {
    const resultado = gravarExcecaoDeDia(pessoaId, { data, dia, motivo });
    setErro(resultado);
    if (resultado === null) {
      toast.success(t("rhExemplo.hor.excecaoGravada"));
      setData("");
      setMotivo("");
    }
  };

  return (
    <section aria-label={t("rhExemplo.hor.excecaoTitulo")} className="space-y-3 rounded-md border p-4">
      <h3 className="text-sm font-semibold">{t("rhExemplo.hor.excecaoTitulo")}</h3>
      <p className="text-sm text-muted-foreground">{t("rhExemplo.hor.excecaoAjuda")}</p>

      {excecoes.length > 0 && (
        <ul className="space-y-1">
          {[...excecoes]
            .sort((a, b) => a.data.localeCompare(b.data))
            .map((excecao) => (
              <li key={excecao.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border p-2 text-sm">
                <span className="font-medium tabular-nums">{formatarData(excecao.data)}</span>
                <span className="tabular-nums">
                  {excecao.dia.trabalha
                    ? `${excecao.dia.entrada}–${excecao.dia.saida} (${formatarHorasMinutos(minutosDoDiaPadrao(excecao.dia))})`
                    : t("rhExemplo.hor.diaDeFolga")}
                </span>
                <span className="text-muted-foreground">{excecao.motivo}</span>
                {podeEditar && (
                  <Button type="button" size="sm" variant="ghost" className="ml-auto min-h-11" onClick={() => apagarExcecaoDeDia(pessoaId, excecao.id)}>
                    {t("rhExemplo.hor.tirarExcecao")}
                  </Button>
                )}
              </li>
            ))}
        </ul>
      )}

      {podeEditar && (
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="rhb-exc-data">{t("rhExemplo.hor.excecaoData")}</Label>
            <Input id="rhb-exc-data" type="date" className="min-h-11" min={hojeIso()} value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 self-end text-sm">
            <input
              type="checkbox"
              className="h-5 w-5 accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              checked={dia.trabalha}
              onChange={(e) => setDia({ ...dia, trabalha: e.target.checked })}
            />
            {t("rhExemplo.hor.excecaoTrabalha")}
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="rhb-exc-entrada">{t("rhExemplo.hor.entrada")}</Label>
            <Input id="rhb-exc-entrada" type="time" className="min-h-11" disabled={!dia.trabalha} value={dia.entrada} onChange={(e) => setDia({ ...dia, entrada: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rhb-exc-saida">{t("rhExemplo.hor.saida")}</Label>
            <Input id="rhb-exc-saida" type="time" className="min-h-11" disabled={!dia.trabalha} value={dia.saida} onChange={(e) => setDia({ ...dia, saida: e.target.value })} />
          </div>
          <div className="space-y-1.5 sm:col-span-4">
            <Label htmlFor="rhb-exc-motivo">{t("rhExemplo.hor.excecaoMotivo")}</Label>
            <Input id="rhb-exc-motivo" className="min-h-11" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </div>
        </div>
      )}

      {erro && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {t(erro)}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {podeEditar && (
          <Button type="button" className="min-h-11" onClick={guardar}>
            {t("rhExemplo.hor.excecaoGuardar")}
          </Button>
        )}
        <Button type="button" variant="outline" className="min-h-11" onClick={onFechar}>
          {t("rhExemplo.fluxosB.fechar")}
        </Button>
      </div>
    </section>
  );
}
