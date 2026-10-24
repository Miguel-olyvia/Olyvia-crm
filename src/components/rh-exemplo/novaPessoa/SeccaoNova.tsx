// Uma secção do painel "Nova pessoa": título, linha fina por cima (a secção das fichas) e, quando faz sentido, o interruptor
// "Pedir à pessoa no convite" (os campos da secção deixam de se exigir aqui e ficam para a pessoa preencher).
import type { ReactNode } from "react";
import { Seccao } from "@/components/ficha-comum/Seccao";
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "@/hooks/useTranslation";
import { useNova } from "./contextoNova";
import type { SeccaoConvite } from "./ids";

interface SeccaoNovaProps {
  titulo: string;
  /** Com valor, a secção tem o interruptor "Pedir à pessoa no convite". */
  convite?: SeccaoConvite;
  children: ReactNode;
}

function PedirNoConvite({ seccao }: { seccao: SeccaoConvite }) {
  const { t } = useTranslation();
  const { valores, alterar } = useNova();
  const id = `rh-nova-convite-${seccao}`;
  const ligado = valores.extra.noConvite[seccao] === true;
  return (
    <label htmlFor={id} className="ml-auto flex min-h-11 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
      <span>{t("rhNova.pedirConvite")}</span>
      <Switch
        id={id} checked={ligado}
        onCheckedChange={(v) => alterar("extra", { noConvite: { ...valores.extra.noConvite, [seccao]: v } })}
      />
    </label>
  );
}

export function SeccaoNova({ titulo, convite, children }: SeccaoNovaProps) {
  return (
    <Seccao titulo={titulo} marca={convite ? <PedirNoConvite seccao={convite} /> : undefined} className="space-y-1">
      {children}
    </Seccao>
  );
}
