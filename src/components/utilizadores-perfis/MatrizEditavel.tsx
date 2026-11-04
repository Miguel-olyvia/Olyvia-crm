// A matriz de permissões do formulário de role: a MESMA árvore da ficha (todas as permissões que quem edita vê, por módulo),
// mas editável, em grelha recurso × ação. Conceder uma permissão perigosa (uma a uma, numa linha/coluna ou num "Marcar tudo") pede
// confirmação. Um aviso discreto (região viva) diz o que a regra de "Ver" fez: dependentes retiradas, células que ficaram por marcar,
// ou o clique numa célula bloqueada.
import { useMemo, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { ArvorePermissoes } from "./ArvorePermissoes";
import { ConfirmarAcao } from "./ConfirmarAcao";
import type { EdicaoMatriz } from "./GrelhaRecursoAcao";
import { alternarPermissao, definirConjunto, definirModulo, perigosasNovas, podeAlterar } from "./matriz";
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
  const [aviso, setAviso] = useState("");
  const tem = useMemo(() => new Set(concedidas), [concedidas]);
  const nomes = (codigos: string[]) => codigos.map((c) => visiveis.find((p) => p.codigo === c)?.nome ?? c).join(", ");
  /** As que estavam concedidas e saem sem terem sido pedidas (a regra de "Ver" arrastou-as). */
  const arrastadas = (seguintes: string[], pedidas: string[]) => concedidas.filter((c) => !seguintes.includes(c) && !pedidas.includes(c));

  const aplicar = (seguintes: string[], concedidos: Permissao[]) => {
    const perigosas = perigosasNovas(concedidas, concedidos);
    if (perigosas.length > 0) setPendente({ seguintes, perigosas });
    else aoMudar(seguintes);
  };

  const edicao: EdicaoMatriz = {
    desativada: somenteLeitura,
    bloqueada: (codigo) => !podeAlterar(codigo, concedidas, visiveis),
    aoAlternar: (p) => {
      if (somenteLeitura) return;
      if (!podeAlterar(p.codigo, concedidas, visiveis)) {
        setAviso(`${p.nome}: ${t("usersProfiles.form.matrix.needsView")}`);
        return;
      }
      const seguintes = alternarPermissao(concedidas, p.codigo, visiveis);
      const retiradas = arrastadas(seguintes, [p.codigo]);
      setAviso(retiradas.length > 0 ? t("usersProfiles.form.matrix.grid.removed", { names: nomes(retiradas) }) : "");
      aplicar(seguintes, tem.has(p.codigo) ? [] : [p]);
    },
    aoModulo: (lista, marcar) => {
      setAviso("");
      aplicar(definirModulo(concedidas, lista, marcar), marcar ? lista : []);
    },
    aoConjunto: (lista, marcar) => {
      if (somenteLeitura) return;
      const seguintes = definirConjunto(concedidas, lista, marcar, visiveis);
      const novas = lista.filter((p) => !tem.has(p.codigo) && seguintes.includes(p.codigo));
      const porMarcar = marcar ? lista.filter((p) => !seguintes.includes(p.codigo)).map((p) => p.codigo) : [];
      const retiradas = marcar ? [] : arrastadas(seguintes, lista.map((p) => p.codigo));
      setAviso(
        porMarcar.length > 0 ? t("usersProfiles.form.matrix.grid.skipped", { names: nomes(porMarcar) })
          : retiradas.length > 0 ? t("usersProfiles.form.matrix.grid.removed", { names: nomes(retiradas) }) : "",
      );
      aplicar(seguintes, novas);
    },
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t(somenteLeitura ? "usersProfiles.form.matrix.readOnly" : "usersProfiles.form.matrix.intro")}</p>
      <ArvorePermissoes permissoes={visiveis} concedida={(codigo) => tem.has(codigo)} edicao={edicao} />
      {/* Aviso discreto da regra de "Ver": fica colado ao fundo do painel enquanto se rola a grelha. */}
      <p
        role="status" aria-live="polite" data-testid="aviso-matriz"
        className={cn("sticky bottom-0 z-20 text-sm text-muted-foreground", aviso && "rounded-md border border-border bg-background/95 px-3 py-2 shadow-sm")}
      >
        {aviso}
      </p>
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
