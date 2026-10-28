// O painel lateral de uma denúncia identificada da própria pessoa: o estado, os prazos e a conversa com o responsável do
// canal, onde ela responde e anexa. Sem notas internas, sem gravidade e sem gestão: isso é só do responsável do canal.
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useTranslation } from "@/hooks/useTranslation";
import { VistaAcompanhamento } from "../acompanhar/VistaAcompanhamento";
import { AvisoLeitura } from "../comum/AvisoLeitura";
import { useFonte } from "../dados/fonte";

interface PainelMinhaDenunciaProps {
  id: string | null;
  onFechar: () => void;
}

export function PainelMinhaDenuncia({ id, onFechar }: PainelMinhaDenunciaProps) {
  const { t } = useTranslation();
  const leitura = useFonte().useDenuncia(id, "denunciante");
  const d = leitura.dados;
  return (
    <Sheet open={id !== null} onOpenChange={(aberto) => !aberto && onFechar()}>
      <SheetContent className="w-full space-y-4 overflow-y-auto sm:w-1/2 sm:max-w-none">
        {d ? (
          <>
            <SheetHeader className="space-y-1 text-left">
              <SheetTitle className="font-mono">{d.codigo}</SheetTitle>
              <SheetDescription className="break-words">{d.resumo}</SheetDescription>
            </SheetHeader>
            <p role="note" className="text-xs text-muted-foreground">{t("cdm.identificadas.painelNota")}</p>
            <VistaAcompanhamento key={d.id} id={d.id} semCabecalho />
          </>
        ) : (
          <>
            <SheetHeader className="text-left">
              <SheetTitle className="sr-only">{t("cdm.minhas.titulo")}</SheetTitle>
              <SheetDescription className="sr-only">{t("cd.leitura.carregando")}</SheetDescription>
            </SheetHeader>
            {leitura.estado === "ok"
              ? <p role="status" className="text-sm text-muted-foreground">{t("cd.leitura.naoEncontrada")}</p>
              : <AvisoLeitura estado={leitura.estado} onTentar={leitura.recarregar} />}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
