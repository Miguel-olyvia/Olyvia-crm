// O painel lateral de uma denúncia identificada da própria pessoa: o estado, os prazos e a conversa com o responsável do
// canal, onde ela responde e anexa. Sem notas internas, sem gravidade e sem gestão: isso é só do responsável do canal.
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useTranslation } from "@/hooks/useTranslation";
import { VistaAcompanhamento } from "../acompanhar/VistaAcompanhamento";
import { useDenuncia } from "../dados/loja";

interface PainelMinhaDenunciaProps {
  id: string | null;
  onFechar: () => void;
}

export function PainelMinhaDenuncia({ id, onFechar }: PainelMinhaDenunciaProps) {
  const { t } = useTranslation();
  const d = useDenuncia(id);
  return (
    <Sheet open={d !== undefined} onOpenChange={(aberto) => !aberto && onFechar()}>
      <SheetContent className="w-full space-y-4 overflow-y-auto sm:w-1/2 sm:max-w-none">
        {d && (
          <>
            <SheetHeader className="space-y-1 text-left">
              <SheetTitle className="font-mono">{d.codigo}</SheetTitle>
              <SheetDescription className="break-words">{d.resumo}</SheetDescription>
            </SheetHeader>
            <p role="note" className="text-xs text-muted-foreground">{t("cdm.identificadas.painelNota")}</p>
            <VistaAcompanhamento key={d.id} id={d.id} semCabecalho />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
