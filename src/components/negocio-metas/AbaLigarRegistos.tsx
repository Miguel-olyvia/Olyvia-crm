// A aba «Registos» do painel «Novo negócio»: «Ligar registos» (caixas de seleção dos contactos e visitas por ligar da pessoa) e a escolha do
// levantamento (usar um que já existe, fazer um novo, ou dispensar). Nada se copia: o negócio liga registos que já existem, e cada registo
// só se liga a um negócio. É um componente controlado: quem o usa guarda a escolha (`LigarRegistos`) e lê os registos por ligar do store.
import { useId } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { FOCO } from "./estilos";
import type { EscolhaLevantamento, LigarRegistos } from "./ligarNegocio";
import { formatarData } from "./negocioPainel";
import { N } from "./PecasNovoNegocio";
import type { RefRegisto, RegistosDaPessoa } from "./registosTipos";

const L = `${N}link.`;

interface Props {
  /** A base dos ids dos campos. */
  id: string;
  /** Já há uma pessoa escolhida (na aba Geral)? Sem ela, não há registos a mostrar. */
  pessoaEscolhida: boolean;
  /** Os registos da pessoa que ainda não estão ligados a nenhum negócio. */
  porLigar: RegistosDaPessoa;
  valor: LigarRegistos;
  aoMudar: (valor: LigarRegistos) => void;
}

const mesmaRef = (a: RefRegisto, b: RefRegisto): boolean => a.tipo === b.tipo && a.id === b.id;

const CAIXA = cn("mt-0.5 h-5 w-5 shrink-0 rounded-sm border-input accent-primary", FOCO);

function Linha({ id, marcado, texto, aoAlternar }: { id: string; marcado: boolean; texto: string; aoAlternar: () => void }) {
  return (
    <li className="flex min-h-11 items-start gap-3 py-2">
      <input id={id} type="checkbox" checked={marcado} onChange={aoAlternar} className={CAIXA} />
      <label htmlFor={id} className="cursor-pointer text-sm text-foreground">{texto}</label>
    </li>
  );
}

/** A lista de chamadas e a de visitas, cada registo com a sua caixa. */
function ListasDeRegistos({ id, porLigar, valor, aoMudar }: Omit<Props, "pessoaEscolhida">) {
  const { t } = useTranslation();
  const alternar = (ref: RefRegisto) => {
    const marcado = valor.registos.some((r) => mesmaRef(r, ref));
    aoMudar({ ...valor, registos: marcado ? valor.registos.filter((r) => !mesmaRef(r, ref)) : [...valor.registos, ref] });
  };
  const marcado = (ref: RefRegisto) => valor.registos.some((r) => mesmaRef(r, ref));
  return (
    <>
      {porLigar.contactos.length > 0 && (
        <fieldset className="space-y-1">
          <legend className="text-sm font-semibold text-foreground">{t(`${L}calls`)}</legend>
          <ul role="list" className="list-none p-0">
            {porLigar.contactos.map((c) => (
              <Linha
                key={c.id} id={`${id}-c-${c.id}`} marcado={marcado({ tipo: "contacto", id: c.id })} aoAlternar={() => alternar({ tipo: "contacto", id: c.id })}
                texto={t(`${L}call`, { date: formatarData(c.data), result: t(`${L}result.${c.resultado}`) })}
              />
            ))}
          </ul>
        </fieldset>
      )}
      {porLigar.visitas.length > 0 && (
        <fieldset className="space-y-1">
          <legend className="text-sm font-semibold text-foreground">{t(`${L}visits`)}</legend>
          <ul role="list" className="list-none p-0">
            {porLigar.visitas.map((v) => (
              <Linha
                key={v.id} id={`${id}-v-${v.id}`} marcado={marcado({ tipo: "visita", id: v.id })} aoAlternar={() => alternar({ tipo: "visita", id: v.id })}
                texto={t(`${L}visit`, {
                  date: formatarData(v.data), time: v.hora ? t(`${L}visit.time`, { time: v.hora }) : "", state: t(`${L}visitState.${v.estado}`),
                })}
              />
            ))}
          </ul>
        </fieldset>
      )}
    </>
  );
}

function Opcao({ nome, id, marcada, desativada, texto, dica, aoEscolher }: {
  nome: string; id: string; marcada: boolean; desativada?: boolean; texto: string; dica?: string; aoEscolher: () => void;
}) {
  return (
    <div className="flex min-h-11 items-start gap-3 py-1.5">
      <input id={id} type="radio" name={nome} checked={marcada} disabled={desativada} onChange={aoEscolher} aria-describedby={dica ? `${id}-dica` : undefined} className={CAIXA} />
      <div className="space-y-0.5">
        <label htmlFor={id} className={cn("text-sm text-foreground", desativada ? "cursor-not-allowed opacity-70" : "cursor-pointer")}>{texto}</label>
        {dica && <p id={`${id}-dica`} className="text-sm text-muted-foreground">{dica}</p>}
      </div>
    </div>
  );
}

/** O levantamento: usar um existente (e qual), fazer um novo ou dispensar. É opcional. */
function EscolhaDoLevantamento({ id, porLigar, valor, aoMudar }: Omit<Props, "pessoaEscolhida">) {
  const { t } = useTranslation();
  const nome = useId();
  const legenda = useId();
  const lista = useId();
  const existentes = [...porLigar.levantamentos].sort((a, b) => b.data.localeCompare(a.data));
  const escolha = valor.levantamento;
  const escolher = (l: EscolhaLevantamento) => aoMudar({ ...valor, levantamento: l });
  const maisRecente = existentes[0];
  return (
    <div role="radiogroup" aria-labelledby={legenda} className="space-y-1">
      <p id={legenda} className="text-sm font-semibold text-foreground">{t(`${L}survey.legend`)}</p>
      <p className="text-sm text-muted-foreground">{t(`${L}survey.optional`)}</p>
      <Opcao
        nome={nome} id={`${id}-lev-existente`} marcada={escolha.tipo === "existente"} desativada={!maisRecente} texto={t(`${L}survey.existing`)}
        dica={maisRecente ? undefined : t(`${L}survey.existingNone`)}
        aoEscolher={() => maisRecente && escolher({ tipo: "existente", id: maisRecente.id })}
      />
      {escolha.tipo === "existente" && (
        <div role="radiogroup" aria-label={t(`${L}survey.list`)} id={lista} className="ml-8 space-y-0.5">
          {existentes.map((l) => (
            <Opcao
              key={l.id} nome={`${nome}-lista`} id={`${id}-lev-${l.id}`} marcada={escolha.id === l.id} aoEscolher={() => escolher({ tipo: "existente", id: l.id })}
              texto={t(`${L}survey.item`, { date: formatarData(l.data), who: l.feitoPor })}
            />
          ))}
        </div>
      )}
      <Opcao
        nome={nome} id={`${id}-lev-novo`} marcada={escolha.tipo === "novo"} texto={t(`${L}survey.new`)}
        dica={escolha.tipo === "novo" ? t(`${L}survey.newHint`) : undefined} aoEscolher={() => escolher({ tipo: "novo" })}
      />
      <Opcao
        nome={nome} id={`${id}-lev-dispensar`} marcada={escolha.tipo === "dispensar"} texto={t(`${L}survey.skip`)}
        dica={escolha.tipo === "dispensar" ? t(`${L}survey.skipHint`) : undefined} aoEscolher={() => escolher({ tipo: "dispensar" })}
      />
    </div>
  );
}

export function AbaLigarRegistos({ id, pessoaEscolhida, porLigar, valor, aoMudar }: Props) {
  const { t } = useTranslation();
  const haRegistos = porLigar.contactos.length + porLigar.visitas.length > 0;
  return (
    <div className="space-y-5">
      <section aria-labelledby={`${id}-ligar-titulo`} className="space-y-3">
        <h3 id={`${id}-ligar-titulo`} className="text-base font-semibold text-foreground">{t(`${L}title`)}</h3>
        <p className="text-sm text-muted-foreground">{t(`${L}hint`)}</p>
        {!pessoaEscolhida && <p className="text-sm text-foreground">{t(`${L}pickPerson`)}</p>}
        {pessoaEscolhida && !haRegistos && <p className="text-sm text-foreground">{t(`${L}none`)}</p>}
        {pessoaEscolhida && haRegistos && <ListasDeRegistos id={id} porLigar={porLigar} valor={valor} aoMudar={aoMudar} />}
      </section>
      {pessoaEscolhida && <EscolhaDoLevantamento id={id} porLigar={porLigar} valor={valor} aoMudar={aoMudar} />}
    </div>
  );
}
