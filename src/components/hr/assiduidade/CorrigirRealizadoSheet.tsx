/**
 * Corrigir um intervalo de horas realizadas.
 *
 * A correccao e um LANCAMENTO NOVO: entra uma linha que aponta a errada, e a
 * antiga fica marcada como rejeitada e visivel no historico. Nao ha "editar" e
 * o painel diz isso, para ninguem esperar que o valor antigo desapareca.
 *
 * O motivo e obrigatorio -- `rpc_hr_realizado_corrigir` responde
 * `realizado_correccao_sem_motivo` a um texto vazio. Pedi-lo aqui e so evitar
 * que a pessoa descubra a regra por um toast depois de escrever as horas.
 *
 * UM TURNO DE NOITE SAO DUAS LINHAS, EM DUAS DATAS: a base exige
 * `hora_fim > hora_inicio` na mesma data, e nao ha aqui nenhuma esperteza a
 * inventar uma travessia da meia-noite que a tabela nao guarda.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { CampoSelect, CampoTexto, CamposTocadosProvider } from "@/components/hr/form/Campos";
import { formatarDuracao, horaCurta, minutosEntre } from "@/lib/hr/assiduidade";
import type { LocalTrabalho } from "@/types/hr";

interface CorrigirRealizadoSheetProps {
  aberto: boolean;
  realizadoId: string;
  horaInicioActual: string;
  horaFimActual: string;
  localActual: string | null;
  locais: LocalTrabalho[];
  aGravar: boolean;
  onFechar: () => void;
  onCorrigir: (args: {
    realizadoId: string;
    horaInicio: string;
    horaFim: string;
    localId: string | null;
    motivo: string;
  }) => Promise<string | null>;
  idPrefixo?: string;
}

export function CorrigirRealizadoSheet({
  aberto,
  realizadoId,
  horaInicioActual,
  horaFimActual,
  localActual,
  locais,
  aGravar,
  onFechar,
  onCorrigir,
  idPrefixo = "hr-realizado",
}: CorrigirRealizadoSheetProps) {
  const { t } = useTranslation();
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [localId, setLocalId] = useState("");
  const [motivo, setMotivo] = useState("");
  const [tocados, setTocados] = useState<ReadonlySet<string>>(() => new Set());
  const [mostrarTodos, setMostrarTodos] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setInicio(horaCurta(horaInicioActual));
    setFim(horaCurta(horaFimActual));
    setLocalId(localActual ?? "");
    setMotivo("");
    setTocados(new Set());
    setMostrarTodos(false);
  }, [aberto, horaInicioActual, horaFimActual, localActual]);

  const tocar = (campoId: string) =>
    setTocados((anteriores) =>
      anteriores.has(campoId) ? anteriores : new Set(anteriores).add(campoId),
    );

  const minutos = minutosEntre(inicio, fim);

  const problemas = useMemo(() => {
    const lista: { campo: string; mensagemKey: string }[] = [];
    if (!inicio) lista.push({ campo: "inicio", mensagemKey: "hr.assiduidade.erro.semHoraInicio" });
    if (!fim) lista.push({ campo: "fim", mensagemKey: "hr.assiduidade.erro.semHoraFim" });
    if (minutos !== null && minutos <= 0) {
      lista.push({ campo: "fim", mensagemKey: "hr.assiduidade.erro.fimAntesDoInicio" });
    }
    if (motivo.trim() === "") {
      lista.push({ campo: "motivo", mensagemKey: "hr.assiduidade.erro.semMotivoEscrito" });
    }
    return lista;
  }, [inicio, fim, minutos, motivo]);

  const idInicio = `${idPrefixo}-inicio`;
  const idFim = `${idPrefixo}-fim`;
  const idLocal = `${idPrefixo}-local`;
  const idMotivo = `${idPrefixo}-motivo`;

  const erroDe = (campo: string, id: string) => {
    const problema = problemas.find((p) => p.campo === campo);
    if (!problema) return null;
    if (!mostrarTodos && !tocados.has(id)) return null;
    return t(problema.mensagemKey);
  };

  const gravar = async () => {
    if (problemas.length > 0) {
      setMostrarTodos(true);
      toast.error(t(problemas[0].mensagemKey));
      return;
    }
    const erro = await onCorrigir({
      realizadoId,
      horaInicio: inicio,
      horaFim: fim,
      localId: localId || null,
      motivo: motivo.trim(),
    });
    if (erro) {
      toast.error(t(erro));
      return;
    }
    toast.success(t("hr.assiduidade.realizado.corrigido"));
    onFechar();
  };

  return (
    <Sheet open={aberto} onOpenChange={(estado) => !estado && onFechar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t("hr.assiduidade.realizado.corrigirTitulo")}</SheetTitle>
          <SheetDescription>{t("hr.assiduidade.realizado.corrigirExplicacao")}</SheetDescription>
        </SheetHeader>

        <CamposTocadosProvider onTocar={tocar}>
          <div className="mt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <CampoTexto
                id={idInicio}
                label={t("hr.assiduidade.campo.horaInicio")}
                tipo="time"
                valor={inicio}
                erro={erroDe("inicio", idInicio)}
                onChange={setInicio}
              />
              <CampoTexto
                id={idFim}
                label={t("hr.assiduidade.campo.horaFim")}
                tipo="time"
                valor={fim}
                erro={erroDe("fim", idFim)}
                onChange={setFim}
              />
            </div>

            <p aria-live="polite" className="text-sm text-muted-foreground">
              {minutos !== null && minutos > 0
                ? formatarDuracao(minutos)
                : t("hr.assiduidade.falta.semDuracao")}
            </p>

            <CampoSelect
              id={idLocal}
              label={t("hr.assiduidade.campo.local")}
              valor={localId}
              vazioLabel={t("hr.assiduidade.semLocal")}
              onChange={setLocalId}
              opcoes={locais.map((local) => ({ value: local.id, label: local.nome }))}
            />

            <div className="space-y-1.5">
              <Label htmlFor={idMotivo}>{t("hr.assiduidade.campo.motivoObrigatorio")}</Label>
              <Textarea
                id={idMotivo}
                rows={3}
                value={motivo}
                aria-invalid={erroDe("motivo", idMotivo) ? true : undefined}
                aria-describedby={erroDe("motivo", idMotivo) ? `${idMotivo}-erro` : undefined}
                onBlur={() => tocar(idMotivo)}
                onChange={(evento) => setMotivo(evento.target.value)}
              />
              {erroDe("motivo", idMotivo) && (
                <p id={`${idMotivo}-erro`} className="text-xs text-destructive">
                  {erroDe("motivo", idMotivo)}
                </p>
              )}
            </div>
          </div>
        </CamposTocadosProvider>

        <SheetFooter className="mt-6 gap-2">
          <Button variant="ghost" disabled={aGravar} onClick={onFechar}>
            {t("common.cancel")}
          </Button>
          <Button disabled={aGravar} onClick={() => void gravar()}>
            {aGravar && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {t("hr.assiduidade.realizado.corrigirAccao")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
