/**
 * Gera os dois ficheiros para colar no SQL Editor do Supabase:
 *
 *   dados-de-teste.sql          escolhe a organização → demo.sql → demo-obras.sql → demo-testes.sql
 *   dados-de-teste-remover.sql  demo-obras-remover.sql → demo-remover.sql
 *
 * A organização: se só uma tem pessoas com perfil em Operações, é essa. Se
 * houver mais do que uma, o ficheiro recusa-se a correr e diz quais são —
 * escreve-se o nome em `v_nome`, no topo, e corre-se outra vez. Nunca cai
 * numa organização ao calhas.
 *
 *     node tools/gerar-dados-de-teste.mjs [pasta-de-saída]     (default: dist-sql/)
 *
 * Provado em tools/validar-demo.mjs.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const ler = (f) => readFileSync(join(RAIZ, "db", f), "utf8").replace(/\r/g, "");

const bloco = (f) =>
  `\n\n-- ################################################################\n-- ##  db/${f}\n-- ################################################################\n${ler(f)}`;

export function escolherOrganizacao(nome = "") {
  return `-- ▶ Só é preciso mexer aqui se tiveres mais do que uma organização com
--   Operações: escreve o nome dela entre as plicas, ex.: 'Grupo BMLar'.
DO $escolher$
DECLARE
  v_nome  text := '${nome.replace(/'/g, "''")}';
  v_org   text;
  v_n     integer;
  v_lista text;
BEGIN
  IF btrim(v_nome) <> '' THEN
    SELECT count(*), min(id::text) INTO v_n, v_org
      FROM public.anew_organizations WHERE name ILIKE btrim(v_nome);
    IF v_n = 0 THEN
      RAISE EXCEPTION 'Não há nenhuma organização chamada "%".', v_nome;
    ELSIF v_n > 1 THEN
      RAISE EXCEPTION 'Há % organizações chamadas "%". Usa o nome completo.', v_n, v_nome;
    END IF;
  ELSE
    SELECT count(DISTINCT p.organization_id), min(p.organization_id::text),
           string_agg(DISTINCT o.name, ', ')
      INTO v_n, v_org, v_lista
      FROM public.ops_utilizador_perfil p
      JOIN public.anew_organizations o ON o.id = p.organization_id
     WHERE p.ativo;
    IF v_n = 0 THEN
      RAISE EXCEPTION 'Ninguém tem perfil em Operações. Atribui uma função em Definições primeiro.';
    ELSIF v_n > 1 THEN
      RAISE EXCEPTION 'Há % organizações com Operações: %. Escreve o nome de uma em v_nome, no topo deste ficheiro, e corre outra vez.', v_n, v_lista;
    END IF;
  END IF;

  PERFORM set_config('ops.demo_org', v_org, false);
  RAISE NOTICE 'Dados de teste para: %', (SELECT name FROM public.anew_organizations WHERE id = v_org::uuid);
END
$escolher$;`;
}

export function dadosDeTeste(nome = "") {
  return `-- Operações — DADOS DE TESTE (inventados). Gerado por tools/gerar-dados-de-teste.mjs.
-- Colar TUDO no Supabase → SQL Editor → Run.
-- Cria, só em tabelas ops_* e só na organização escolhida abaixo:
--   · locais, ativos, checklists, planos e ordens OT-DEMO-* (demo.sql);
--   · a obra OB-DEMO-001 com o relógio a correr (demo-obras.sql);
--   · as obras OB-DEMO-002 a 006, dois modelos "(demo)", tempos e extras (demo-testes.sql).
-- Nada do CRM é criado nem alterado. Correr outra vez não duplica.
-- Para limpar: dados-de-teste-remover.sql.

${escolherOrganizacao(nome)}${bloco("demo.sql")}${bloco("demo-obras.sql")}${bloco("demo-testes.sql")}
`;
}

export function dadosDeTesteRemover() {
  return `-- Operações — remove os DADOS DE TESTE. Gerado por tools/gerar-dados-de-teste.mjs.
-- Colar TUDO no Supabase → SQL Editor → Run.
-- Apaga só o que tem prefixo DEMO (obras OB-DEMO-*, ordens OT-DEMO-*, locais e
-- ativos DEMO-*) e os modelos "(demo)". O modelo "Remodelação casa de banho" fica.
${bloco("demo-obras-remover.sql")}${bloco("demo-remover.sql")}
`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const saida = resolve(process.argv[2] ?? join(RAIZ, "dist-sql"));
  mkdirSync(saida, { recursive: true });
  writeFileSync(join(saida, "dados-de-teste.sql"), dadosDeTeste());
  writeFileSync(join(saida, "dados-de-teste-remover.sql"), dadosDeTesteRemover());
  console.log(`✓ escritos em ${saida}: dados-de-teste.sql e dados-de-teste-remover.sql`);
}
