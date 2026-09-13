-- ==============================================================================
-- pessoas.local_id: o guarda de 20261130060000 so cobria o UPDATE. Um INSERT
-- com local_id preenchido passava sem erro nenhum -- e criava uma pessoa cujo
-- centro nao era sustentado por nenhuma linha de pessoas_afectacoes.
--
-- POR APLICAR.
--
--
-- -- O DEFEITO -------------------------------------------------------------
--
-- trg_pessoas_local_id_e_derivado (20261130060000) e "BEFORE UPDATE OF
-- local_id ON pessoas". So dispara num UPDATE. Um INSERT em pessoas com
-- local_id preenchido nao o atravessa: a pessoa nascia com um local sem
-- afectacao nenhuma por tras. O primeiro ajuste de afectacoes que essa pessoa
-- sofresse apagava-lhe o local em silencio -- trg_pessoas_afectacoes_manter_
-- local (a mesma migracao) recalcula pessoas.local_id a partir da afectacao
-- em aberto mais recente, e sem nenhuma essa conta dava NULL.
--
-- Encontrado a investigar o assistente de admissao
-- (src/hooks/usePessoas.ts, criarPessoa): o INSERT de nucleo, nessa altura,
-- escrevia local_id directamente.
--
--
-- -- A DECISAO: RECUSAR, nao inventar --------------------------------------
--
-- Das tres opcoes -- (a) recusar e obrigar a criar tambem a afectacao,
-- (b) aceitar e criar a afectacao sozinha, (c) aceitar e ignorar o valor --
-- fica (a).
--
-- (c) descarta calmamente uma escolha que o formulario de admissao pediu e o
-- utilizador fez -- o local escolhido desaparecia sem aviso nenhum. Pior do
-- que recusar.
--
-- (b) obrigava a base a inventar duas coisas que nao lhe pertencem: a DATA
-- (valido_de) e a ORIGEM. Nao ha valor correcto para nenhuma das duas aqui:
--   - data: a data de admissao vive em pessoas.data_admissao, mas essa
--     coluna e OPCIONAL e pode vir vazia ou POSTERIOR ao momento do INSERT
--     (admissao futura). "hoje" seria uma data inventada sempre que
--     data_admissao faltasse ou nao coincidisse.
--   - origem: das tres ('declarada', 'do_horario', 'inferida'), so
--     'declarada' faria sentido para algo escrito a mao no INSERT -- mas
--     'declarada' e precisamente o grau de confianca mais alto, o que se
--     reserva a RH a escrever de proposito. Atribui-lo a um efeito lateral
--     de trigger, sem ninguem a decidir a data, era inflacionar a confianca
--     de um dado que a propria base nao sabe justificar.
-- Um trigger a adivinhar estes dois valores e a MESMA classe de problema que
-- esta migracao fecha: uma segunda verdade sobre onde e desde quando a
-- pessoa trabalha, so que inventada em vez de omitida.
--
-- (a) e a UNICA que nao inventa nada, e coincide com o que o assistente de
-- admissao JA faz hoje (ver abaixo) -- pedir os dois no mesmo formulario e a
-- resposta certa a UX, nao aceitar um dos dois sozinho e adivinhar o resto.
--
--
-- -- NAO EXIGE MUDAR src/ ----------------------------------------------------
--
-- Confirmado em src/hooks/usePessoas.ts (funcao criarPessoa, o assistente de
-- admissao): o INSERT de nucleo ja NAO manda local_id (`nucleoSemLocal`,
-- destruturado do payload) -- e mais abaixo, depois do vinculo, e que o local
-- escolhido no formulario vira uma linha de pessoas_afectacoes com
-- origem='declarada' e valido_de = data_admissao (ou hoje, se aquela
-- faltar). E exactamente a opcao (a): a aplicacao ja obriga a criar a
-- afectacao, nunca escreve local_id a direito. Este guarda so fecha na base
-- o que o ecra ja faz -- e cobre quem escrever directamente (scripts,
-- service_role, uma futura mudanca de ecra que reintroduza o mesmo erro).
--
--
-- -- A REGRA NOVA -------------------------------------------------------------
--
-- hr_pessoas_local_id_e_derivado() passa a tratar TG_OP: no INSERT, recusa
-- local_id preenchido a menos que o GUC hr.sync_local_id esteja 'on' (o
-- mesmo GUC que ja autoriza o UPDATE de sincronizacao) -- NULL continua
-- legitimo, e e o caso normal de uma pessoa sem afectacao ainda. No UPDATE,
-- mantem-se exactamente a regra de 20261130060000.
--
-- O trigger passa de "BEFORE UPDATE OF local_id" para
-- "BEFORE INSERT OR UPDATE OF local_id" -- a mesma funcao, mais um evento.
--
--
-- -- PARA REVERTER --------------------------------------------------------------
--   DROP TRIGGER IF EXISTS trg_pessoas_local_id_e_derivado ON public.pessoas;
--   CREATE TRIGGER trg_pessoas_local_id_e_derivado
--     BEFORE UPDATE OF local_id ON public.pessoas
--     FOR EACH ROW EXECUTE FUNCTION public.hr_pessoas_local_id_e_derivado();
--   -- (e repor o corpo antigo da funcao, sem o ramo TG_OP = 'INSERT')
--
--
-- -- DEPENDE DE -----------------------------------------------------------------
--   20261130060000  trg_pessoas_local_id_e_derivado, hr_pessoas_local_id_e_derivado()
-- ==============================================================================


-- ---- Guardas ------------------------------------------------------------
DO $guardas$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_pessoas_local_id_e_derivado' AND tgrelid = to_regclass('public.pessoas')
  ) THEN
    RAISE EXCEPTION 'trg_pessoas_local_id_e_derivado nao existe. Aplicar 20261130060000 primeiro.';
  END IF;
END;
$guardas$;


-- ---- A funcao, agora a tratar INSERT e UPDATE --------------------------------
CREATE OR REPLACE FUNCTION public.hr_pessoas_local_id_e_derivado()
RETURNS trigger
LANGUAGE plpgsql VOLATILE
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.local_id IS NOT NULL
       AND coalesce(current_setting('hr.sync_local_id', true), 'off') <> 'on' THEN
      RAISE EXCEPTION
        'pessoas_local_id_insert_bloqueado: pessoas.local_id nao se preenche no INSERT -- e derivado da afectacao em aberto (pessoas_afectacoes). Criar a pessoa sem local_id e, a seguir (ou na mesma transaccao), uma linha em pessoas_afectacoes com o local escolhido (origem=''declarada''); e o trigger de sincronizacao dessa tabela que acaba por escrever pessoas.local_id.'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  -- TG_OP = 'UPDATE', regra de 20261130060000, inalterada.
  IF NEW.local_id IS DISTINCT FROM OLD.local_id
     AND coalesce(current_setting('hr.sync_local_id', true), 'off') <> 'on' THEN
    RAISE EXCEPTION
      'pessoas_local_id_e_derivado: pessoas.local_id passou a ser derivado da afectacao em aberto (pessoas_afectacoes). Nao se edita directamente -- criar, fechar ou corrigir uma linha em pessoas_afectacoes.';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_pessoas_local_id_e_derivado() IS
'Bloqueia escrita directa a pessoas.local_id fora do trigger de sincronizacao de pessoas_afectacoes (hr_afectacoes_manter_local_pessoa, que usa o GUC de transaccao hr.sync_local_id para se autorizar) -- tanto no INSERT (desde 20261130130000, NEW.local_id IS NOT NULL) como no UPDATE (desde 20261130060000, NEW.local_id IS DISTINCT FROM OLD.local_id). NULL continua legitimo num INSERT: e a pessoa ainda sem afectacao nenhuma. Sem o ramo de INSERT, uma pessoa nascia com um local sem nenhuma afectacao a sustenta-lo, e o primeiro ajuste de afectacoes apagava-o em silencio.';

DROP TRIGGER IF EXISTS trg_pessoas_local_id_e_derivado ON public.pessoas;
CREATE TRIGGER trg_pessoas_local_id_e_derivado
  BEFORE INSERT OR UPDATE OF local_id ON public.pessoas
  FOR EACH ROW EXECUTE FUNCTION public.hr_pessoas_local_id_e_derivado();


-- ---- Conferir -----------------------------------------------------------
-- Exercita o guarda dentro de uma subtransaccao que TERMINA SEMPRE por
-- excepcao, para que o ROLLBACK implicito desfaca tudo o que este bloco --
-- e os triggers que ele desperta -- tiverem criado. Uma organizacao NAO e
-- descartavel nesta base: nasce com 11 tipos de ausencia pendurados por FK
-- RESTRICT (trg_hr_ausencias_tipos_semear_na_criacao_org, 20261122010000) e
-- deixa uma linha permanente em anew_entities
-- (trg_ensure_organization_entity_identity, na baseline) que nenhuma FK
-- arrasta -- um DELETE manual da organizacao rebenta com 23503 contra os
-- tipos de ausencia, e mesmo corrigindo isso deixaria para sempre uma linha
-- na tabela de entidades do CRM, partilhada com organizacoes de clientes
-- reais. So um ROLLBACK reverte os dois efeitos por igual.
DO $conferir$
DECLARE
  v_org_id     uuid;
  v_pessoa_id  uuid;
  v_bloqueado  boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.anew_organizations (name)
    VALUES ('__conferir_20261130130000__')
    RETURNING id INTO v_org_id;

    -- Caso 1: INSERT com local_id preenchido tem de FALHAR, e com o SQLSTATE
    -- proprio do guarda (23514) -- nao com qualquer excepcao (um WHEN OTHERS
    -- engoliria tambem uma falha real do proprio bloco de conferir).
    BEGIN
      INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido, local_id)
      VALUES (v_org_id, 'Conferir', 'Migracao', gen_random_uuid());

      RAISE EXCEPTION 'pessoas aceitou um INSERT com local_id preenchido -- o guarda de INSERT nao ficou activo.';
    EXCEPTION
      WHEN SQLSTATE '23514' THEN
        v_bloqueado := true;
    END;

    IF NOT v_bloqueado THEN
      RAISE EXCEPTION 'O guarda de INSERT em pessoas.local_id nao disparou como esperado.';
    END IF;

    -- Caso 2: INSERT sem local_id (o caminho normal, e o que o assistente de
    -- admissao usa hoje) continua a funcionar.
    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido)
    VALUES (v_org_id, 'Conferir', 'Migracao')
    RETURNING id INTO v_pessoa_id;

    IF v_pessoa_id IS NULL THEN
      RAISE EXCEPTION 'INSERT em pessoas sem local_id deixou de funcionar -- regressao no guarda novo.';
    END IF;

    -- Sucesso: levanta sempre, com um ERRCODE proprio -- nunca P0001, que e
    -- o SQLSTATE de qualquer RAISE EXCEPTION simples, incluindo os dos
    -- triggers criados acima, e que um WHEN SQLSTATE P0001 engoliria como
    -- sucesso. O ROLLBACK desta subtransaccao desfaz o INSERT acima, a
    -- organizacao e tudo o que os triggers de criacao de organizacao lhe
    -- penduraram -- nao um DELETE manual.
    RAISE EXCEPTION 'conferir_20261130130000_ok' USING ERRCODE = 'CF001';
  EXCEPTION
    WHEN SQLSTATE 'CF001' THEN
      RAISE NOTICE 'OK: pessoas.local_id agora recusa INSERT preenchido tal como ja recusava UPDATE directo; exercitado com uma organizacao e uma pessoa descartaveis, revertidas por ROLLBACK da subtransaccao (nao por DELETE manual).';
    WHEN OTHERS THEN
      RAISE;
  END;
END;
$conferir$;
