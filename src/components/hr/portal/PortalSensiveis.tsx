/**
 * Guardar o NISS ou o IBAN: a unica escrita que a V3a deixa fazer no portal (accao `sensiveis`, que
 * os grava cifrados no cofre). Fica JUNTO do campo do formulario do convite onde a pessoa escreve o
 * valor (`aposCampo` de `ConvitePagina1` e `ConvitePagina2`): o campo e o do convite que ja existia, e
 * isto e so o botao que o guarda e o que ele diz.
 *
 *  - o valor completo nunca fica em nenhum estado depois de guardado: o formulario limpa o campo
 *    (`aoGuardado`) e o que se mostra, na saudacao do convite, sao os 4 ultimos algarismos;
 *  - o formato (digito de controlo do NISS, mod-97 do IBAN) confere-se aqui antes de chamar a Edge; o
 *    erro de formato diz-o o proprio campo (aria-invalid, ligado ao texto), e o foco vai para la;
 *  - em processo devolvido so se mexe no que o RH devolveu (a base recusa o resto com
 *    `campo_bloqueado`): o botao fica inactivo, como o campo.
 */
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";
import type { ResultadoSensiveis } from "@/hooks/useConviteAdmissaoPublico";
import { mensagemErroPortal } from "@/lib/hr/portalAdmissao";

export type CampoSensivel = "niss" | "iban";

interface PortalSensivelProps {
  campo: CampoSensivel;
  /** O que a pessoa escreveu no campo do formulario (o NISS, ou o IBAN como esta no ecra). */
  valor: string;
  /** O formato do que escreveu esta errado (o campo ja diz porque). */
  formatoInvalido: boolean;
  editavel: boolean;
  /** Leva o foco ao campo e mostra-lhe o erro de formato. */
  aoInvalido: () => void;
  aoGravar: (valores: { niss?: string; iban?: string }) => Promise<ResultadoSensiveis>;
  /** Gravou: o formulario limpa o campo. */
  aoGuardado: () => void;
}

/** O IBAN vai sem espacos e em maiusculas, como no convite antigo (`construirPayloadConvite`). */
const paraEnviar = (campo: CampoSensivel, valor: string): string =>
  campo === "iban" ? valor.trim().replace(/\s+/g, "").toUpperCase() : valor.trim();

export function PortalSensivel({ campo, valor, formatoInvalido, editavel, aoInvalido, aoGravar, aoGuardado }: PortalSensivelProps) {
  const { t } = useTranslation();
  const [aGuardar, setAGuardar] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const eNiss = campo === "niss";

  const guardar = async () => {
    if (aGuardar) return;
    setGuardado(false);
    setErro(null);
    const enviar = paraEnviar(campo, valor);
    if (enviar === "") {
      setErro(t("portal.sensiveis.nadaPreenchido"));
      return;
    }
    if (formatoInvalido) {
      aoInvalido();
      return;
    }
    setAGuardar(true);
    const resultado = await aoGravar(eNiss ? { niss: enviar } : { iban: enviar });
    setAGuardar(false);
    if (resultado.ok) {
      aoGuardado();
      setGuardado(true);
      return;
    }
    setErro(mensagemErroPortal(t, resultado.codigo ?? "erro_inesperado"));
  };

  return (
    <div className="space-y-1.5">
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        disabled={!editavel}
        aria-disabled={aGuardar || undefined}
        onClick={() => void guardar()}
      >
        {aGuardar && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {aGuardar ? t("portal.sensiveis.aGuardar") : t(eNiss ? "portal.sensiveis.guardarNiss" : "portal.sensiveis.guardarIban")}
      </Button>
      {/* Regiao sempre presente: so assim o leitor de ecra anuncia o texto que aparece. */}
      <p role="status" className="text-sm font-medium">
        {guardado ? t(eNiss ? "portal.sensiveis.okNiss" : "portal.sensiveis.okIban") : null}
      </p>
      {erro && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {erro}
        </p>
      )}
    </div>
  );
}
