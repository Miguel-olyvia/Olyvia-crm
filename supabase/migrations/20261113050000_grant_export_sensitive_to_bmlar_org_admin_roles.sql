-- ============================================================================
-- Concede as quatro permissoes de exportacao de dados sensiveis aos cinco
-- papeis org_admin do grupo BMLar.
--
-- PEDIDO: um utilizador (Marco Rodrigues) exportou 149 clientes e recebeu o
-- ficheiro sem email, telefone nem NIF, porque nenhum dos seus papeis tem
-- clients.export_sensitive. Decisao do responsavel do produto: dar-lhe a
-- permissao, e as quatro (nao so a de clientes), porque poder exportar
-- contactos de clientes e nao de leads seria incoerente -- a maior parte do
-- trabalho dele e em leads.
--
-- ISTO ALARGA ACESSO A DADOS PESSOAIS. Nao e uma normalizacao: dos 77 papeis
-- org_admin existentes, apenas 19 tinham clients.export_sensitive e 58 nao
-- tinham. Os cinco abaixo estavam na maioria.
--
-- ALCANCE REAL. As permissoes pertencem a PAPEIS, nao a pessoas -- nao existe
-- concessao por utilizador (anew_membership_permission_scopes ajusta apenas
-- ambito, nao concede permissoes). Estes cinco papeis sao partilhados, pelo
-- que a alteracao da a capacidade de extrair em massa emails, telefones e NIF
-- a TRES pessoas:
--
--   BM24        -> Marco Rodrigues, Tiago Belchior
--   BMClean     -> Marco Rodrigues, Tiago Belchior
--   BMGest      -> Marco Rodrigues, Tiago Belchior
--   Mudelar     -> Marco Rodrigues, Tiago Belchior
--   Grupo BMLar -> Marco Rodrigues, Tiago Belchior, Adriana Miguel
--
-- Isto foi apresentado e aceite antes de aplicar. A alternativa que isolava o
-- Marco -- criar-lhe um papel proprio -- foi descartada por acrescentar
-- dispersao a gestao de papeis.
--
-- O que a permissao controla: NAO e ver os dados. Nao existe nenhuma permissao
-- de leitura de dados sensiveis nesta base de dados (nao ha view_sensitive nem
-- reveal), e estes utilizadores ja veem email e telefone no ecra. O que estas
-- quatro permissoes controlam e a EXTRACAO EM MASSA para ficheiro, que e a
-- unica operacao registada em data_export_audit.
--
-- Migration de dados, nao de esquema. Os role_id sao especificos deste
-- ambiente; noutro ambiente estas linhas nao existem e a migration nao faz
-- nada. Idempotente.
-- ============================================================================

INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT r.role_id, p.code
FROM (VALUES
  ('0eff8219-5325-4586-a8ff-1a6f3940ca4b'::uuid),  -- BMClean, Servicos de Limpeza, Lda.
  ('569d7dc7-5327-48a2-a272-222b30bf0933'::uuid),  -- BM24, Manutencao de Edificios, Lda
  ('5a76d01c-8e66-42b8-932e-6bf0760bacba'::uuid),  -- Mudelar
  ('e875f963-5826-4d74-a69f-94bdb3e2a60f'::uuid),  -- BMGest, Servicos Tecnicos & Gestao, Lda
  ('ed68a691-4f5c-4e77-90ae-1647492629bd'::uuid)   -- Grupo BMLar
) AS r(role_id)
CROSS JOIN (VALUES
  ('clients.export_sensitive'),
  ('contacts.export_sensitive'),
  ('leads.export_sensitive'),
  ('quotes.export_sensitive')
) AS p(code)
WHERE EXISTS (SELECT 1 FROM public.anew_roles ar WHERE ar.id = r.role_id)
  AND NOT EXISTS (
    SELECT 1
    FROM public.anew_role_permissions existing
    WHERE existing.role_id = r.role_id
      AND existing.permission_code = p.code
  );
