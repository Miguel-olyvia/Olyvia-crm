// A aba "Dados" do formulário de utilizador: os campos que o ecrã atual (/users) pede (nome, email, telefone, posição,
// palavra-passe). Sem filial nem local de trabalho: o utilizador da plataforma não é a pessoa do RH. A morada (estruturada
// na base), o NIF e o modelo guardam-se e reenviam-se ao gravar, mas não se editam aqui. O estado muda-se na ficha.
import { useState } from "react";
import { Eye, EyeOff, Lock, Wand2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FOCO } from "@/components/negocio-metas/estilos";
import { AJUDA_CAMPO, ErroCampo, RotuloCampo } from "./CampoForm";
import type { ValoresFormUtilizador } from "./utilizadorForm";
import type { ErrosUtilizador } from "./validacoes";

const CAMPO = (invalido: boolean) => cn("min-h-11", FOCO, invalido && "border-destructive");

interface AbaDadosUtilizadorProps {
  id: string;
  valores: ValoresFormUtilizador;
  erros: ErrosUtilizador;
  criar: boolean;
  /** Super administrador: tudo só de leitura. */
  bloqueado: boolean;
  aoMudar: (parcial: Partial<ValoresFormUtilizador>) => void;
  aoGerar: () => void;
}

interface CampoTextoProps {
  id: string;
  campo: keyof ErrosUtilizador;
  texto: string;
  valor: string;
  erro: string | undefined;
  tipo?: string;
  obrigatorio?: boolean;
  somenteLeitura: boolean;
  foco?: boolean;
  autoComplete?: string;
  aoMudar: (v: string) => void;
}

function CampoTexto({ id, campo, texto, valor, erro, tipo = "text", obrigatorio, somenteLeitura, foco, autoComplete, aoMudar }: CampoTextoProps) {
  return (
    <div className="space-y-1.5">
      <RotuloCampo para={`${id}-${campo}`} texto={texto} obrigatorio={obrigatorio} />
      <Input
        id={`${id}-${campo}`} type={tipo} value={valor} readOnly={somenteLeitura} autoComplete={autoComplete}
        data-foco-inicial={foco ? "" : undefined} aria-required={obrigatorio ? "true" : undefined}
        aria-invalid={erro ? true : undefined} aria-describedby={erro ? `${id}-${campo}-erro` : undefined}
        className={CAMPO(!!erro)} onChange={(e) => aoMudar(e.target.value)}
      />
      <ErroCampo id={`${id}-${campo}-erro`} campo={campo} codigo={erro} />
    </div>
  );
}

function CampoPalavraPasse({ id, valores, erro, criar, bloqueado, aoMudar, aoGerar }: Omit<AbaDadosUtilizadorProps, "erros"> & { erro?: string }) {
  const { t } = useTranslation();
  const [visivel, setVisivel] = useState(false);
  const Icone = visivel ? EyeOff : Eye;
  const ajuda = t(criar ? "usersProfiles.form.user.password.hintCreate" : "usersProfiles.form.user.password.hintEdit");
  return (
    <div className="space-y-1.5 rounded-md border bg-muted/30 p-4">
      <RotuloCampo para={`${id}-palavraPasse`} texto={t("usersProfiles.form.user.password")} obrigatorio={criar} />
      <div className="flex gap-2">
        <Input
          id={`${id}-palavraPasse`} type={visivel ? "text" : "password"} value={valores.palavraPasse} readOnly={bloqueado}
          autoComplete="new-password" aria-required={criar ? "true" : undefined} aria-invalid={erro ? true : undefined}
          aria-describedby={[`${id}-palavraPasse-ajuda`, erro ? `${id}-palavraPasse-erro` : ""].filter(Boolean).join(" ")}
          className={cn(CAMPO(!!erro), "flex-1")} onChange={(e) => aoMudar({ palavraPasse: e.target.value })}
        />
        <Button
          type="button" variant="outline" size="icon" className={cn("h-11 w-11 shrink-0", FOCO)} aria-pressed={visivel}
          aria-label={t(visivel ? "usersProfiles.form.user.password.hide" : "usersProfiles.form.user.password.show")}
          onClick={() => setVisivel(!visivel)}
        >
          <Icone className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button type="button" variant="outline" className={cn("min-h-11 shrink-0", FOCO)} disabled={bloqueado} onClick={() => { aoGerar(); setVisivel(true); }}>
          <Wand2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {t("usersProfiles.form.user.password.generate")}
        </Button>
      </div>
      <p id={`${id}-palavraPasse-ajuda`} className={AJUDA_CAMPO}>{ajuda}</p>
      <ErroCampo id={`${id}-palavraPasse-erro`} campo="palavraPasse" codigo={erro} />
    </div>
  );
}

export function AbaDadosUtilizador(p: AbaDadosUtilizadorProps) {
  const { t } = useTranslation();
  const { id, valores, erros, bloqueado, aoMudar } = p;
  const campo = (c: keyof ErrosUtilizador, texto: string, extra: Partial<CampoTextoProps> = {}) => (
    <CampoTexto
      id={id} campo={c} texto={texto} erro={erros[c]} somenteLeitura={bloqueado} valor={String(valores[c as keyof ValoresFormUtilizador] ?? "")}
      aoMudar={(v) => aoMudar({ [c]: v })} {...extra}
    />
  );
  return (
    <div className="space-y-5">
      {bloqueado && (
        <p className="flex items-center gap-2 rounded-md border bg-muted/40 p-3 text-sm text-foreground">
          <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t("usersProfiles.protectedNote")}
        </p>
      )}
      <p className={AJUDA_CAMPO}>{t("usersProfiles.form.user.platformNote")}</p>
      {campo("nome", t("usersProfiles.form.user.name"), { obrigatorio: true, foco: true })}
      {campo("email", t("usersProfiles.form.user.email"), { obrigatorio: true, tipo: "email", autoComplete: "off" })}
      {campo("telefone", t("usersProfiles.form.user.phone"), { tipo: "tel" })}
      <div className="space-y-1.5">
        <RotuloCampo para={`${id}-posicao`} texto={t("usersProfiles.form.user.position")} />
        <Input id={`${id}-posicao`} value={valores.posicao} readOnly={bloqueado} className={CAMPO(false)} onChange={(e) => aoMudar({ posicao: e.target.value })} />
      </div>
      <CampoPalavraPasse {...p} erro={erros.palavraPasse} />
    </div>
  );
}
