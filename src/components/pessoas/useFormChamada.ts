// O estado do formulário "Registar chamada": o que se escolheu, os erros (só depois de tentar guardar) e os dados prontos
// para `registarChamada`. Os valores de partida: amanhã, às 10:00, e a visita na morada da lead (se a tiver). A visita marcada na chamada é
// da pessoa: não há pedido a escolher.
import { useMemo, useState } from "react";
import { somarDias, type DadosChamada } from "./acoesPessoa";
import {
  errosChamada, passoPorDefeito, passosDisponiveis, temErros, type ContextoChamada, type ErrosChamada,
} from "./chamadaPassos";
import { destinoInicial, moradaDaLead, validarDestino, type DestinoVisita, type ErroMoradaVisita } from "./moradaVisita";
import type { MotivoEncerramento, PassoChamada, ResultadoContacto, ResumoPessoa } from "./pessoasTipos";

export const HORA_POR_DEFEITO = "10:00";

export interface CamposChamada {
  resultado: ResultadoContacto | null;
  nota: string;
  passo: PassoChamada;
  data: string;
  hora: string;
  /** Onde é a visita: a morada da lead ou outra. */
  destino: DestinoVisita;
  /** O motivo, ao encerrar a abordagem; `outro` pede o texto em `motivoOutro`. */
  motivo: MotivoEncerramento | "";
  motivoOutro: string;
}

const SEM_ERROS: ErrosChamada = { data: null, hora: null, motivo: null };

const inicial = (resumo: ResumoPessoa, hoje: string): CamposChamada => ({
  resultado: null, nota: "", passo: "nenhum", data: somarDias(hoje, 1), hora: HORA_POR_DEFEITO,
  destino: destinoInicial(moradaDaLead(resumo.pessoa)), motivo: "", motivoOutro: "",
});

/** Os dados para `registarChamada`, com o dia, a hora e o local só nos passos que os usam, e o motivo ao encerrar a abordagem. */
export function dadosDaChamada(c: CamposChamada): Omit<DadosChamada, "hoje"> | null {
  if (c.resultado === null) return null;
  const base = { resultado: c.resultado, nota: c.nota, passo: c.passo };
  if (c.passo === "marcarVisita") return { ...base, data: c.data, hora: c.hora, destinoVisita: c.destino };
  if (c.passo === "ligarData") return { ...base, data: c.data, hora: c.hora };
  if (c.passo !== "perder") return base;
  if (c.motivo === "") return null;
  if (c.motivo !== "outro") return { ...base, motivo: c.motivo };
  const texto = c.motivoOutro.trim();
  return texto === "" ? null : { ...base, motivo: "outro", motivoOutro: texto };
}

/**
 * O estado do formulário: o que se escolheu, os passos que cabem ao resultado, os erros e `preparar` (os dados, ou nada se falta algo).
 * Com `agendaNaBase` (a ficha real) o dia e a hora da visita são os da agenda da base, que os valida por si: aqui só se valida o resto.
 */
export function useFormChamada(resumo: ResumoPessoa, hoje: string, semVisita = false, agendaNaBase = false) {
  const ctx = useMemo<ContextoChamada>(
    () => ({
      papel: resumo.papel, perdida: !!resumo.pessoa.perdida || !!resumo.pessoa.encerrada, comNegocioAberto: resumo.abertos.length > 0, semVisita,
    }),
    [resumo.papel, resumo.pessoa.perdida, resumo.pessoa.encerrada, resumo.abertos.length, semVisita],
  );
  const [campos, setCampos] = useState<CamposChamada>(() => inicial(resumo, hoje));
  const [tentativas, setTentativas] = useState(0);
  const mudar = (parcial: Partial<CamposChamada>) => setCampos((c) => ({ ...c, ...parcial }));
  // A primeira escolha traz o passo por defeito; ao trocar de resultado, o passo fica se ainda couber.
  const escolherResultado = (r: ResultadoContacto) => setCampos((c) => ({
    ...c, resultado: r, passo: c.resultado !== null && passosDisponiveis(r, ctx).includes(c.passo) ? c.passo : passoPorDefeito(r, ctx),
  }));
  const erros = errosChamada(agendaNaBase && campos.passo === "marcarVisita" ? { ...campos, passo: "nenhum" } : campos, hoje);
  const moradaLead = moradaDaLead(resumo.pessoa);
  const erroMorada: ErroMoradaVisita | null = campos.passo === "marcarVisita" ? validarDestino(campos.destino, moradaLead) : null;
  const passos = campos.resultado === null ? [] : passosDisponiveis(campos.resultado, ctx);
  /** Tenta guardar: devolve os dados, ou `null` (e passa a mostrar os erros) se faltar algo. */
  const preparar = () => {
    if (campos.resultado === null) return null;
    if (temErros(erros) || erroMorada) { setTentativas((n) => n + 1); return null; }
    return dadosDaChamada(campos);
  };
  return {
    campos, mudar, escolherResultado, passos, erros: tentativas > 0 ? erros : SEM_ERROS, moradaLead, erroMorada: tentativas > 0 ? erroMorada : null,
    tentativas, preparar,
  };
}
