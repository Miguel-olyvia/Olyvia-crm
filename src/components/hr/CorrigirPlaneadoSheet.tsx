/**
 * Corrigir um intervalo de horario PLANEADO cuja janela ja decorreu.
 *
 * MESMO PADRAO DE CorrigirRealizadoSheet
 * ---------------------------------------
 * A correccao e um LANCAMENTO NOVO: entra uma linha que aponta a errada
 * (`corrige_horario_id`), e a antiga fica visivel no historico, esbatida,
 * nunca apagada. Nao ha "editar" e o painel diz isso, para ninguem esperar
 * que o valor antigo desapareca.
 *
 * SO PARA O PASSADO
 * ------------------
 * Isto so aparece em linhas cuja janela JA DECORREU
 * (`linhaPlaneadaDecorrida`) -- alterar o horario em vigor ou futuro e
 * `savePlaneado` (o editor normal), botao e permissao diferentes de
 * proposito: quem so devia poder mudar "a partir de hoje" nao deve poder
 * reescrever o passado por ser menos cliques.
 *
 * O motivo e obrigatorio -- `rpc_hr_planeado_corrigir` responde
 * `planeado_correccao_sem_motivo` a um texto vazio. Pedi-lo aqui e so evitar
 * que a pessoa descubra a regra por um toast depois de escrever as horas.
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { CampoSelect, CampoTexto, CamposTocadosProvider } from "@/components/hr/form/Campos";
import { minutosEntre } from "@/lib/hr/assiduidade";
import type { LocalTrabalho } from "@/types/hr";

interface CorrigirPlaneadoSheetProps {
  aberto: boolean;
  horarioId: string;
  horaInicioActual: string | null;
  horaFimActual: string | null;
  localActual: string | null;
  naoTrabalhaActual: boolean;
  locais: LocalTrabalho[];
  aGravar: boolean;
  onFechar: () => void;
  onCorrigir: (args: {
    horarioId: string;
    horaInicio: string | null;
    horaFim: string | null;
    localId: string | null;
    naoTrabalha: boolean;
    motivo: string;
  }) => Promise<string | null>;
  idPrefixo?: string;
}

export function CorrigirPlaneadoSheet({
  aberto,
  horarioId,
  horaInicioActual,
  horaFimActual,
  localActual,
  naoTrabalhaActual,
  locais,
  aGravar,
  onFechar,
  onCorrigir,
  idPrefixo = "hr-planeado",
}: CorrigirPlaneadoSheetProps) {
  const { t } = useTranslation();
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [localId, setLocalId] = useState("");
  const [naoTrabalha, setNaoTrabalha] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [tocados, setTocados] = useState<ReadonlySet<string>>(() => new Set());
  const [mostrarTodos, setMostrarTodos] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setInicio((horaInicioActual ?? "").slice(0, 5));
    setFim((horaFimActual ?? "").slice(0, 5));
    setLocalId(localActual ?? "");
    setNaoTrabalha(naoTrabalhaActual);
    setMotivo("");
    setTocados(new Set());
    setMostrarTodos(false);
  }, [aberto, horaInicioActual, horaFimActual, localActual, naoTrabalhaActual]);

  const tocar = (campoId: string) =>
    setTocados((anteriores) =>
      anteriores.has(campoId) ? anteriores : new Set(anteriores).add(campoId),
    );

  const minutos = naoTrabalha ? null : minutosEntre(inicio, fim);

  const problemas = useMemo(() => {
    const lista: { campo: string; mensagemKey: string }[] = [];
    if (!naoTrabalha) {
      if (!inicio) lista.push({ campo: "inicio", mensagemKey: "hr.assiduidade.erro.semHoraInicio" });
      if (!fim) lista.push({ campo: "fim", mensagemKey: "hr.assiduidade.erro.semHoraFim" });
      if (minutos !== null && minutos <= 0) {
        lista.push({ campo: "fim", mensagemKey: "hr.assiduidade.erro.fimAntesDoInicio" });
      }
    }
    if (motivo.trim() === "") {
      lista.push({ campo: "motivo", mensagemKey: "hr.assiduidade.erro.semMotivoEscrito" });
    }
    return lista;
  }, [naoTrabalha, inicio, fim, minutos, motivo]);

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
      horarioId,
      horaInicio: naoTrabalha ? null : inicio,
      horaFim: naoTrabalha ? null : fim,
      localId: naoTrabalha ? null : localId || null,
      naoTrabalha,
      motivo: motivo.trim(),
    });
    if (erro) {
      toast.error(t(erro));
      return;
    }
    toast.success(t("hr.horario.planeado.corrigido"));
    onFechar();
  };

  return (
    <Sheet open={aberto} onOpenChange={(estado) => !estado && onFechar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t("hr.horario.planeado.corrigirTitulo")}</SheetTitle>
          <SheetDescription>{t("hr.horario.planeado.corrigirExplicacao")}</SheetDescription>
        </SheetHeader>

        <CamposTocadosProvider onTocar={tocar}>
          <div className="mt-6 space-y-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id={`${idPrefixo}-nao-trabalha`}
                checked={naoTrabalha}
                onCheckedChange={(marcado) => setNaoTrabalha(marcado === true)}
              />
              <Label htmlFor={`${idPrefixo}-nao-trabalha`} className="font-normal">
                {t("hr.horario.naoTrabalha")}
              </Label>
            </div>

            {!naoTrabalha && (
              <>
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

                <CampoSelect
                  id={idLocal}
                  label={t("hr.assiduidade.campo.local")}
                  valor={localId}
                  vazioLabel={t("hr.horario.localPredefinido")}
                  onChange={setLocalId}
                  opcoes={locais.map((local) => ({ value: local.id, label: local.nome }))}
                />
              </>
            )}

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
            {t("hr.horario.planeado.corrigirAccao")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
