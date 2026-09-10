import { clienteDoRamo, NIKE } from "./lib-ramo.mjs";
const sb = await clienteDoRamo();
const COLUNAS =
  "id, organization_id, numero_interno, primeiro_nome, apelido, nome_completo, " +
  "email_trabalho, email_pessoal, telefone_trabalho, cargo, local_trabalho, " +
  "local_id, " +
  "entidade_legal_org_id, reporta_a_pessoa_id, data_admissao, data_antiguidade, " +
  "data_saida, " +
  "estado_registo, dias_trabalho, notas, created_at, updated_at";
const { data, error } = await sb.from("pessoas").select(COLUNAS)
  .eq("organization_id", NIKE).is("deleted_at", null).limit(3);
console.log(error ? "ERRO: " + error.message : `OK -- a consulta do nucleo devolve ${data.length} ficha(s)`);
(data ?? []).forEach(p => console.log("   ", p.numero_interno, p.nome_completo));
