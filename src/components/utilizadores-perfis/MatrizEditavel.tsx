// A matriz de permissões do formulário de role: a MESMA árvore da ficha (todas as permissões que quem edita vê, por módulo),
// mas editável. Conceder uma permissão perigosa (uma a uma ou num "Marcar tudo") pede confirmação.
import { useMemo, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { ArvorePermissoes } from "./ArvorePermissoes";
import { ConfirmarAcao } from "./ConfirmarAcao";
import type { EdicaoMatriz } from "./LinhaPermissaoEditavel";
import { alternarPermissao, definirModulo, perigosasNovas, podeAlterar } from "./matriz";
import type { Permissao } from "./tipos";

interface MatrizEditavelProps {
  /** As permissões que quem edita pode ver e alterar. */
  visiveis: Permissao[];
  concedidas: string[];
  aoMudar: (concedidas: string[]) => void;
  /** Role de sistema: só se vê. */
  somenteLeitura: boolean;
}

/** Uma alteração à espera de confirmação: o que se concederia e quais as perigosas. */
interface Pendente {
  seguintes: string[];
  perigosas: Permissao[];
}

export function MatrizEditavel({ visiveis, concedidas, aoMudar, somenteLeitura }: MatrizEditavelProps) {
  const { t } = useTranslation();
  const [pendente, setPendente] = useState<Pendente | null>(null);
  const tem = useMemo(() => new Set(concedidas), [concedidas]);

  const aplicar = (seguintes: string[], concedidos: Permissao[]) => {
    const perigosas = perigosasNovas(concedidas, concedidos);
    if (perigosas.length > 0) setPendente({ seguintes, perigosas });
    else aoMudar(seguintes);
  };

  const edicao: EdicaoMatriz = {
    desativada: somenteLeitura,
    bloqueada: (codigo) => !podeAlterar(codigo, concedidas, visiveis),
    aoAlternar: (p) => aplicar(alternarPermissao(concedidas, p.codigo, visiveis), tem.has(p.codigo) ? [] : [p]),
    aoModulo: (lista, marcar) => aplicar(definirModulo(concedidas, lista, marcar), marcar ? lista : []),
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t(somenteLeitura ? "usersProfiles.form.matrix.readOnly" : "usersProfiles.form.matrix.intro")}</p>
      <ArvorePermissoes permissoes={visiveis} concedida={(codigo) => tem.has(codigo)} edicao={edicao} />
      <ConfirmarAcao
        aberto={pendente !== null}
        titulo={t("usersProfiles.form.danger.title")}
        texto={t("usersProfiles.form.danger.text", { names: pendente?.perigosas.map((p) => p.nome).join(", ") ?? "" })}
        confirmar={t("usersProfiles.form.danger.confirm")}
        recusar={t("usersProfiles.form.danger.cancel")}
        aoConfirmar={() => { if (pendente) aoMudar(pendente.seguintes); setPendente(null); }}
        aoCancelar={() => setPendente(null)}
      />
    </div>
  );
}
