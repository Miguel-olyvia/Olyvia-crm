/**
 * Picar exige localizacao (fluxo 5). Na apresentacao nunca se pede ao navegador: a pessoa escolhe «Estou no
 * local» ou «Estou fora do local» e o ecra mostra a distancia de exemplo. Mais de 200 m do local marca
 * «fora do local» (grava na mesma, e o RH ve-o no alerta do fim do dia).
 */
import { useTranslation } from "@/hooks/useTranslation";
import {
  DISTANCIA_DE_EXEMPLO,
  LIMITE_FORA_DO_LOCAL_METROS,
  foraDoLocal,
  type EscolhaLocalizacao,
} from "@/components/rh-exemplo/lib/picagemLocal";

interface EscolhaDeLocalizacaoProps {
  valor: EscolhaLocalizacao | null;
  onChange: (valor: EscolhaLocalizacao) => void;
  idPrefixo: string;
}

const OPCOES: EscolhaLocalizacao[] = ["no_local", "fora_do_local"];

export function EscolhaDeLocalizacao({ valor, onChange, idPrefixo }: EscolhaDeLocalizacaoProps) {
  const { t } = useTranslation();
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{t("rhExemplo.pic.ondeEstou")}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {OPCOES.map((opcao) => (
          <label
            key={opcao}
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2"
          >
            <input
              type="radio"
              name={`${idPrefixo}-onde`}
              className="h-5 w-5 accent-primary"
              checked={valor === opcao}
              onChange={() => onChange(opcao)}
            />
            {t(`rhExemplo.pic.${opcao}`)}
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t("rhExemplo.pic.ajudaExemplo", { limite: String(LIMITE_FORA_DO_LOCAL_METROS) })}</p>
      {valor && (
        <p className="text-sm font-medium tabular-nums" aria-live="polite">
          {foraDoLocal(DISTANCIA_DE_EXEMPLO[valor])
            ? t("rhExemplo.pic.distanciaFora", { metros: String(DISTANCIA_DE_EXEMPLO[valor]), limite: String(LIMITE_FORA_DO_LOCAL_METROS) })
            : t("rhExemplo.pic.distanciaDentro", { metros: String(DISTANCIA_DE_EXEMPLO[valor]) })}
        </p>
      )}
    </fieldset>
  );
}
