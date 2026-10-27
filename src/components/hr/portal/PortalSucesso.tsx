/**
 * O ecra que se mostra depois de submeter: os dados chegaram e ficam a aguardar o RH; o link fica fechado.
 * Titulo de nivel 1 com o foco (e a unica coisa desta vista e o leitor de ecra tem de a anunciar). Vive
 * dentro da moldura do portal; recarregar a pagina mostra o cartao de portal encerrado.
 */
import { useEffect, useRef } from "react";
import { CheckCircle2 } from "lucide-react";
import { Card, CardDescription, CardHeader } from "@/components/ui/card";
import { useTranslation } from "@/hooks/useTranslation";

export function PortalSucesso() {
  const { t } = useTranslation();
  const tituloRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    tituloRef.current?.focus();
  }, []);
  return (
    <Card data-testid="portal-sucesso">
      <CardHeader className="items-center text-center">
        <CheckCircle2 className="h-10 w-10 text-primary" aria-hidden="true" />
        <h1 ref={tituloRef} tabIndex={-1} className="text-2xl font-semibold leading-none tracking-tight outline-none">
          {t("portal.sucesso.titulo")}
        </h1>
        <CardDescription role="status">{t("portal.sucesso.texto")}</CardDescription>
      </CardHeader>
    </Card>
  );
}
