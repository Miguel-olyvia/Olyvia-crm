/**
 * O "hoje" que o RH envia a base e usa para decidir "em vigor" / "agendado".
 *
 * E a data UTC, e nao o dia civil local. Todas as RPCs e triggers do fluxo 2
 * (20261210100000..140000) decidem com `current_date`, e nenhuma migration fixa
 * o fuso da sessao (`SET timezone`): na base, `current_date` e o dia em UTC.
 * Em Lisboa no horario de verao (UTC+1), entre as 00:00 e as 01:00 locais o dia
 * local ja e o seguinte mas a base ainda esta no anterior. Se o cliente usasse o
 * dia local, uma versao "de hoje" seria enviada como futura -- e o ecra
 * mostraria "agendado" o que a base ja trata como vigente (ou, ao contrario, a
 * base recusaria com HRC05 uma data que o ecra achava ser de hoje).
 *
 * UM SO helper: nao se repete `new Date()` nem `toISOString().slice(0, 10)` nos
 * hooks. As datas civis que NAO falam com a base (fim do periodo experimental,
 * termo do contrato) continuam locais, em `novaPessoaDatas.ts`.
 */
export function dataDeHojeBase(agora: Date = new Date()): string {
  return agora.toISOString().slice(0, 10);
}
