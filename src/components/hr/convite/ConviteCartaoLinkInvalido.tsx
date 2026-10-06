/**
 * O cartao que substitui o formulario quando o link do convite ja nao serve.
 * Diz PORQUE: usado, substituido por um mais recente, expirado, bloqueado ou
 * inexistente -- cada motivo pede uma acao diferente a quem o abre. Excepcao:
 * "demasiadas tentativas" nao e culpa do link, e nao manda pedir outro.
 */
import { Card, CardDescription, CardHeader } from "@/components/ui/card";
import type { MotivoConvite, TraduzirFn } from "@/lib/hr/errosAdmissao";

interface ConviteCartaoLinkInvalidoProps {
  t: TraduzirFn;
  motivo: MotivoConvite;
}

export function ConviteCartaoLinkInvalido({ t, motivo }: ConviteCartaoLinkInvalidoProps) {
  const titulo =
    motivo === "demasiadasTentativas"
      ? t("hr.convite.demasiadasTentativasTitulo")
      : t("hr.convite.tokenInvalidoTitulo");
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          {/* Titulo de nivel 1: a pagina nao tem outro e o leitor de ecra tem de o anunciar. */}
          <h1 className="text-2xl font-semibold leading-none tracking-tight">{titulo}</h1>
          <CardDescription>{t(`hr.convite.motivo.${motivo}`)}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
