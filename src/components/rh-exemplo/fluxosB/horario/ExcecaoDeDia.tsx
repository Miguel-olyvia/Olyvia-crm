/**
 * Excepcao de um dia: um horario diferente SO nesse dia, que substitui o da semana (linha com `data` em
 * `pessoas_horario_planeado`). No passado nao se cria (so se corrige, no historico). Lista as que ainda estao por vir
 * e deixa tirar a excepcao. A base nao guarda o motivo nem quem a criou, por isso nao se pede nem se mostra.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { formatarData, formatarHorasMinutos } from "@/components/rh-exemplo/fluxosB/horario/formatos";
import { hojeIsoServidor, type LinhaPlaneadoParaGravar } from "@/components/rh-exemplo/lib/horario";
import { linhasComExcecao, linhasSemExcecao, type ExcecaoReal } from "@/components/rh-exemplo/lib/horarioReal";
import { minutosDoDiaPadrao, type DiaPadrao } from "@/components/rh-exemplo/lib/horarioTipos";
import type { HorarioPlaneado } from "@/components/rh-exemplo/tipos";

interface ExcecaoDeDiaProps {
  excecoes: ExcecaoReal[];
  editaveis: readonly HorarioPlaneado[];
  podeEditar: boolean;
  aGravar: boolean;
  onGuardar: (linhas: LinhaPlaneadoParaGravar[]) => Promise<string | null>;
  onFechar: () => void;
}

const DIA_INICIAL: DiaPadrao = { trabalha: true, entrada: "10:00", saida: "14:00", pausaMin: 0 };

export function ExcecaoDeDia({ excecoes, editaveis, podeEditar, aGravar, onGuardar, onFechar }: ExcecaoDeDiaProps) {
  const { t } = useTranslation();
  const [data, setData] = useState("");
  const [dia, setDia] = useState<DiaPadrao>(DIA_INICIAL);
  const [erro, setErro] = useState<string | null>(null);

  const gravar = async (linhas: LinhaPlaneadoParaGravar[]): Promise<boolean> => {
    const falha = await onGuardar(linhas);
    if (falha) {
      setErro(t("rhExemplo.hor.real.erroGravar", { erro: falha }));
      return false;
    }
    setErro(null);
    return true;
  };

  const guardar = async () => {
    const linhas = linhasComExcecao(editaveis, { data, dia });
    if (linhas.ok === false) {
      setErro(t(linhas.erro));
      return;
    }
    if (await gravar(linhas.valor)) {
      toast.success(t("rhExemplo.hor.excecaoGravada"));
      setData("");
    }
  };

  const tirar = async (dataDaExcecao: string) => {
    await gravar(linhasSemExcecao(editaveis, dataDaExcecao));
  };

  return (
    <section aria-label={t("rhExemplo.hor.excecaoTitulo")} className="space-y-3 rounded-md border p-4">
      <h3 className="text-sm font-semibold">{t("rhExemplo.hor.excecaoTitulo")}</h3>
      <p className="text-sm text-muted-foreground">{t("rhExemplo.hor.real.excecaoAjuda")}</p>

      {excecoes.length > 0 ? (
        <ul className="space-y-1">
          {excecoes.map((excecao) => (
            <li key={excecao.data} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border p-2 text-sm">
              <span className="font-medium tabular-nums">{formatarData(excecao.data)}</span>
              <span className="tabular-nums">
                {excecao.naoTrabalha
                  ? t("rhExemplo.hor.diaDeFolga")
                  : `${excecao.intervalos.map((i) => `${i.inicio}–${i.fim}`).join(", ")} (${formatarHorasMinutos(minutosDoDiaPadrao(excecao.dia))})`}
              </span>
              {podeEditar && (
                <Button type="button" size="sm" variant="ghost" className="ml-auto min-h-11" disabled={aGravar} onClick={() => void tirar(excecao.data)}>
                  {t("rhExemplo.hor.tirarExcecao")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t("rhExemplo.hor.real.semExcecoes")}</p>
      )}

      {podeEditar && (
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="rhb-exc-data">{t("rhExemplo.hor.excecaoData")}</Label>
            <Input id="rhb-exc-data" type="date" className="min-h-11" min={hojeIsoServidor()} value={data} onChange={(e) => setData(e.target.value)} />
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
        </div>
      )}

      {erro && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {erro}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {podeEditar && (
          <Button type="button" className="min-h-11" disabled={aGravar} onClick={() => void guardar()}>
            {aGravar && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
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
