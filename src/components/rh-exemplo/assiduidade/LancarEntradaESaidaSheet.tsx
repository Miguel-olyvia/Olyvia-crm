/**
 * Lancar a ENTRADA e a SAIDA de uma vez, a partir de um desvio da fila (turno planeado sem horas, ou so parcialmente picado).
 *
 * Usa as mesmas pecas do `PicagemSheet` (a gaveta, os campos, o aviso de que o lancamento fica em nome de quem o faz) sem o
 * alterar: o `PicagemSheet` continua a ser UMA picagem, aqui sao duas. A base so tem `rpc_hr_picar` (uma picagem de cada
 * vez), por isso grava-se a entrada e depois a saida, pela mesma `picar` (origem `manual_rh`). Valida-se tudo ANTES de gravar.
 *
 * Se a saida falhar depois de a entrada ter gravado, diz-se («A entrada foi gravada; a saida nao»), bloqueia-se o que ja
 * esta gravado e o botao passa a lancar SO a saida: a entrada nunca se grava duas vezes.
 */
import { useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { CamposTocadosProvider, CampoSelect, CampoTexto } from "@/components/rh-exemplo/form/Campos";
import { momentosDoPar, saidaPrecisaDeDiaSeguinte } from "@/components/rh-exemplo/lib/picagemPar";
import type { SentidoPicagem } from "@/components/rh-exemplo/tiposAssiduidade";
import type { LocalTrabalho } from "@/components/rh-exemplo/tipos";

const SEM_LOCAL = "";

interface LancarEntradaESaidaSheetProps {
  aberto: boolean;
  /** O dia da entrada. */
  data: string;
  /** HH:MM com que o formulario abre, por exemplo o bloco planeado do desvio. */
  horaEntradaInicial?: string;
  horaSaidaInicial?: string;
  locais: LocalTrabalho[];
  aGravar: boolean;
  onFechar: () => void;
  /** Uma picagem (a `picar` do hook, origem `manual_rh`). Devolve o erro, ou `null` se gravou. */
  onPicar: (args: { sentido: SentidoPicagem; momento: string; localId: string | null }) => Promise<string | null>;
  /** Depois de a base gravar alguma coisa: a fila e o mapa relêem. */
  onAlterado: () => void;
  idPrefixo?: string;
}

export function LancarEntradaESaidaSheet({
  aberto,
  data,
  horaEntradaInicial,
  horaSaidaInicial,
  locais,
  aGravar,
  onFechar,
  onPicar,
  onAlterado,
  idPrefixo = "rhb-desvio-par",
}: LancarEntradaESaidaSheetProps) {
  const { t } = useTranslation();
  const [dia, setDia] = useState(data);
  const [horaEntrada, setHoraEntrada] = useState(horaEntradaInicial ?? "");
  const [horaSaida, setHoraSaida] = useState(horaSaidaInicial ?? "");
  const [saidaNoDiaSeguinte, setSaidaNoDiaSeguinte] = useState(false);
  const [localId, setLocalId] = useState(SEM_LOCAL);
  const [entradaGravada, setEntradaGravada] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [aOcupar, setAOcupar] = useState(false);
  // Trava SINCRONA: o estado so se actualiza no render seguinte, e um duplo clique (ou Enter repetido) entra duas vezes antes disso.
  const aGravarRef = useRef(false);

  useEffect(() => {
    if (!aberto) return;
    setDia(data);
    setHoraEntrada(horaEntradaInicial ?? "");
    setHoraSaida(horaSaidaInicial ?? "");
    setSaidaNoDiaSeguinte(false);
    setLocalId(SEM_LOCAL);
    setEntradaGravada(false);
    setAviso(null);
  }, [aberto, data, horaEntradaInicial, horaSaidaInicial]);

  const precisaDeDiaSeguinte = saidaPrecisaDeDiaSeguinte(horaEntrada, horaSaida);
  const ocupado = aGravar || aOcupar;

  const gravar = async () => {
    if (aGravarRef.current) return;
    const momentos = momentosDoPar({ dia, horaEntrada, horaSaida, saidaNoDiaSeguinte });
    if (!momentos.ok) {
      setAviso(`${t("rhExemplo.pic.par.problema")} ${t(momentos.erro)}`);
      return;
    }
    setAviso(null);
    aGravarRef.current = true;
    setAOcupar(true);
    try {
      const local = localId === SEM_LOCAL ? null : localId;
      if (!entradaGravada) {
        const erroEntrada = await onPicar({ sentido: "entrada", momento: momentos.valor.entrada, localId: local });
        if (erroEntrada) {
          toast.error(t(erroEntrada));
          setAviso(`${t("rhExemplo.pic.par.problema")} ${t(erroEntrada)}`);
          return;
        }
        setEntradaGravada(true);
      }
      const erroSaida = await onPicar({ sentido: "saida", momento: momentos.valor.saida, localId: local });
      if (erroSaida) {
        // A entrada ja esta na base: a fila relê e o RH fica a saber exactamente o que falta.
        onAlterado();
        setAviso(t("rhExemplo.pic.par.entradaGravada", { motivo: t(erroSaida) }));
        return;
      }
      toast.success(t(entradaGravada ? "rhExemplo.pic.par.okSaida" : "rhExemplo.pic.par.ok"));
      onAlterado();
      onFechar();
    } finally {
      aGravarRef.current = false;
      setAOcupar(false);
    }
  };

  const idDia = `${idPrefixo}-dia`;
  const idEntrada = `${idPrefixo}-entrada`;
  const idSaida = `${idPrefixo}-saida`;
  const idLocal = `${idPrefixo}-local`;
  const idDiaSeguinte = `${idPrefixo}-diaseguinte`;

  return (
    <Sheet open={aberto} onOpenChange={(estado) => !estado && !ocupado && onFechar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t("rhExemplo.pic.par.titulo")}</SheetTitle>
          <SheetDescription>{t("rhExemplo.pic.par.explicacao")}</SheetDescription>
        </SheetHeader>

        <CamposTocadosProvider onTocar={() => undefined}>
          <div className="mt-6 space-y-4">
            <CampoTexto id={idDia} label={t("hr.assiduidade.campo.data")} tipo="date" valor={dia} disabled={entradaGravada} onChange={setDia} />
            <div className="grid gap-4 sm:grid-cols-2">
              <CampoTexto
                id={idEntrada}
                label={t("rhExemplo.pic.par.entrada")}
                tipo="time"
                valor={horaEntrada}
                disabled={entradaGravada}
                onChange={setHoraEntrada}
              />
              <CampoTexto id={idSaida} label={t("rhExemplo.pic.par.saida")} tipo="time" valor={horaSaida} onChange={setHoraSaida} />
            </div>

            {precisaDeDiaSeguinte && (
              <div className="flex min-h-11 items-start gap-3 rounded-md border p-3">
                <input
                  id={idDiaSeguinte}
                  type="checkbox"
                  className="mt-0.5 h-5 w-5 shrink-0"
                  checked={saidaNoDiaSeguinte}
                  aria-describedby={`${idDiaSeguinte}-ajuda`}
                  onChange={(evento) => setSaidaNoDiaSeguinte(evento.target.checked)}
                />
                <div className="space-y-0.5">
                  <label htmlFor={idDiaSeguinte} className="text-sm font-medium">
                    {t("rhExemplo.pic.par.diaSeguinte")}
                  </label>
                  <p id={`${idDiaSeguinte}-ajuda`} className="text-xs text-muted-foreground">
                    {t("rhExemplo.pic.par.diaSeguinteAjuda")}
                  </p>
                </div>
              </div>
            )}

            <CampoSelect
              id={idLocal}
              label={t("hr.assiduidade.campo.local")}
              valor={localId}
              disabled={entradaGravada}
              onChange={setLocalId}
              vazioLabel={t("hr.assiduidade.semLocal")}
              opcoes={locais.map((local) => ({ value: local.id, label: local.nome }))}
            />

            {aviso && (
              // Texto (e icone), nao so cor; `role="alert"` anuncia-o ao leitor de ecra.
              <p role="alert" className="flex items-start gap-2 rounded-md border border-destructive p-3 text-sm text-destructive">
                <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{aviso}</span>
              </p>
            )}

            <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">{t("hr.assiduidade.picagem.avisoSemMotivo")}</p>
          </div>
        </CamposTocadosProvider>

        <SheetFooter className="mt-6 gap-2">
          <Button variant="ghost" className="min-h-11" disabled={ocupado} onClick={onFechar}>
            {t("common.cancel")}
          </Button>
          <Button className="min-h-11" disabled={ocupado} onClick={() => void gravar()}>
            {ocupado && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {t(entradaGravada ? "rhExemplo.pic.par.accaoSaida" : "rhExemplo.pic.par.accao")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
