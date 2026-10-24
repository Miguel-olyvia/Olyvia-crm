/**
 * Banco de horas: os limites configuraveis da organizacao (acrescimo maximo por dia e por semana, saldo maximo,
 * saldo negativo ate um minimo, periodo de referencia, aviso antes de caducar). O SALDO e os movimentos nao
 * estao aqui (sao de outra frente): so se mostra o tipo e os limites.
 */
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/hooks/useTranslation";
import type { ConfigHorario, LimitesBanco } from "@/components/rh-exemplo/lib/horarioTipos";

interface Props {
  config: ConfigHorario;
  onChange: (config: ConfigHorario) => void;
  idPrefixo: string;
  disabled?: boolean;
}

const CAMPOS: Array<{ chave: keyof LimitesBanco; rotulo: string; passo: number }> = [
  { chave: "acrescimoDia", rotulo: "rhExemplo.hor.banco.acrescimoDia", passo: 0.5 },
  { chave: "acrescimoSemana", rotulo: "rhExemplo.hor.banco.acrescimoSemana", passo: 0.5 },
  { chave: "saldoMaximo", rotulo: "rhExemplo.hor.banco.saldoMaximo", passo: 1 },
  { chave: "saldoMinimo", rotulo: "rhExemplo.hor.banco.saldoMinimo", passo: 1 },
  { chave: "mesesReferencia", rotulo: "rhExemplo.hor.banco.mesesReferencia", passo: 1 },
  { chave: "avisoDiasAntes", rotulo: "rhExemplo.hor.banco.avisoDiasAntes", passo: 1 },
];

export function EditorBancoLimites({ config, onChange, idPrefixo, disabled }: Props) {
  const { t } = useTranslation();
  const mudar = (chave: keyof LimitesBanco, valor: number) => onChange({ ...config, banco: { ...config.banco, [chave]: valor } });
  return (
    <fieldset className="space-y-3 rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">{t("rhExemplo.hor.banco.titulo")}</legend>
      <p className="text-sm text-muted-foreground">{t("rhExemplo.hor.banco.ajuda")}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {CAMPOS.map(({ chave, rotulo, passo }) => {
          const valor = config.banco[chave];
          return (
            <div key={chave} className="space-y-1.5">
              <Label htmlFor={`${idPrefixo}-banco-${chave}`}>{t(rotulo)}</Label>
              <Input
                id={`${idPrefixo}-banco-${chave}`}
                type="number"
                step={passo}
                className="min-h-11"
                disabled={disabled}
                value={Number.isFinite(valor) ? valor : ""}
                onChange={(e) => mudar(chave, e.target.value === "" ? Number.NaN : Number(e.target.value))}
              />
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
