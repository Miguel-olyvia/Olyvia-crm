// A ficha devolvida pelo RH, na página pública: a pessoa vê os comentários e só edita os campos devolvidos (o resto fica como
// estava e não se mostra para editar). Guarda rascunho e volta a submeter dentro do prazo, que o RH renovou a 7 dias.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { gravarRascunhoDoLink, submeterPeloLink } from "@/components/rh-exemplo/dados/accoesAdmissao";
import { camposEditaveis, type Admissao } from "@/components/rh-exemplo/lib/admissaoFluxo";
import { codigoDoRotulo } from "@/components/rh-exemplo/admissao/dadosSubmetidos";
import { rotuloDeCampoAdmissao } from "@/components/rh-exemplo/rotuloCampoAdmissao";
import { useTranslation } from "@/hooks/useTranslation";
import { ConviteFaixaPrazo } from "./ConviteFaixaPrazo";

interface ConviteDevolvidaProps {
  token: string | undefined;
  admissao: Admissao;
  nome: string | null;
}

/** O que a pessoa já corrigiu e guardou, por cima do que tinha submetido. */
function valoresIniciais(adm: Admissao, campos: string[]): Record<string, string> {
  const guardadas = (adm.rascunho.correcoes ?? {}) as Record<string, unknown>;
  return Object.fromEntries(campos.map((c) => [c, String(guardadas[c] ?? adm.dadosSubmetidos[c] ?? "")]));
}

interface CampoDevolvidoProps {
  campo: string;
  comentario: string;
  valor: string;
  aoMudar: (campo: string, valor: string) => void;
}

function CampoDevolvido({ campo, comentario, valor, aoMudar }: CampoDevolvidoProps) {
  const { t } = useTranslation();
  const rotulo = rotuloDeCampoAdmissao(t, codigoDoRotulo(campo));
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`convite-corrigir-${campo}`}>{rotulo}</Label>
      <p id={`convite-comentario-${campo}`} className="rounded-md border-l-4 border-orange-500 bg-orange-500/5 px-3 py-1.5 text-sm">
        <span className="font-medium">{t("rhAdm.pub.devolvida.comentario")}:</span> {comentario}
      </p>
      <Input
        id={`convite-corrigir-${campo}`} className="h-11" value={valor}
        aria-describedby={`convite-comentario-${campo}`} onChange={(e) => aoMudar(campo, e.target.value)}
      />
    </div>
  );
}

export function ConviteDevolvida({ token, admissao, nome }: ConviteDevolvidaProps) {
  const { t } = useTranslation();
  const campos = camposEditaveis(admissao) ?? [];
  const [valores, setValores] = useState<Record<string, string>>(() => valoresIniciais(admissao, campos));
  const [erro, setErro] = useState<string | null>(null);

  const mudar = (campo: string, valor: string) => {
    setValores((v) => ({ ...v, [campo]: valor }));
    setErro(null);
  };
  const guardar = () => gravarRascunhoDoLink(token, { ...admissao.rascunho, correcoes: valores });
  const submeter = () => {
    if (campos.some((c) => (valores[c] ?? "").trim() === "")) return setErro(t("rhAdm.pub.devolvida.vazio"));
    const r = submeterPeloLink(token, valores);
    if (!r.ok) setErro(t(`rhAdm.erro.${r.erro}`));
  };

  return (
    <div className="space-y-4">
      <ConviteFaixaPrazo admissao={admissao} comRascunho />
      <Card>
        <CardHeader>
          <h2 className="text-2xl font-semibold leading-none tracking-tight">{t("rhAdm.pub.devolvida.titulo")}</h2>
          <CardDescription>{nome ? `${t("hr.convite.saudacao", { nome })} ` : ""}{t("rhAdm.pub.devolvida.texto")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {campos.map((campo) => (
            <CampoDevolvido key={campo} campo={campo} comentario={admissao.comentarios[campo]} valor={valores[campo] ?? ""} aoMudar={mudar} />
          ))}
          {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
          <div className="flex flex-wrap justify-between gap-2">
            <Button type="button" variant="ghost" className="min-h-11" onClick={guardar}>{t("rhAdm.pub.devolvida.guardar")}</Button>
            <Button type="button" className="min-h-11" onClick={submeter}>{t("rhAdm.pub.devolvida.submeter")}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
