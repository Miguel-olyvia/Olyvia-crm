// O painel de filtros de Pessoas: Ordenar, os selects (período, origem, canal, formulário, comercial, distrito, qualificação, último contacto,
// pessoa ou empresa, estado, etapa e motivo da perda) e os interruptores. Tudo se aplica à lista e ao dashboard.
import { ORDENS, type Ordem, type SeparadorLista } from "./pessoasDocs";
import { ETAPAS_PESSOA } from "./listaDocs";
import { chipsAtivos, efetivos, opcoesDe, type FiltrosP, type LinhaP } from "./filtrosPessoas";
import { CHIP, Escolher, FiltrosPopover, Interruptor } from "./FiltrosPopover";

export interface FiltrosProps {
  linhas: readonly LinhaP[];
  aba: SeparadorLista;
  f: FiltrosP;
  setF: (v: Partial<FiltrosP>) => void;
  ordem: Ordem;
  setOrdem: (v: Ordem) => void;
  leitura: boolean;
}

const PERIODOS = [{ valor: "7", nome: "Últimos 7 dias" }, { valor: "30", nome: "Últimos 30 dias" }, { valor: "90", nome: "Últimos 90 dias" }];
const QUALIFICACOES = [{ valor: "MQL", nome: "MQL" }, { valor: "SQL", nome: "SQL" }, { valor: "qualificada", nome: "MQL ou SQL" }, { valor: "sem", nome: "Sem qualificação" }];
const TIPOS = [{ valor: "pessoa", nome: "Pessoa" }, { valor: "empresa", nome: "Empresa" }];
const ESTADOS = [{ valor: "ativas", nome: "Ativas" }, { valor: "perdidas", nome: "Perdidas" }];
const ETAPAS = [1, 2, 3, 4].map((i) => ({ valor: String(i), nome: ETAPAS_PESSOA[i] }));

/** Os selects, numa grelha de duas colunas. Os que não se aplicam aos clientes (estado perdidas e motivo) saem nesse separador. */
function Selects({ linhas, aba, f, setF }: Pick<FiltrosProps, "linhas" | "aba" | "f" | "setF">) {
  const o = opcoesDe(linhas), tudo = (t: string) => `Todos os ${t}`;
  return (
    <>
      <Escolher rotulo="Período de criação" valor={f.periodo} aoMudar={(v) => setF({ periodo: v as FiltrosP["periodo"] })} todas="Tudo" opcoes={PERIODOS} />
      <Escolher rotulo="Origem" valor={f.origem} aoMudar={(v) => setF({ origem: v })} todas="Todas as origens" opcoes={o.origem} />
      <Escolher rotulo="Canal" valor={f.canal} aoMudar={(v) => setF({ canal: v })} todas="Todos os canais" opcoes={o.canal} />
      <Escolher rotulo="Formulário" valor={f.formulario} aoMudar={(v) => setF({ formulario: v })} todas={tudo("formulários")} opcoes={o.formulario} />
      <Escolher rotulo="Comercial" valor={f.comercial} aoMudar={(v) => setF({ comercial: v })} todas={tudo("comerciais")} opcoes={o.comercial} />
      <Escolher rotulo="Distrito" valor={f.distrito} aoMudar={(v) => setF({ distrito: v })} todas={tudo("distritos")} opcoes={o.distrito} />
      <Escolher rotulo="Qualificação" valor={f.qualificacao} aoMudar={(v) => setF({ qualificacao: v as FiltrosP["qualificacao"] })} todas="Todas" opcoes={QUALIFICACOES} />
      <Escolher rotulo="Resultado do último contacto" valor={f.resultado} aoMudar={(v) => setF({ resultado: v })} todas="Todos" opcoes={o.resultado} />
      <Escolher rotulo="Pessoa ou empresa" valor={f.tipo} aoMudar={(v) => setF({ tipo: v as FiltrosP["tipo"] })} todas="Pessoas e empresas" opcoes={TIPOS} />
      <Escolher rotulo="Estado" valor={f.estado} aoMudar={(v) => setF({ estado: v as FiltrosP["estado"] })} todas="Todos" opcoes={aba === "clientes" ? ESTADOS.slice(0, 1) : ESTADOS} />
      <Escolher rotulo="Já chegou a" valor={f.etapa} aoMudar={(v) => setF({ etapa: v as FiltrosP["etapa"] })} todas="Qualquer etapa" opcoes={ETAPAS} />
      {aba !== "clientes" && <Escolher rotulo="Motivo da perda" valor={f.motivo} aoMudar={(v) => setF({ motivo: v })} todas="Todos" opcoes={o.motivo} />}
    </>
  );
}

/** O botão Filtros e o painel. */
export function PessoasFiltros({ linhas, aba, f, setF, ordem, setOrdem, leitura }: FiltrosProps) {
  const ef = efetivos(aba, f);
  const ativos = chipsAtivos(ef).filter((c) => c.id !== "q").length + Number(ordem !== "urgencia");
  const alternar = (k: "voltou" | "visita" | "atrasadas" | "novoNegocio" | "soMinhas") => setF({ [k]: !f[k] });
  return (
    <FiltrosPopover ativos={ativos} leitura={leitura}>
      <div role="group" aria-label="Ordenar" className="sm:col-span-2">
        <p className="text-[15px] text-muted-foreground">Ordenar</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {ORDENS.map((o) => <button key={o.id} type="button" aria-pressed={ordem === o.id} onClick={() => setOrdem(o.id)} className={CHIP(ordem === o.id)}>{o.nome}</button>)}
        </div>
      </div>
      <Selects linhas={linhas} aba={aba} f={f} setF={setF} />
      <div role="group" aria-label="Mostrar só" className="flex flex-wrap gap-2 sm:col-span-2">
        {aba !== "clientes" && <Interruptor nome="Voltou a contactar" ativo={f.voltou} aoMudar={() => alternar("voltou")} />}
        {aba !== "clientes" && <Interruptor nome="Com visita" ativo={f.visita} aoMudar={() => alternar("visita")} />}
        <Interruptor nome="Atrasadas" ativo={f.atrasadas} aoMudar={() => alternar("atrasadas")} />
        {aba !== "leads" && <Interruptor nome="Com negócio novo em curso" ativo={f.novoNegocio} aoMudar={() => alternar("novoNegocio")} />}
        <Interruptor nome="Só as minhas" ativo={f.soMinhas} aoMudar={() => alternar("soMinhas")} />
      </div>
    </FiltrosPopover>
  );
}
