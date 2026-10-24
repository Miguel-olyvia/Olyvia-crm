// A barra de abas sublinhadas da assiduidade, com contador só onde há coisas por tratar. Setas, Home e End vêm do Radix.
import { Aba, ListaAbas } from "@/components/ficha-comum/AbasSublinhadas";
import { useTranslation } from "@/hooks/useTranslation";
import { CHAVE_ROTULO, type AbaAssiduidade } from "./abas";
import type { ContadoresAssiduidade } from "./useContadoresAssiduidade";

interface Props {
  visiveis: readonly AbaAssiduidade[];
  contadores: ContadoresAssiduidade;
}

export function ListaAbasAssiduidade({ visiveis, contadores }: Props) {
  const { t } = useTranslation();
  const numero: Partial<Record<AbaAssiduidade, number>> = {
    ...(contadores.horasExtra > 0 ? { "horas-extra": contadores.horasExtra } : {}),
    ...(contadores.justificacoes > 0 ? { justificacoes: contadores.justificacoes } : {}),
  };
  const leitor: Partial<Record<AbaAssiduidade, string>> = {
    "horas-extra": t("rhAbas.ass.contadorHorasExtra", { n: numero["horas-extra"] ?? 0 }),
    justificacoes: t("rhAbas.ass.contadorJustificacoes", { n: numero.justificacoes ?? 0 }),
  };
  return (
    <ListaAbas aria-label={t("rhAbas.ass.label")}>
      {visiveis.map((aba) => (
        <Aba key={aba} value={aba} rotulo={t(CHAVE_ROTULO[aba])} contador={numero[aba]} contadorLeitor={leitor[aba]} />
      ))}
    </ListaAbas>
  );
}
