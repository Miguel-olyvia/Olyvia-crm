# Handoff — Olyvia CRM de RH — atualizado a 27 de Outubro de 2026

**Este ficheiro é autossuficiente.** O `vault` (documentação fora do GitHub) **não viaja** para o outro PC; só este ficheiro e o **git**. Está também no ramo `wip/rh-pessoas-fase8` em `supabase/rascunhos/LEIA-ME-handoff.md`. Tudo o que é código, migrations e desenhos está no git. Datas e números são de 27/10; o que não foi reverificado diz-se.

---

## 1. Retomar noutro PC — fazer isto primeiro

### 1.0 Se o outro PC ainda NÃO tem o repositório (ir buscar tudo de raiz)

1. **Instalar:** Git, Node 24 e a Supabase CLI (≥ 2.116). **Sem Docker** (pouca RAM; nunca `supabase start`/`db reset`/`db diff`).
2. **Chave SSH da conta GitHub `Miguel-olyvia`:** o repositório é dessa conta, e a chave deste PC chama-se `id_ed25519_olyvia` (pasta `.ssh` do utilizador). Copiar a chave privada para a pasta `.ssh` do outro PC por um meio seguro (pen, nunca pelo chat nem por ficheiro do repositório), **ou** gerar uma nova (`ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_olyvia`) e juntar a parte pública em GitHub → Settings → SSH and GPG keys, na conta `Miguel-olyvia`.
3. **Alias SSH:** acrescentar a `~/.ssh/config` (é o que está neste PC):
   ```
   Host github-olyvia
       HostName github.com
       User git
       IdentityFile ~/.ssh/id_ed25519_olyvia
       IdentitiesOnly yes
   ```
   Testar com `ssh -T git@github-olyvia` (deve responder com o nome da conta `Miguel-olyvia`).
4. **Clonar o repositório** (workspace habitual: `C:\my-crm-dream-main`, repo em `C:\my-crm-dream-main\projeto`):
   `git clone git@github-olyvia:Miguel-olyvia/Olyvia-crm.git C:\my-crm-dream-main\projeto`
   (Neste PC existe também o remoto `upstream` = `https://github.com/ricardobelchior1984-code/olyvia.git`, o repositório original; **não é usado para este trabalho**.) A Olyvia 2.0 é **outro** repositório: `git@github-olyvia:Miguel-olyvia/Olyvia2.0.git`.
5. **Supabase:** `supabase login` (abre o browser; a conta tem de ver o projeto **RH `uetjghdkwbywbftedtth`**). Se o `supabase link` pedir a password da base, está no painel do Supabase (Project Settings → Database); nunca a guardar em ficheiros. Os segredos das Edge Functions já estão no servidor (não há nada a copiar).
6. Continuar no passo 1 abaixo (worktree do ramo WIP) e fazer `npm i` dentro do worktree.

### 1.1 Se o repositório já existe no outro PC

1. `git fetch origin` e criar um **worktree** do ramo WIP (nunca trabalhar na pasta principal do repo: está ligada à base de **produção/Mudelar**):
   `git worktree add <pasta> -b wip/rh-pessoas-fase8 origin/wip/rh-pessoas-fase8`
2. Dentro do worktree: `supabase link --project-ref uetjghdkwbywbftedtth` e **confirmar** que `supabase/.temp/project-ref` diz `uetjgh…` antes de qualquer comando à base.
3. `supabase migration list --linked`: a última migration aplicada deve ser **`20261231810000`**. Se houver mais, alguém aplicou depois deste handoff.
4. Verificação leve do código (substitui o `vite build`, que o utilizador proíbe por RAM): o `esbuild` nativo, 0 erros esperados, ~10 s, sem `node.exe`:
   `node_modules\@esbuild\win32-x64\esbuild.exe src/main.tsx --bundle --packages=external --format=esm --jsx=automatic --alias:@=./src --loader:.svg=dataurl --loader:.png=dataurl --loader:.jpg=dataurl --loader:.webp=dataurl --loader:.gif=dataurl --loader:.woff=dataurl --loader:.woff2=dataurl --loader:.css=empty --log-level=error --outfile=<ficheiro temporário fora do repo>`
   Apanha sintaxe, imports que não resolvem e exports em falta (o que parte o deploy do Vercel, que só corre `vite build`). **Não apanha erros de tipos**: `tsc`/`eslint` nunca correram neste trabalho.
5. **Testes:** só `npx vitest run <um ficheiro> --maxWorkers=1`, **um de cada vez**, e nunca uma pasta inteira (gastam RAM; o utilizador já pediu para não correr nada pesado). Nunca `tsc`, `eslint` nem `vite build`.
6. O `CLAUDE.md` do workspace (regras do utilizador) não viaja: as essenciais estão no §8. Copiar a regra «comandos à base a partir do worktree» para o `CLAUDE.md` do outro PC.

**Ramos (todos enviados):**
- **`feature/rh-pessoas`** HEAD `5cdec59f`: tudo o que está revisto por leitura e aplicado. É o que o Vercel de teste (`olyvia-crm-env-testarh-bmgest.vercel.app`, protegido por login Vercel) publica. **Nada vai para o `main`** e a Mudelar nunca é afetada.
- **`wip/rh-pessoas-fase8`** HEAD `ca50197f` = `feature/rh-pessoas` + 1 commit de **trabalho a meio** (40 ficheiros, não verificado): a morada da obra e outros valores do Pipeline, e **cerca de 20 ficheiros de teste do `/rh-exemplo` a meio de serem corrigidos** com o utilitário `src/test/rhExemploProviders.tsx`. Quando os testes estiverem verdes, fundir em `feature/rh-pessoas`.

**Commits desta sessão em `feature/rh-pessoas`** (por ordem): `51141e41` proxy do NIF + rascunhos · `b0c3c385` `/rh-exemplo` ligado à base · `4b932e8a` Pipeline: um só voltar, scroll no meio · `6566f1a7` NIF opção (a) aplicado · `a70523fa` `/rh-exemplo` 2.ª ronda · `8f3b8ad9` Pipeline: passos preenchidos · `93ce3c3a` portal real com a UI da pré-visualização · `71b9580b` justificação do dia na base · `5cdec59f` portal fase 1 (OTP).

---

## 2. Estado da base RH e das Edge Functions (lido na base a 27/10)

**Base RH `uetjghdkwbywbftedtth`** (única org: nike `b6ffce4f-f630-4933-833a-008649757a33`; escritas de teste só aí). Migrations aplicadas nesta sessão (todas com guardas atómicas e verificação de catálogo; **nenhum teste SQL foi corrido**):

| Versão | O quê |
|---|---|
| `20261231500000` | (do Rafael) preço de embalagem do portal de fornecedor; as 5 funções já estavam vivas, só registou a versão |
| `20261231600000` | NIF: `neg_guardar_nif_pessoa(p_actor_auth_uid, …)` só `service_role`; tabela `neg_nif_tentativas` (10 tentativas/min, NG032); gatilho do dono da pessoa; `authenticated` sem `UPDATE` direto em `nif_hash/nif_encrypted/nif_last3` |
| `20261231790000` | `CHECK` de `pessoas_acessos_sensiveis.campo` passa de 10 para **14** valores (as funções «Ver justificação» de faltas e ausências do RH real falhavam sempre; lido no catálogo, **não reproduzido a correr**) |
| `20261231800000` | justificação do dia: tabela `pessoas_justificacoes_dia` (RLS, `motivo` sem acesso direto), 5 RPCs `rpc_hr_justificacao_dia_*`, gatilho que passa a justificação a `sem_efeito` se a falta for anulada/corrigida |
| `20261231810000` | portal fase 1: `rpc_hr_convite_admissao_rascunho(p_token_hash, p_sessao_hash, p_rascunho)` e `…_submeter(p_token_hash, p_sessao_hash, p_dados, p_assinatura_nome, p_ip, p_user_agent)` substituem as assinaturas antigas (que escreviam só com o link); exigem sessão OTP; o submeter lê o NISS e o IBAN do Vault |

**Edge Functions publicadas na RH:** `nif-write-proxy` **v58**; `convite-admissao` **v12**. Segredos existentes: `NIF_HMAC_KEY`, `NIF_ENC_KEY`, `APP_BASE_URL`, `PORTAL_OTP_PEPPER`, `SUPABASE_*` (nunca ver nem guardar valores).

**ARMADILHA DO `db push` (drift):** as versões **`20261231300000` e `20261231400000` estão registadas na base RH sem nome e sem ficheiro** (alguém usou `migration repair` ou equivalente; o conteúdo da 400000 já está na base byte a byte, a 300000 nunca correu — foi substituída pela 600000). O `db push` **recusa** com `LegacyDbPushMissingLocalError`. Solução (está no `CLAUDE.md`, nunca `migration repair`): antes de `migration list`/`push`, criar em `supabase/migrations/` dois ficheiros **vazios** (só um comentário, CRLF) `20261231300000_registo_sem_ficheiro.sql` e `20261231400000_registo_sem_ficheiro.sql`; depois do push **apagá-los** e **nunca os comitar**. Antes do push, `migration list --linked` + `db push --linked --dry-run` e confirmar que o pendente é **exatamente** o que se quer (o `db push` aplica TUDO o que estiver na pasta).

**Depois de cada `db push`, publicar a Edge que depende dele** (`supabase functions deploy <nome> --project-ref uetjghdkwbywbftedtth --use-api`, só essa função). Migration, Edge e código entram juntos.

---

## 3. O que foi feito (por área) e o que NÃO está verificado

**Nada foi visto no browser** (o utilizador testa na nike). O `esbuild` dá 0 erros; os testes escritos só foram medidos onde se diz.

- **Pipeline guiado** (`src/components/pessoas`, `pessoas-lista`, `hooks/pessoas`): um só botão «← Pipeline»; scroll só na coluna do meio (≥1024 px e ≥44rem de altura; abaixo, a página); **cada passo feito abre o MESMO ecrã do passo preenchido** (não um resumo em lista), na fase atual e nas «Fases feitas» (modo só de leitura). A morada da obra gravada, quem fez a chamada, a próxima ação e o título do quadro estão **no WIP** (por rever).
- **`/rh-exemplo`** (protótipo de RH ligado à base): relógio real; Nova pessoa completa (seletor de conta/utilizador, duplicados, permissões, anexos, convite); admissões; assiduidade; organização; processamento; custo; horas extra (só coeficientes de pagamento). Wrappers finos em `src/components/rh-exemplo/hooks/` sobre os hooks/RPCs do RH real (regra do `semBase.test.ts`: só esses wrappers importam de `@/hooks`, `@/lib/hr`, `@/components/hr`). **Princípio do utilizador: reutilizar a lógica e os componentes do RH real em vez de refazer; muita lógica de negócio já está lá.**
- **Portal do colaborador real** (`rh-exemplo/portal/*`): UI da pré-visualização com dados reais; **fase 1**: gravar exige sessão OTP; rascunho automático (3 s e ao fechar) e Submeter; NISS e IBAN com o formulário (cifrados no Vault); saiu o botão «Guardar NISS». O Submeter **continua a escrever na ficha e a concluir** (opção A como o protótipo; **por confirmar com o utilizador**: não existem «aprovar»/«devolver» na base). Anexos **desativados** (fase 2). «Documentos» escondida (a troca de documentos não existe na base).
- **NIF:** opção (a): só o proxy chama a RPC com `service_role` e o utilizador do JWT; contador de tentativas na base. **Ninguém gravou um NIF ao vivo.**
- **Justificação do dia:** código ligado à base; aceitar = uma transação (cria/decide a falta); ninguém decide a própria. As justificações de exemplo foram apagadas.

**Sem tabela na base (ficam em memória no protótipo):** horas extra com aprovação e limites, banco de horas e tipos de horário isenção/livre, justificação de picagem esquecida, custos (equipamentos, encargos, km, ajudas), denúncias (quase tudo), troca de documentos do portal, recibo congelado e reabertura do mês, decisões de admissão (aprovar/devolver/rejeitar: as RPCs «V3b» não existem), nome de tratamento. Horas extra no RH real são **calculadas** (realizado − planeado, `useRelatorioAssiduidadeMensal.ts:536`), sem aprovação.

---

## 4. O que falta, por ordem

1. **Testar ao vivo na nike (só o utilizador):** gravar um NIF em «Quem pede»; justificação do dia (enviar, recarregar, aceitar, recusar, «Ver texto»); portal com um convite (OTP, preencher, **recarregar** para ver o rascunho, submeter); Nova pessoa com utilizador ligado; os passos preenchidos e o scroll do Pipeline; o preço de embalagem do Rafael (aceitar um preço e ver o custo).
2. **Fechar os testes do `/rh-exemplo` (no WIP):** o utilitário `src/test/rhExemploProviders.tsx` existe; ~20 ficheiros foram tocados. Antes da paragem a medição era **209 de 234 ficheiros a passar, 25 a falhar** (16 por falta de `CompanyProvider`; 2 antigos e não deste trabalho: `useContactosPessoas`, `useNomesResponsaveis`). Faltavam tocar: `abasAssiduidade`, `vistaPessoaPonto`, `justificacaoDiaFila`, `denuncias`, `rhGestao`, `fluxosD`, `cargosDivergencias`, `validacao`. Nunca enfraquecer asserções.
3. **Testes SQL por correr** (escrevem dados; o desenho previa `BEGIN; migration; teste; ROLLBACK` na nike): `supabase/rascunhos/TESTE-teste-nif-e-dono.sql`, `TESTE-teste-revogar-update-nif.sql`, `TESTE-justificacao-do-dia.sql`, `TESTE-portal-fase1.sql`, `TESTE-teste-etapa.sql`. Precisam de autorização do utilizador (SQL de escrita ao remoto, ainda que revertido).
4. **Anexos do portal (fase 2):** só há desenho: `supabase/rascunhos/DESENHO-portal-fase2-anexos.md` (701 linhas) com **14 decisões numeradas** no fim para o utilizador (recomendações incluídas, p.ex. anexos obrigatórios = nenhum, criar segredos no Vault, retenção 30 dias, recodificar a fotografia, HEIC não). Sem segredos no Vault e sem prazo de retenção aprovado os anexos não podem abrir ao público.
5. **Defeitos conhecidos por confirmar:** a Edge `convite-admissao` passava `getClientIp` ao `p_ip` (tipo `inet`; com «unknown» dá 500) — o desenho mandava usar `detectClientIp`; confirmar se ficou corrigido. `src/lib/hr/__tests__/conviteAdmissaoContrato.test.ts` ainda espera NISS/IBAN em `p_dados` (passa porque a lista não mudou; devia passar a «lidos do Vault»). O teste Deno `nif-write-proxy/index.test.ts` foi atualizado por leitura, **nunca corrido** (Deno). ~100 achados menores das revisões por tratar.
6. **Decisões de produto do utilizador:** fluxo de aprovação de horas extra (precisa de tabela); âmbito do RH por centro/departamento (hoje a organização inteira, como o RH real); «Desligar» no mesmo dia (o `CHECK` não deixa fechar na véspera); prazo de 5 dias úteis fixo ou configurável; o Submeter A ou B.
7. Atualizar o registo de trabalho (no PC antigo: `vault\registo-trabalho.md`, formato RESOLVIDO / POR FAZER / POR DECIDIR; se o outro PC não o tiver, escrever um novo com o mesmo formato).

---

## 5. Mapa do código

- **Pipeline/ficha:** `src/components/pessoas/` (`GuiaDoNegocio`, `GuiaDoPasso`, `GuiaColuna`, `layoutGuia.ts`, `assistente/*`: `AssistenteDoGuia`, `ContactoDoGuia`, `VisitaDoGuia`, `PassosContacto`, `PassosVisita`, `LeituraDoContacto`, `hidratarAssistente.ts`, `rascunhoAssistente.ts`), `src/components/pessoas-lista/` (`FichaReal`, `PipelineReal`), `src/hooks/pessoas/` (adaptadores: `adaptarRegistos.ts`, `adaptarFichaPessoa.ts`; `chamarNeg.ts` chama as RPCs `neg_*`).
- **`/rh-exemplo`:** `src/components/rh-exemplo/` (+ `hooks/` = wrappers), `src/pages/rh-exemplo/`, `src/pages/prototipo-negocios/rh/RhPagina.tsx`. Hooks reais em `src/hooks/` (`usePessoas`, `usePessoa`, `useAssiduidadeDaPessoa`, `useJustificacoesDoDia`, `useColocacoesDaOrganizacao`, …), lógica em `src/lib/hr/`, componentes reais em `src/components/hr/`.
- **Portal real:** `src/components/rh-exemplo/portal/` (`PortalReal`, `PortalFichaReal`), `src/components/hr/portal/` (`PortalFormulario`, `useRascunhoAutomatico`, `PortalSucesso`…), `src/hooks/useConviteAdmissaoPublico.ts`, Edge `supabase/functions/convite-admissao/` (`handler.ts`, `accoesPortal.ts`, `accoesAnexos.ts`, `erros.ts`).
- **NIF:** `supabase/functions/nif-write-proxy/` (`handler.ts`, `handler.vitest.test.ts`, `index.ts`).
- **Desenhos e rascunhos:** `supabase/rascunhos/` (`DESENHO-*.md`, `NOVO-*.sql` = cópias das migrations aplicadas, `TESTE-*.sql`). **Os rascunhos nunca se põem em `supabase/migrations/`** (o `db push` aplicaria tudo).
- **Utilitários de teste:** `src/test/rhExemploProviders.tsx`, `src/test/assiduidadeDaPessoaFalso.ts`, `src/hooks/pessoas/fichaTestUtil.ts`, `fichaFabrica.ts`.

---

## 6. Olyvia 2.0 (repo `Miguel-olyvia/Olyvia2.0`, `master`, base `dconylgnqyywjdetytvv`)

Outro projeto (protótipo; `olyvia2.vercel.app`). Em `master` desde 26/10: reenvio do convite de admissão sem `transicao_invalida`, org ativa em vez da 1.ª adesão da conta, email de destino editável; `admissao-rh` publicada na v3. Por saber: `portal-colaborador` e `criar-utilizador` podem ter o defeito da 1.ª adesão. A admissão de teste do Rafael na «Olyvia Demo» fica.

## 7. Outras frentes antigas (de 24/10; só estavam no vault; não reverificadas)

HTML de arquitetura da nova base v2 por módulos (`olyvia_arquitetura_nova_base_v2.html`, gerado por `build_html_v2.py` a partir de `logica/final2_<modulo>.json`; só lógica, sem código nem «hoje»); estrutura da nova base «só para ver» (não são migrations; 25 achados de BD e 15 de segurança por corrigir); protótipo `/prototipo/negocios` (bug do `MemoryRouter` aninhado corrigido em `9924fd68`, ramo `feat/negocios-prototipo`, 15 ficheiros por comitar, «não descartes nada»); Olyvia 2.0 fase 1 da base (3 migrations aplicadas por `db query`, sem registo; por fechar: 3 HIGH de segurança, modo mês, e rodar a chave `service_role`); worktree `negocios-bd` (ramo `feat/negocios-bd`) com 5 migrations antigas apagadas e 11 por comitar — **ver antes de qualquer `db push`**; migration `20261118030000` «POR APLICAR» com reversão ao lado (`20261118040000`). Decisões de RH/recrutamento por responder: custo anual ÷12 ou ÷14; salário da oferta; primeiro pagamento valida arranque da obra; valores por omissão do recrutamento.

---

## 8. Regras e armadilhas (o `CLAUDE.md` do workspace tem tudo; isto é o que mais custou)

- **Base:** só a RH (`uetjgh…`); a principal e a **Mudelar nunca se tocam**. Nunca SQL de escrita avulso ao remoto; schema só por migration + `db push --linked --yes`; nunca `migration repair`; **listar o pendente antes**; nunca `service_role` em ficheiros nem no output; credenciais coladas no chat nunca vão para ficheiros. Os comandos à base correm **sempre do worktree**, nunca da pasta principal.
- **Verificar antes de corrigir:** nada de migrations só por raciocínio estático; confirmar contra o catálogo real (já houve migrations escritas contra uma função que na base era outra). Erros de tipo em SQL só se apanham a correr: converter `"char"` com `::text`; `tgattr` é `int2vector` (índice 0): comparar com `array_to_string(t.tgattr::int2[], ',')` (a primeira tentativa do NIF falhou por isto e foi desfeita por inteiro).
- **Ficheiros do projeto usam CRLF** (`autocrlf=true`): editar com Edit/Write, nunca `sed -i`; ficheiros novos em LF são normalizados pelo Git. `deno.lock` fica sempre fora dos commits.
- **Máquina com pouca RAM:** sem `vite build`/`tsc`/`eslint`; testes um ficheiro de cada vez com `--maxWorkers=1`. Nunca `git stash`.
- **Trabalho em equipa de agentes** (Workflow, segundo plano, agentes ECC por especialidade, revisão independente; quem executa não se avalia a si próprio). **O modelo escolhe-se por camada** (mapear sonnet/low; desenhar e rever BD/segurança opus; executar sonnet/tdd-guide). Dizer o custo antes de workflows grandes.
- **Hooks GateGuard:** antes do 1.º Bash/PowerShell e de cada Edit/Write novo apresentar factos (pedido, o que faz, reversão, instrução verbatim) e repetir o **mesmo** comando. PowerShell com heredoc/aspas: usar here-strings `@'…'@`; Python sempre `python -I` (há um `types.py` estranho em `AppData\Local\Temp` que sombreia a biblioteca standard); caminhos Windows com barra normal nos campos de saída estruturada dos agentes.
- **Um agente que perde a rede devolve erro** (`Can't reach the API server`): retomar o workflow com `resumeFromRunId` (os agentes concluídos voltam do cache).
- **Os agentes de auditoria só têm leitura** (`ecc:code-explorer`): não gravam ficheiros; o resultado vem na resposta do workflow.

## 9. Como o utilizador trabalha

- Português informal, curto, direto; impaciente com explicações longas e com perguntas repetidas. Quer **números medidos**, que **não se afirme o que não foi verificado**, e que **se faça o que pediu** (já se enervou quando se limitou o âmbito: «liga tudo o que existe na base e deixa o que não existe»). Responde às decisões por número; **nunca assumir a resposta de uma pergunta que não respondeu** (aconteceu com o OTP do portal e com a opção do NIF).
- Quando pede «tira X», tira-se em todo o lado. Quando diz «faz como o RH real» ou «como o protótipo», é **ordem**. **O ecrã novo mantém a UI do protótipo; a lógica reutiliza a do RH real.**
- O utilizador faz os testes ao vivo na nike; não lho dizer repetidamente.
- Consulta capturas do protótipo como critério: ver o código antes de decidir (clone só de leitura da Olyvia 2.0: `git@github-olyvia:Miguel-olyvia/Olyvia2.0.git`, `src/pages/prototipo-negocios/`).
