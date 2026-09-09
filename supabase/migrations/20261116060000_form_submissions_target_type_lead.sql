-- form_submissions passa a aceitar target_type = 'lead'.
--
-- Contexto: a deduplicação de submissões de formulário público liga a
-- submissão ao registo que JÁ existe, em vez de criar uma lead nova. Até aqui
-- só se ligava a contactos e clientes, e a tabela foi criada com essa
-- limitação escrita em pedra:
--
--   CONSTRAINT form_submissions_target_type_check
--     CHECK (target_type = ANY (ARRAY['contact', 'client']))
--
-- (confirmado por leitura ao remoto em 2026-09-02, via pg_constraint — a
-- constraint está lá exactamente assim, e as 5 linhas existentes são 4
-- 'contact' + 1 'client'.)
--
-- O caso que agora falta é o mais comum de todos: quem submete o formulário e
-- já tem uma LEAD activa na organização. Sem esta migração, o insert seria
-- recusado com 23514 e a submissão não teria onde acumular.
--
-- O módulo de Contactos foi retirado (nenhum código cria contactos desde 3 de
-- Agosto), mas 'contact' MANTÉM-SE na lista: há 4 linhas históricas com esse
-- valor e removê-lo tornaria a tabela inconsistente com os seus próprios
-- dados. O que mudou foi só o que passa a ser ESCRITO, não o que é aceite.
--
-- Nada aqui é destrutivo: a constraint só é alargada, nunca apertada, por isso
-- nenhuma linha existente pode passar a violá-la.

ALTER TABLE "public"."form_submissions"
  DROP CONSTRAINT IF EXISTS "form_submissions_target_type_check";

ALTER TABLE "public"."form_submissions"
  ADD CONSTRAINT "form_submissions_target_type_check"
  CHECK (("target_type" = ANY (ARRAY['lead'::"text", 'contact'::"text", 'client'::"text"])));

-- Integridade polimórfica: target_id tem de existir na tabela implicada por
-- target_type. O trigger form_submissions_check_target já faz isso para
-- 'contact' e 'client'; sem o ramo do 'lead' um target_id órfão passaria sem
-- ser notado, que é precisamente o que o trigger existe para apanhar.
CREATE OR REPLACE FUNCTION "public"."check_form_submissions_target"()
RETURNS "trigger"
LANGUAGE "plpgsql"
AS $$
BEGIN
  IF NEW."target_type" = 'contact' THEN
    IF NOT EXISTS (SELECT 1 FROM "public"."anew_contacts" WHERE "id" = NEW."target_id") THEN
      RAISE EXCEPTION 'form_submissions.target_id % does not exist in anew_contacts', NEW."target_id";
    END IF;
  ELSIF NEW."target_type" = 'client' THEN
    IF NOT EXISTS (SELECT 1 FROM "public"."anew_clients" WHERE "id" = NEW."target_id") THEN
      RAISE EXCEPTION 'form_submissions.target_id % does not exist in anew_clients', NEW."target_id";
    END IF;
  ELSIF NEW."target_type" = 'lead' THEN
    IF NOT EXISTS (SELECT 1 FROM "public"."anew_leads" WHERE "id" = NEW."target_id") THEN
      RAISE EXCEPTION 'form_submissions.target_id % does not exist in anew_leads', NEW."target_id";
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON COLUMN "public"."form_submissions"."target_type" IS
  'Registo já existente a que esta submissão foi ligada: ''lead'' (o caso normal desde a deduplicação), ''client'', ou ''contact'' (histórico — o módulo de Contactos foi retirado).';
