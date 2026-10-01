import { useState } from "react";
import { Button, Field, Modal, Textarea, cx } from "./ui";
import { AlertTriangle } from "./icons";
import {
  MOTIVOS_DESVIO,
  ROTULO_MOTIVO,
  formatarMinutos,
  validarJustificacao,
  type MotivoDesvio,
} from "../domain/obras";

/**
 * A folha de justificação, ao dar uma tarefa por feita.
 *
 * Obrigatória quando o real passou o previsto mais a tolerância ("senão não
 * há controlo"). Tem de ser rápida no telemóvel: uma lista de motivos em
 * botões grandes, e texto só se for "Outro".
 */
export default function ObraJustificacao({
  reais,
  previstos,
  tolerancia,
  obrigatoria,
  aGravar,
  erro,
  aoCancelar,
  aoConfirmar,
}: {
  reais: number;
  previstos: number;
  tolerancia: number;
  obrigatoria: boolean;
  aGravar: boolean;
  erro: string | null;
  aoCancelar: () => void;
  aoConfirmar: (motivo: MotivoDesvio | null, nota: string) => void;
}) {
  const [motivo, setMotivo] = useState<MotivoDesvio | "">("");
  const [nota, setNota] = useState("");
  const [tentou, setTentou] = useState(false);
  const problema = validarJustificacao({ motivo, nota }, obrigatoria);

  return (
    <Modal
      title={obrigatoria ? "Porque demorou mais?" : "Dar a tarefa por feita"}
      onClose={aoCancelar}
      footer={
        <>
          <Button variant="secondary" onClick={aoCancelar}>
            Voltar
          </Button>
          <Button
            onClick={() => {
              setTentou(true);
              if (!problema) aoConfirmar(motivo || null, nota.trim());
            }}
            disabled={aGravar}
            className="min-w-[8rem]"
          >
            {aGravar ? "A gravar…" : "Confirmar feita"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div
          className={cx(
            "flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm",
            obrigatoria ? "bg-red-50 text-red-800" : "bg-slate-50 text-slate-700"
          )}
        >
          {obrigatoria && <AlertTriangle width={16} height={16} className="mt-0.5 shrink-0" />}
          <p>
            <b className="font-mono tabular">{formatarMinutos(reais)}</b> reais para{" "}
            <b className="font-mono tabular">{formatarMinutos(previstos)}</b> previstos.
            {obrigatoria
              ? ` Passou a tolerância de ${tolerancia} %: a justificação é obrigatória.`
              : " Se houve alguma condicionante, regista-a — ajuda a acertar o previsto."}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {MOTIVOS_DESVIO.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMotivo(motivo === m ? "" : m)}
              aria-pressed={motivo === m}
              className={cx(
                "min-h-[52px] rounded-xl px-3 py-2 text-left text-sm font-medium ring-1 ring-inset transition-colors",
                motivo === m
                  ? "bg-brand text-white ring-brand"
                  : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
              )}
            >
              {ROTULO_MOTIVO[m]}
            </button>
          ))}
        </div>

        <Field label={motivo === "outro" ? "Nota (obrigatória)" : "Nota (opcional)"}>
          <Textarea
            rows={2}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Ex.: parede ainda húmida, esperou-se pela secagem"
            className="w-full"
          />
        </Field>

        {((tentou && problema) || erro) && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro ?? problema}</p>
        )}
      </div>
    </Modal>
  );
}
