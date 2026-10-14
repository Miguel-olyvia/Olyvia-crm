// As sete abas sublinhadas da ficha de RH, fixas por baixo do cabeçalho, com contadores onde dizem alguma coisa:
// contratos, documentos e ausências por decidir (esta só quando há alguma).
import { Aba, ListaAbas } from "@/components/ficha-comum/AbasSublinhadas";
import { useTranslation } from "@/hooks/useTranslation";
import { ABAS_FICHA, type AbaFicha } from "./abas";
import type { ContadoresFicha } from "./contadores";

export function ListaAbasFicha({ contadores }: { contadores: ContadoresFicha }) {
  const { t } = useTranslation();
  const numero: Partial<Record<AbaFicha, number>> = {
    contratos: contadores.contratos,
    documentos: contadores.documentos,
    ...(contadores.ausenciasPorDecidir > 0 ? { ausencias: contadores.ausenciasPorDecidir } : {}),
  };
  return (
    <ListaAbas aria-label={t("rhForm.ficha.tabs.label")} className="shrink-0 px-6">
      {ABAS_FICHA.map((aba) => (
        <Aba
          key={aba} value={aba} rotulo={t(`hr.pessoa.tabs.${aba}`)} contador={numero[aba]}
          contadorLeitor={t("rhForm.ficha.tabs.contador", { n: numero[aba] ?? 0 })}
        />
      ))}
    </ListaAbas>
  );
}
