/**
 * Dois gestos parecidos que NAO sao o mesmo, no mesmo painel e bem separados.
 *
 * LANCAR (`modo="lancar"`) e registar uma picagem que nunca chegou a existir:
 * a saida que ficou por picar ontem, o dia em que o quiosque estava em baixo.
 * Vai por `rpc_hr_picar` com o momento no passado e origem `manual_rh`, e
 * exige `hr.assiduidade.picar.outros` quando e na ficha de outra pessoa.
 *
 * CORRIGIR (`modo="corrigir"`) e outra coisa: existe uma picagem, esta errada,
 * e entra uma linha NOVA que a substitui. A original fica no registo para
 * sempre. Exige `hr.assiduidade.corrigir`, tem tipo de correccao e motivo
 * OBRIGATORIO.
 *
 * A LACUNA QUE FICA A VISTA
 * -------------------------
 * `rpc_hr_picar` NAO tem campo de motivo. Um lancamento manual fica com autor,
 * origem e instante, e sem uma linha escrita a dizer porque -- ao contrario de
 * uma correccao. Nao se inventa aqui um campo que a base deita fora: em vez
 * disso, o painel diz em texto que o lancamento fica em nome de quem o faz, e
 * a lista mostra sempre a origem e o autor. Exigir motivo seria migration.
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { CamposTocadosProvider, CampoSelect, CampoTexto } from "@/components/hr/form/Campos";
import { horaCurta } from "@/lib/hr/assiduidade";
import { TIPOS_CORRECCAO_PICAGEM } from "@/types/hrAssiduidade";
import type {
  Picagem,
  SentidoPicagem,
  TipoCorreccaoPicagem,
} from "@/types/hrAssiduidade";
import type { LocalTrabalho } from "@/types/hr";

const SEM_LOCAL = "";

interface PicagemSheetProps {
  aberto: boolean;
  modo: "lancar" | "corrigir";
  /** A picagem a corrigir. Ignorada no modo lancar. */
  picagem?: Picagem | null;
  /** O dia sobre o qual se lanca, no modo lancar. */
  data: string;
  locais: LocalTrabalho[];
  aGravar: boolean;
  onFechar: () => void;
  onLancar: (args: {
    momento: string;
    sentido: SentidoPicagem;
    localId: string | null;
  }) => Promise<string | null>;
  onCorrigir: (args: {
    picagemId: string;
    momento: string;
    sentido: SentidoPicagem;
    localId: string | null;
    tipo: TipoCorreccaoPicagem;
    motivo: string;
  }) => Promise<string | null>;
  idPrefixo?: string;
}

export function PicagemSheet({
  aberto,
  modo,
  picagem,
  data,
  locais,
  aGravar,
  onFechar,
  onLancar,
  onCorrigir,
  idPrefixo = "hr-picagem",
}: PicagemSheetProps) {
  const { t } = useTranslation();

  const [dia, setDia] = useState(data);
  const [hora, setHora] = useState("");
  const [sentido, setSentido] = useState<SentidoPicagem>("entrada");
  const [localId, setLocalId] = useState<string>(SEM_LOCAL);
  const [tipo, setTipo] = useState<TipoCorreccaoPicagem | "">("");
  const [motivo, setMotivo] = useState("");
  const [tocados, setTocados] = useState<ReadonlySet<string>>(() => new Set());
  const [mostrarTodos, setMostrarTodos] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setDia(picagem?.data_local ?? data);
    setHora(horaCurta(picagem?.hora_local) === "—" ? "" : horaCurta(picagem?.hora_local));
    setSentido(picagem?.sentido ?? "entrada");
    setLocalId(picagem?.local_id ?? SEM_LOCAL);
    setTipo("");
    setMotivo("");
    setTocados(new Set());
    setMostrarTodos(false);
  }, [aberto, picagem, data]);

  const tocar = (campoId: string) =>
    setTocados((anteriores) =>
      anteriores.has(campoId) ? anteriores : new Set(anteriores).add(campoId),
    );

  const corrigir = modo === "corrigir";

  const problemas = useMemo(() => {
    const lista: { campo: string; mensagemKey: string }[] = [];
    if (!dia) lista.push({ campo: "dia", mensagemKey: "hr.assiduidade.erro.semData" });
    if (!hora) lista.push({ campo: "hora", mensagemKey: "hr.assiduidade.erro.semHora" });
    if (corrigir && !tipo) {
      lista.push({ campo: "tipo", mensagemKey: "hr.assiduidade.erro.semTipoCorreccao" });
    }
    if (corrigir && motivo.trim() === "") {
      lista.push({ campo: "motivo", mensagemKey: "hr.assiduidade.erro.semMotivoEscrito" });
    }
    return lista;
  }, [dia, hora, tipo, motivo, corrigir]);

  const idDia = `${idPrefixo}-dia`;
  const idHora = `${idPrefixo}-hora`;
  const idSentido = `${idPrefixo}-sentido`;
  const idLocal = `${idPrefixo}-local`;
  const idTipo = `${idPrefixo}-tipo`;
  const idMotivo = `${idPrefixo}-motivo`;

  const erroDe = (campo: string, id: string) => {
    const problema = problemas.find((p) => p.campo === campo);
    if (!problema) return null;
    // O erro de formato so aparece depois de o campo ser tocado -- ou na
    // submissao, que liga todos de uma vez.
    if (!mostrarTodos && !tocados.has(id)) return null;
    return t(problema.mensagemKey);
  };

  const gravar = async () => {
    if (problemas.length > 0) {
      setMostrarTodos(true);
      toast.error(t(problemas[0].mensagemKey));
      return;
    }
    // O momento e uma marca temporal completa: a base data-a no fuso da
    // organizacao e e ela que grava `data_local` e `hora_local`.
    const momento = new Date(`${dia}T${hora}:00`).toISOString();
    const local = localId === SEM_LOCAL ? null : localId;

    const erro = corrigir
      ? await onCorrigir({
          picagemId: picagem?.id ?? "",
          momento,
          sentido,
          localId: local,
          tipo: tipo as TipoCorreccaoPicagem,
          motivo: motivo.trim(),
        })
      : await onLancar({ momento, sentido, localId: local });

    if (erro) {
      toast.error(t(erro));
      return;
    }
    toast.success(
      t(corrigir ? "hr.assiduidade.picagem.corrigida" : "hr.assiduidade.picagem.lancada"),
    );
    onFechar();
  };

  return (
    <Sheet open={aberto} onOpenChange={(estado) => !estado && onFechar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            {t(corrigir ? "hr.assiduidade.picagem.corrigirTitulo" : "hr.assiduidade.picagem.lancarTitulo")}
          </SheetTitle>
          <SheetDescription>
            {t(
              corrigir
                ? "hr.assiduidade.picagem.corrigirExplicacao"
                : "hr.assiduidade.picagem.lancarExplicacao",
            )}
          </SheetDescription>
        </SheetHeader>

        <CamposTocadosProvider onTocar={tocar}>
          <div className="mt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <CampoTexto
                id={idDia}
                label={t("hr.assiduidade.campo.data")}
                tipo="date"
                valor={dia}
                erro={erroDe("dia", idDia)}
                onChange={setDia}
              />
              <CampoTexto
                id={idHora}
                label={t("hr.assiduidade.campo.hora")}
                tipo="time"
                valor={hora}
                erro={erroDe("hora", idHora)}
                onChange={setHora}
              />
            </div>

            <CampoSelect
              id={idSentido}
              label={t("hr.assiduidade.campo.sentido")}
              valor={sentido}
              onChange={(valor) => setSentido(valor as SentidoPicagem)}
              opcoes={[
                { value: "entrada", label: t("hr.assiduidade.sentido.entrada") },
                { value: "saida", label: t("hr.assiduidade.sentido.saida") },
              ]}
            />

            <CampoSelect
              id={idLocal}
              label={t("hr.assiduidade.campo.local")}
              valor={localId}
              onChange={setLocalId}
              vazioLabel={t("hr.assiduidade.semLocal")}
              opcoes={locais.map((local) => ({ value: local.id, label: local.nome }))}
            />

            {corrigir && (
              <>
                <CampoSelect
                  id={idTipo}
                  label={t("hr.assiduidade.campo.tipoCorreccao")}
                  valor={tipo}
                  erro={erroDe("tipo", idTipo)}
                  onChange={(valor) => setTipo(valor as TipoCorreccaoPicagem)}
                  placeholder={t("hr.assiduidade.campo.escolher")}
                  opcoes={TIPOS_CORRECCAO_PICAGEM.map((codigo) => ({
                    value: codigo,
                    label: t(`hr.assiduidade.tipoCorreccao.${codigo}`),
                  }))}
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
              </>
            )}

            {!corrigir && (
              <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                {t("hr.assiduidade.picagem.avisoSemMotivo")}
              </p>
            )}
          </div>
        </CamposTocadosProvider>

        <SheetFooter className="mt-6 gap-2">
          <Button variant="ghost" disabled={aGravar} onClick={onFechar}>
            {t("common.cancel")}
          </Button>
          <Button disabled={aGravar} onClick={() => void gravar()}>
            {aGravar && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            {t(corrigir ? "hr.assiduidade.picagem.corrigirAccao" : "hr.assiduidade.picagem.lancarAccao")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
