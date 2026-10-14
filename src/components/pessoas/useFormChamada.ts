// O estado do formulário "Registar chamada": o que se escolheu, os erros (só depois de tentar guardar) e os dados prontos
// para `registarChamada`. Os valores de partida: amanhã, às 10:00, e a morada da pessoa como local da visita.
import { useMemo, useState } from "react";
import { somarDias, type DadosChamada } from "./acoesPessoa";
import {
  errosChamada, passoPorDefeito, passosDisponiveis, temErros, type ContextoChamada, type ErrosChamada,
} from "./chamadaPassos";
import { textoMorada } from "./formatoPessoas";
import { passoAtual } from "./etapaPessoa";
import type { MotivoPerda, PassoChamada, ResultadoContacto, ResumoPessoa } from "./pessoasTipos";

export const HORA_POR_DEFEITO = "10:00";

export interface CamposChamada {
  resultado: ResultadoContacto | null;
  nota: string;
  passo: PassoChamada;
  data: string;
  hora: string;
  onde: string;
  motivo: MotivoPerda | "";
}

const SEM_ERROS: ErrosChamada = { data: null, hora: null, motivo: null };

const inicial = (resumo: ResumoPessoa, hoje: string): CamposChamada => ({
  resultado: null, nota: "", passo: "nenhum", data: somarDias(hoje, 1), hora: HORA_POR_DEFEITO,
  onde: resumo.pessoa.morada ? textoMorada(resumo.pessoa.morada) : "", motivo: "",
});

/** Os dados para `registarChamada`, com o dia, a hora, o local e o motivo só nos passos que os usam. */
export function dadosDaChamada(c: CamposChamada, resumo: ResumoPessoa): Omit<DadosChamada, "hoje"> | null {
  if (c.resultado === null) return null;
  const base = { resultado: c.resultado, nota: c.nota, passo: c.passo };
  if (c.passo === "marcarVisita") return { ...base, data: c.data, hora: c.hora, onde: c.onde };
  if (c.passo === "ligarData") return { ...base, data: c.data, hora: c.hora };
  if (c.passo === "perder" && c.motivo !== "") return { ...base, motivo: c.motivo, contexto: { passo: passoAtual(resumo), papel: resumo.papel } };
  return c.passo === "perder" ? null : base;
}

export function useFormChamada(resumo: ResumoPessoa, hoje: string) {
  const ctx = useMemo<ContextoChamada>(() => ({ papel: resumo.papel, perdida: !!resumo.pessoa.perdida }), [resumo.papel, resumo.pessoa.perdida]);
  const [campos, setCampos] = useState<CamposChamada>(() => inicial(resumo, hoje));
  const [tentativas, setTentativas] = useState(0);
  const mudar = (parcial: Partial<CamposChamada>) => setCampos((c) => ({ ...c, ...parcial }));
  // A primeira escolha traz o passo por defeito; ao trocar de resultado, o passo fica se ainda couber.
  const escolherResultado = (r: ResultadoContacto) => setCampos((c) => ({
    ...c, resultado: r, passo: c.resultado !== null && passosDisponiveis(r, ctx).includes(c.passo) ? c.passo : passoPorDefeito(r, ctx),
  }));
  const erros = errosChamada(campos, hoje);
  const passos = campos.resultado === null ? [] : passosDisponiveis(campos.resultado, ctx);
  /** Tenta guardar: devolve os dados, ou `null` (e passa a mostrar os erros) se faltar algo. */
  const preparar = () => {
    if (campos.resultado === null) return null;
    if (temErros(erros)) { setTentativas((n) => n + 1); return null; }
    return dadosDaChamada(campos, resumo);
  };
  return { campos, mudar, escolherResultado, passos, erros: tentativas > 0 ? erros : SEM_ERROS, tentativas, preparar };
}
