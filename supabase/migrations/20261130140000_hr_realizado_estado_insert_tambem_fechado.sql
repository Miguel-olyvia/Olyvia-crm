-- ==============================================================================
-- pessoas_horario_realizado.estado: o mesmo defeito de 20261130060000
-- (guarda so no UPDATE, INSERT aberto), encontrado ao verificar se havia mais
-- casos -- pedido explicito de quem orquestrou 20261130130000.
--
-- POR APLICAR.
--
--
-- -- O DEFEITO -------------------------------------------------------------
--
-- trg_pessoas_horario_realizado_estado_fechado (20261121240000) e "BEFORE
-- UPDATE OF estado ON pessoas_horario_realizado". Fecha a coluna a UPDATE
-- directo, para que validar horas exija mesmo hr.pessoas.horario_realizado.
-- validar (dentro de rpc_hr_realizado_validar / _rejeitar) e nao apenas
-- .edit. So que a politica de INSERT desta tabela
-- (pessoas_horario_realizado_insert, 20261120160000) so exige .edit:
--
--   FOR INSERT TO authenticated WITH CHECK (
--     deleted_at IS NULL
--     AND has_anew_permission_in_org(auth.uid(), 'hr.pessoas.horario_realizado.edit', organization_id)
--   );
--
-- Quem tem .edit (regista as proprias horas) mas NAO tem .validar podia
-- fazer um INSERT directo com estado='validado', validado_por e validado_em
-- preenchidos a proprio -- os dois CHECKs da tabela
-- (pessoas_horario_realizado_validacao_coerente e a de rejeicao) so exigem
-- coerencia interna da linha, nunca quem validou nem com que permissao.
-- Auto-validar as proprias horas, sem ninguem com .validar ter visto o
-- registo, e o mesmo furo do local_id: um caminho de escrita que ninguem
-- fechou continua a valer, apesar do guarda que parecia fechar a coluna.
--
-- O comentario em src/hooks/useAssiduidadeDaPessoa.ts (linhas 19-24) ja
-- assume o contrario -- "a coluna estado do realizado esta fechada por
-- trigger. Um insert directo daqui era recusado pela base -- e por isso nao
-- existe nenhum." Nao era: so o UPDATE estava fechado. E por sorte de
-- desenho, nao por este guarda, que hoje continua correcto: as duas
-- ferramentas que escrevem pessoas_horario_realizado por INSERT
-- (rpc_hr_picagens_consolidar_intervalo e rpc_hr_realizado_corrigir, em
-- 20261121190000) inserem SEMPRE com estado='registado' -- nenhuma muda de
-- comportamento com este guarda. O que fecha e o caminho que nao passa por
-- nenhuma delas: um INSERT directo da aplicacao ou de um cliente PostgREST
-- com .edit.
--
--
-- -- A REGRA NOVA -------------------------------------------------------------
--
-- Um registo de horas so pode NASCER em estado='registado' -- e o unico
-- estado inicial que faz sentido: ninguem valida nem rejeita um intervalo
-- que ainda nao existe. 'validado' e 'rejeitado' so se alcancam por UPDATE,
-- de dentro das RPCs do modulo, tal como ja acontecia. O guarda usa o MESMO
-- GUC de transaccao (hr_assiduidade.rpc) que o UPDATE ja usa, para o caso de
-- uma futura RPC precisar de inserir e validar num so passo -- hoje nenhuma
-- precisa.
--
-- Nao ha aqui a mesma escolha entre recusar/aceitar-e-derivar que houve para
-- local_id: nao existe um valor de estado inicial plausivel a nao ser
-- 'registado' -- nao ha "data" nem "origem" por adivinhar, so um valor fixo.
--
--
-- -- NAO EXIGE MUDAR src/ ----------------------------------------------------
--
-- Confirmado: nao ha nenhum INSERT em pessoas_horario_realizado a partir de
-- src/ (so leitura, em useAssiduidadeDaPessoa.ts e usePessoa.ts). As duas
-- RPCs que inserem (20261121190000) ja usam estado='registado' directamente
-- -- este guarda nao muda o comportamento de nenhuma delas. O comentario
-- desactualizado em src/hooks/useAssiduidadeDaPessoa.ts (linhas 19-24) fica
-- por corrigir aqui -- nao e alteracao de comportamento, e nao se toca em
-- src/ nesta migracao.
--
--
-- -- PARA REVERTER --------------------------------------------------------------
--   DROP TRIGGER IF EXISTS trg_pessoas_horario_realizado_estado_fechado ON public.pessoas_horario_realizado;
--   CREATE TRIGGER trg_pessoas_horario_realizado_estado_fechado
--     BEFORE UPDATE OF estado ON public.pessoas_horario_realizado
--     FOR EACH ROW EXECUTE FUNCTION public.hr_realizado_estado_so_por_rpc();
--   -- (e repor o corpo antigo da funcao, sem o ramo TG_OP = 'INSERT')
--
--
-- -- DEPENDE DE -----------------------------------------------------------------
--   20261121240000  trg_pessoas_horario_realizado_estado_fechado, hr_realizado_estado_so_por_rpc()
-- ==============================================================================


-- ---- Guardas ------------------------------------------------------------
DO $guardas$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_pessoas_horario_realizado_estado_fechado'
       AND tgrelid = to_regclass('public.pessoas_horario_realizado')
  ) THEN
    RAISE EXCEPTION 'trg_pessoas_horario_realizado_estado_fechado nao existe. Aplicar 20261121240000 primeiro.';
  END IF;
END;
$guardas$;


-- ---- A funcao, agora a tratar INSERT e UPDATE --------------------------------
CREATE OR REPLACE FUNCTION public.hr_realizado_estado_so_por_rpc()
RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado <> 'registado'
       AND coalesce(current_setting('hr_assiduidade.rpc', true), '') <> 'on' THEN
      RAISE EXCEPTION
        'realizado_estado_insert_bloqueado: um registo de horas so pode nascer em estado=registado. validado e rejeitado so se alcancam por UPDATE, de dentro das RPCs do modulo (rpc_hr_realizado_validar, rpc_hr_realizado_rejeitar) -- nunca directamente no INSERT, mesmo com hr.pessoas.horario_realizado.edit.'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- TG_OP = 'UPDATE', regra de 20261121240000, inalterada.
  IF NEW.estado = OLD.estado THEN
    RETURN NEW;
  END IF;

  IF coalesce(current_setting('hr_assiduidade.rpc', true), '') <> 'on' THEN
    RAISE EXCEPTION
      'realizado_estado_fora_da_rpc: o estado de um registo de horas so muda de dentro das RPCs do modulo (rpc_hr_realizado_validar, rpc_hr_realizado_rejeitar, rpc_hr_realizado_corrigir). Um UPDATE directo nao passa, nem de service_role -- validar horas exige hr.pessoas.horario_realizado.validar, e a RLS de UPDATE so verifica .edit.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.hr_realizado_estado_so_por_rpc() IS
'Fecha a coluna estado de pessoas_horario_realizado a escrita directa -- tanto no INSERT (desde 20261130140000: so nasce em estado=registado) como no UPDATE (desde 20261121240000: so muda dentro das RPCs do modulo, sentinela hr_assiduidade.rpc). Sem o ramo de INSERT, quem tivesse .edit mas nao .validar podia inserir directamente com estado=validado e auto-validar as proprias horas -- a RLS de INSERT so verifica .edit, e o CHECK de coerencia da tabela so exige validado_por/validado_em preenchidos, nunca quem os preencheu nem com que permissao.';

DROP TRIGGER IF EXISTS trg_pessoas_horario_realizado_estado_fechado ON public.pessoas_horario_realizado;
CREATE TRIGGER trg_pessoas_horario_realizado_estado_fechado
  BEFORE INSERT OR UPDATE OF estado ON public.pessoas_horario_realizado
  FOR EACH ROW EXECUTE FUNCTION public.hr_realizado_estado_so_por_rpc();


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
--
-- E o caso a exercitar aqui e uma falha de seguranca viva, nao so a
-- existencia do trigger: alguem com hr.pessoas.horario_realizado.edit (que
-- regista as proprias horas) mas SEM .validar conseguia, antes desta
-- migracao, inserir directamente com estado='validado' e assinar a propria
-- validacao -- sem que ninguem com .validar alguma vez visse o registo. O
-- caso 1 abaixo prova que esse caminho fica fechado, nao apenas que o
-- trigger existe.
DO $conferir$
DECLARE
  v_org_id       uuid;
  v_pessoa_id    uuid;
  v_realizado_id uuid;
  v_bloqueado    boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.anew_organizations (name)
    VALUES ('__conferir_20261130140000__')
    RETURNING id INTO v_org_id;

    INSERT INTO public.pessoas (organization_id, primeiro_nome, apelido)
    VALUES (v_org_id, 'Conferir', 'Migracao')
    RETURNING id INTO v_pessoa_id;

    -- Caso 1: INSERT directo com estado='validado' tem de FALHAR, mesmo com
    -- validado_por/validado_em preenchidos (o CHECK de coerencia nao chega a
    -- ser avaliado -- o trigger BEFORE dispara primeiro), e com o SQLSTATE
    -- proprio do guarda (42501) -- nao com qualquer excepcao (um WHEN OTHERS
    -- engoliria tambem uma falha real do proprio bloco de conferir).
    BEGIN
      INSERT INTO public.pessoas_horario_realizado
        (pessoa_id, organization_id, data, hora_inicio, hora_fim, estado, validado_em)
      VALUES
        (v_pessoa_id, v_org_id, current_date, '09:00'::time, '17:00'::time, 'validado', now());

      RAISE EXCEPTION 'pessoas_horario_realizado aceitou um INSERT com estado=validado -- alguem so com .edit conseguia auto-validar as proprias horas, sem ninguem com .validar ver o registo.';
    EXCEPTION
      WHEN SQLSTATE '42501' THEN
        v_bloqueado := true;
    END;

    IF NOT v_bloqueado THEN
      RAISE EXCEPTION 'O guarda de INSERT em pessoas_horario_realizado.estado nao disparou como esperado.';
    END IF;

    -- Caso 2: INSERT normal, estado='registado' por omissao (o caminho das
    -- duas RPCs que hoje escrevem esta tabela), continua a funcionar.
    INSERT INTO public.pessoas_horario_realizado
      (pessoa_id, organization_id, data, hora_inicio, hora_fim)
    VALUES
      (v_pessoa_id, v_org_id, current_date, '09:00'::time, '17:00'::time)
    RETURNING id INTO v_realizado_id;

    IF v_realizado_id IS NULL THEN
      RAISE EXCEPTION 'INSERT em pessoas_horario_realizado com estado=registado deixou de funcionar -- regressao no guarda novo.';
    END IF;

    -- Sucesso: levanta sempre, com um ERRCODE proprio -- nunca P0001, que e
    -- o SQLSTATE de qualquer RAISE EXCEPTION simples, incluindo os dos
    -- triggers criados acima, e que um WHEN SQLSTATE P0001 engoliria como
    -- sucesso. O ROLLBACK desta subtransaccao desfaz os INSERTs acima, a
    -- organizacao e tudo o que os triggers de criacao de organizacao lhe
    -- penduraram -- nao um DELETE manual.
    RAISE EXCEPTION 'conferir_20261130140000_ok' USING ERRCODE = 'CF002';
  EXCEPTION
    WHEN SQLSTATE 'CF002' THEN
      RAISE NOTICE 'OK: pessoas_horario_realizado.estado agora recusa INSERT com estado <> registado tal como ja recusava UPDATE directo -- fecha o caminho de auto-validacao sem passar por quem tem .validar; exercitado com uma organizacao, pessoa e registo descartaveis, revertidos por ROLLBACK da subtransaccao (nao por DELETE manual).';
    WHEN OTHERS THEN
      RAISE;
  END;
END;
$conferir$;
