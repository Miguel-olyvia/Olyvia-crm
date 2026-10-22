# Integração com o Eticadata (faturas, recibos e pagamentos)

Estado a 22/10/2026:
- **Emitir faturas pela API: em standby.** Segundo o revendedor, para usar o módulo da API com certificação, **a nossa plataforma também tem de ser certificada pela AT**.
- **Ler se uma fatura foi paga: funciona.** A fatura emite-se no Eticadata, o Financeiro regista o número na Olyvia e a Olyvia lê no SQL do ERP se já foi paga. Está ligado no protótipo V1 (secção 10), a partir do PC que está na rede da empresa.

Este documento junta o que se sabe, o que se decidiu e o que falta.

> **Esta pasta vai passar para um projeto novo, próprio da integração.** Foi escrita para se ler sozinha: não depende do protótipo nem desta conversa.
> - Comece pela **secção 0** (onde parou) e depois pela **secção 9** (próximos passos).
> - As consultas de leitura estão em [`consultas/`](consultas/README.md).
> - Para levar a pasta, copie-a inteira (`docs/integracao-eticadata/`). **Não** copie o ficheiro da ligação (`D:\Olyvia\.eticadata`) nem os `.csv`.

## 0. Onde parou (22/10/2026)

| Frente | Estado | A seguir |
|---|---|---|
| **Emitir faturas pela API** | Parado (standby): o módulo com certificação exige a nossa plataforma certificada pela AT | Decidir se a Olyvia se certifica ou se a fatura continua a ser emitida no ERP |
| **Ler pagamentos e faturas (SQL)** | **Funciona (22/10).** `consultas/2-fatura-paga.sql` diz se uma fatura está paga, com os recibos, a data e o meio. Testado na `Emp_Z004` | Levar a leitura para uma ponte na rede da empresa (secção 4), para funcionar fora deste PC |
| **Rede** | Resolvido (22/10): a instância está na porta **64864** (`192.168.1.252,64864`), não na 1433 | — |
| **Segurança** | O `sa` e as passwords foram partilhados por email e por chat. A leitura usa, por agora, o `sa`, mas só faz `SELECT` | Trocar a password do `sa` e criar um utilizador SQL só de leitura |
| **Protótipo** | **V1 ligado ao ERP (22/10).** «Registar a fatura do ERP» (o número da fatura emitida no Eticadata, confirmado lá) e «Verificar no ERP» (lê o pagamento; paga → recibo do ERP, encomenda de cliente e Obra). Lê por `server/eticadataLeitura.ts` (`/api/erp/fatura`), só no servidor de desenvolvimento deste PC; sem ele, regista-se sem confirmar e valida-se à mão | Ponte na rede da empresa para funcionar fora deste PC; faturas das adendas |

**Decisões tomadas:**
- A fatura **nunca** se cria escrevendo nas tabelas, porque não seria certificada.
- Ler pagamentos e faturas diretamente do SQL é seguro, e é o que o próprio manual recomenda (§9.1.5).
- Começa-se sempre pelas BDs de teste.
- (22/10) A Olyvia **regista** a fatura do ERP (o número) e **lê** lá o pagamento. Não emite nem escreve nada no ERP.
- (22/10) Uma fatura conta como paga quando falta **menos de 1 €**: há faturas com cêntimos de arredondamento por liquidar (por exemplo 0,50 € em 18 109 €).
- (22/10) Quando a fatura está paga no ERP, o recibo da Olyvia é o **recibo do ERP** (o número `REC …`). A Olyvia não gera recibos.
- Credenciais e dados reais nunca entram no git.

---

## 1. O que é

O sistema financeiro das empresas do grupo é o **Cegid Eticadata ERP V22**. A Olyvia (CRM, Negócios, Obras) precisa de:

- **emitir faturas**, certificadas pela AT, quando o Financeiro carrega em «Emitir a fatura»: a da obra (por tranche) e a de cada adenda ou imprevisto;
- **registar o recibo** quando o pagamento é validado;
- **ler** os números, os PDFs, os pagamentos e os saldos dos clientes, para os mostrar no negócio e no portal do cliente.

## 2. O servidor e as bases de dados

| | |
|---|---|
| Servidor | `BMINVESTE-SRV`, na rede local, sem acesso pela internet (o IP e os acessos estão no email do revendedor) |
| SQL Server | 2017 **Express**, instância `BMINVESTE-SRV\ETICADATA` |
| BD de sistema | `sistema` |

| Empresa | BD real | BD de testes |
|---|---|---|
| BMGest | `Emp_B001` | |
| BMInvest | `Emp_B002` | |
| **Mudelar** | **`Emp_B004`** | **`Emp_Z004`**, `Emp_ZB04` |
| BM24 | `Emp_B005` | |
| BMClean | `Emp_B006` | `Emp_ZB06` |
| Só No Lar | `Emp_B007` | |
| (base) | | `Emp_Base` |

As credenciais (as do servidor e as do `sa`) chegaram por email. **Não ficam neste repositório nem em nenhum ficheiro.**
Pedimos ao revendedor para trocar a password do `sa` e criar um utilizador só de leitura. A Olyvia nunca usa o `sa`.

Nota: o SQL Server Express não tem SQL Agent, por isso nada pode ficar agendado do lado do SQL. Tem também o limite de 10 GB por BD, o que chega para ler.

## 3. O que diz o manual (ERP V22, «Manual de Plataforma e Customização», cap. 9)

- **API de integração** (§9): é a mesma API que o ERP usa e permite tudo o que o ERP faz. Existe em duas formas:
  - **DLLs .NET**, para os componentes desktop: `Eticadata.ERP.dll`, `Eticadata.Movs.dll`, `Eticadata.Tables.dll`, `Eticadata.Generics.dll` e `Eticadata.EtiVersions.dll`. São .NET Framework 4.8 e devem compilar-se para **x86**, porque usam DLLs de terceiros de 32 bits. Têm de ser da mesma versão da BD e correm a partir da pasta `Bin` da instalação.
  - **WebServices**, para os componentes web. O manual não os documenta (está na secção 8, pergunta em aberto).
- **Como se usa**:
  1. Inicializa-se o `EtiAplicacao` com `InitializeEtiApp(app, servidor, BD sistema, login, password, …)`.
  2. A partir dele obtém-se `Movimentos.MovVendas`.
  3. `GetNew(...)` cria o documento novo, e o número definitivo só fica certo no `Update`.
  4. `AlteraEntidade(...)` define o cliente; os métodos `Altera<Campo>` disparam as regras do ERP.
  5. As linhas acrescentam-se com `AddLin` e lêem-se com `Linha(i)`; as linhas começam em 1.
  6. `Validate()` confirma o documento e devolve os avisos.
  7. `Update(...)` grava.
  8. Se houver erro, vem em `EtiErrorCode`, `EtiErrorDescription` e `EtiErrorLine`.
- **Certificação** (§9.3.9): o documento é **assinado pela Eticadata na primeira gravação** se estiver tudo isto:
  - a empresa é portuguesa e não é de formação;
  - está licenciado o módulo **«Plataforma de Integração com Certificação»**;
  - o tipo de documento é para entregar ao cliente;
  - a secção **não** é de documentos Externos nem Manuais;
  - o documento é novo (`IsNew`) e a gravação é feita com `MovVendas.Update(…)`;
  - não vem de pré-venda automática nem de integração offline.
- **Consultas** (§9.1.5): a API não serve para listas. O manual diz para ler **diretamente do SQL Server** (`EtiApp.ActiveEmpresa.ConnectionStringNET`).
- **Licença** (§9.1.1): um programa fora do ERP precisa do módulo «Plataforma de Integração», contado por postos. Já vem incluído na linha Extended.
- **Eventos** (§9.2): o ERP pode correr código nosso em eventos como «Depois de gravar». Pode servir mais tarde para avisar a Olyvia de pagamentos registados no ERP.

**A regra que não se quebra:** a fatura cria-se **sempre pela API**. Escrever nas tabelas não a certifica, e pode partir a cadeia de assinaturas da série e o SAF-T.

## 4. A arquitetura

```
 Olyvia (Vercel + Supabase)                                   Rede da empresa
 ┌──────────────────────────┐   HTTPS + token   ┌──────────────────────────────────────────────┐
 │ edge function            │ ────────────────► │ Ponte Eticadata (serviço Windows, .NET 4.8 x86)│
 │ erp-faturar / erp-recibo │ ◄──────────────── │  └─ DLLs Eticadata → MovVendas.Update          │
 │ erp-sincronizar (leitura)│   (Cloudflare     │  └─ SELECT (utilizador só de leitura)          │
 └──────────────────────────┘    Tunnel)        │ SQL Server BMINVESTE-SRV\ETICADATA             │
                                                └──────────────────────────────────────────────┘
```

- **A ponte** é um serviço Windows pequeno, que corre **no BMINVESTE-SRV** (ou noutra máquina da rede com o ERP instalado). É a única coisa que fala com o ERP.
- **Como a Olyvia lá chega**: por um **Cloudflare Tunnel**, ou outro túnel de saída. Assim não se abre nenhuma porta no router e o SQL Server nunca fica exposto. Cada pedido leva um token, e a ponte só aceita os pedidos das edge functions da Olyvia.
- **A leitura** também passa pela ponte, com um utilizador SQL só de leitura, porque o SQL não sai da rede. A Olyvia guarda uma cópia do que precisa (o número, o estado e o PDF) nas tabelas dela.
- **Se o ERP estiver em baixo**, a fatura fica «por emitir» na Olyvia, com o erro à vista, e o Financeiro tenta de novo. Nunca se gera um número na Olyvia.

## 5. O contrato da ponte (proposta)

Todos os pedidos levam o cabeçalho `Authorization: Bearer <token>` e um `idempotencia` (o id do pedido na Olyvia). Com ele, a ponte não emite duas vezes a mesma fatura se o pedido se repetir.

### `POST /faturas`
Emite uma fatura certificada.
```json
{
  "idempotencia": "neg-1027-tranche-1",
  "empresa": "Emp_B004",
  "serie": "<por definir>", "seccao": "<por definir>", "tipoDoc": "<por definir>",
  "cliente": { "nif": "123456789", "nome": "Tiago Almeida", "morada": "...", "codigoErp": null },
  "linhas": [
    { "descricao": "Remodelação de cozinha · 1.ª tranche (30%)", "quantidade": 1, "precoUnitario": 2635.23, "taxaIva": 6 },
    { "descricao": "Conjunto de móveis de cozinha", "quantidade": 1, "precoUnitario": 1200.00, "taxaIva": 23 }
  ],
  "vencimento": "2026-11-05",
  "referenciaOlyvia": "CT 2026/1027"
}
```
Resposta: `{ "numero": "FT B004/123", "atcud": "XXXX-123", "data": "2026-10-21", "total": 4269.55, "pdf": "<url ou base64>" }`.
Em erro: `{ "erro": "<EtiErrorCode>", "mensagem": "<EtiErrorDescription>", "linha": <EtiErrorLine> }`.

### `POST /recibos`
Regista o recibo de uma fatura paga.
```json
{ "idempotencia": "rec-FT B004/123", "empresa": "Emp_B004", "fatura": "FT B004/123", "valor": 4269.55, "data": "2026-10-25", "meio": "Transferência" | "Referência MB" | "Débito direto", "referencia": "TRF 1025-551" }
```
Resposta: `{ "numero": "RC B004/45", "pdf": "..." }`.

### `GET /documentos?empresa=Emp_B004&desde=2026-10-01`
Lê as faturas, os recibos e as notas de crédito alterados desde uma data, para a sincronização. **Só leitura.**

### `GET /clientes/:nif?empresa=Emp_B004`
Lê o cliente no ERP (código e saldo), para não o criar em duplicado.

**Por decidir com o revendedor:** se o cliente se cria pela API quando não existe (`Tabelas.Clientes`); os códigos de IVA (6% e 23%) e o motivo de isenção; o artigo ou serviço genérico a usar nas linhas «livres»; e a série, a secção e o tipo de documento.

## 6. O que a Olyvia lê do SQL (mapeado na BD de testes `Emp_Z004` a 22/10)

Quando houver o utilizador só de leitura, mapeiam-se estas tabelas na **`Emp_Z004`**, sempre com `SELECT`:

- os documentos de venda (cabeçalho e linhas): número, série, data, cliente, totais, estado e ATCUD;
- os recibos e as liquidações: que fatura foi paga, quando e por que meio;
- os clientes: NIF, código e saldo;
- onde ficam os PDFs, se o ERP os guarda numa pasta.

**O que se encontrou (22/10/2026):**

| O quê | Onde | Notas |
|---|---|---|
| Faturas (cabeçalho) | `Mov_Venda_Cab` | Na Mudelar o tipo é `FAT`, com números como `FAT 15200126/538` (`strNumero`). A chave é `strCodSeccao` + `strAbrevTpDoc` + `strCodExercicio` + `intNumero`. Também tem `strATCUD`, `dtmData`, `dtmDataVencimento`, `strCVDNumContrib` (NIF), `fltTotal` e `bitAnulado` |
| Quanto falta pagar | `Mov_Venda_Cab.fltValorPendente` | Bate com o total menos os recibos em 3785 das 3786 faturas `FAT` |
| Recibos | `Mov_Liquidacao_Cab` (tipo `REC`) + `Mov_Liquidacao_Lin` | Cada linha aponta para a fatura pelas colunas `strCodSeccaoPend`, `strAbrevTpDocPend`, `strCodExercicioPend` e `intNumeroPend`. O valor está em `fltAtribuido` |
| Meio de pagamento | `Mov_Liquidacao_CabPagamento.strAbrevTpMovPagTes` | A descrição está em `Tbl_Gce_Tipos_MovPag` (Transferência, Multibanco, Dinheiro, …) |
| Outros tipos de venda | `Mov_Venda_Cab` | `NCRE` (notas de crédito), `FPRO` (pró-formas), `GTRAN` (guias), `CONTR`, `FTR`, `EFA`. Ainda não são usados |

A consulta completa está em [`consultas/2-fatura-paga.sql`](consultas/2-fatura-paga.sql) e, no protótipo, em `server/eticadataLeitura.ts`.

## 7. Onde liga no protótipo (e depois na app)

O protótipo (`src/pages/prototipo-negocios/`, versão «Atual») já tem o circuito todo, com números simulados. Na migração, cada ação passa a chamar a ponte:

| No protótipo (`motor.ts`) | Hoje faz | Com o Eticadata |
|---|---|---|
| `registarFaturaErp(id, numero, info)` (22/10, substitui o `emitir` no V1) | o Financeiro escreve o número da fatura emitida no Eticadata; a Olyvia confirma-a no ERP antes de a registar | igual, pela ponte (`GET /documentos`), ou `POST /faturas` se a Olyvia for certificada |
| `verificarErp(id)` (22/10) | lê no ERP o estado da fatura; paga → `pagoNoErp`: o recibo do ERP, a encomenda de cliente e a Obra | igual, pela ponte |
| `faturarAdendas(id)` | uma fatura por adenda assinada (inclui os imprevistos) | um `POST /faturas` por adenda |
| `escolherMetodo` / `autorizarDebito` / `avisarPagamento` | o cliente escolhe no portal (transferência, referência MB ou débito direto) e avisa que pagou | ficam na Olyvia; o meio segue para o recibo |
| `validar(id)` | só quando não há ligação ao ERP («Validar à mão»): `RC 2026/<n>` simulado; emite a encomenda de cliente e passa o negócio a Obra | deixa de ser preciso: o recibo é o do ERP |
| `validarPagamentosAdenda(id)` | o recibo da adenda | `POST /recibos` por adenda |
| (novo) | — | a sincronização com `GET /documentos` marca como pagas as faturas recebidas diretamente no ERP |

**Pagamentos (21/10):**
- A referência MB e o débito direto são, para já, **simulados no protótipo** (`pagamentoCliente.ts`: entidade, referência e IBAN de exemplo).
- Para a referência MB e o débito direto (SEPA) a sério, é precisa uma conta num prestador de pagamentos. Isto é **independente do Eticadata**: o Eticadata só regista o recibo.

**Assinaturas (21/10):** o contrato, as adendas e o auto assinam-se com a Chave Móvel Digital ou com **código por SMS**. O SMS segue as regras da `sms-otp` da app original (SMSAPI: 6 dígitos, 5 minutos, 5 tentativas, reenviar ao fim de 60 s, no máximo 3 em 10 minutos). Não depende do ERP.

## 8. Perguntas ao revendedor (email de 21/10, só as críticas)

1. Temos licenciado o módulo **«Plataforma de Integração com Certificação»**? Se não, qual é o custo?
2. Que **série e secção** devemos usar para as faturas da aplicação? Podem configurá-las primeiro na `Emp_Z004`?
3. Podem criar um **utilizador SQL Server só de leitura** e trocar a password do `sa`?

Depois destas, perguntar também:
- se os **WebServices** estão instalados e documentados (podem dispensar a ponte em .NET);
- se há um exemplo de código de uma fatura com IVA a 6% e 23% e do respetivo recibo;
- onde ficam os PDFs;
- que versão exata do V22 está instalada;
- que disponibilidade e que custo tem o acompanhamento.

## 9. Próximos passos

| # | Passo | Depende de |
|---|---|---|
| ~~1~~ | ~~Mapear as tabelas na `Emp_Z004` (secção 6)~~ **Feito a 22/10** | — |
| 1b | **Feito a 22/10:** a leitura do pagamento no protótipo V1 (secção 10) | — |
| 2 | Ponte mínima: `GET /documentos` (só leitura), ligada por túnel. É o `server/eticadataLeitura.ts` a correr no servidor da empresa, e não neste PC | utilizador só de leitura |
| 2b | As faturas das adendas pelo mesmo caminho (hoje continuam com o «Emitir» simulado) | — |
| 3 | Na ponte: `POST /faturas` contra a `Emp_Z004`, a confirmar que sai assinada e com ATCUD | módulo de certificação; série e secção de teste |
| 4 | Na ponte: `POST /recibos` | 3 |
| 5 | Edge functions na Olyvia (`erp-faturar`, `erp-recibo`, `erp-sincronizar`) e ligação às ações da secção 7 | 2–4, migração do protótipo |
| 6 | Passar para a `Emp_B004` (real), com uma série nova | aprovação do Financeiro |

**Riscos:**
- Sem o módulo de certificação, a fatura não pode sair da Olyvia. A alternativa é a emissão manual no ERP, com a Olyvia só a ler.
- As DLLs têm de acompanhar a versão do ERP: cada atualização do ERP obriga a atualizar a ponte.
- O servidor e o túnel têm de estar ligados para se faturar.

## 10. A fatura do ERP no protótipo V1 (22/10/2026)

### O que o Financeiro faz

1. **Emite a fatura no Eticadata**, como sempre.
2. No negócio (passo «Pagamento» ou «Hoje»), carrega em **«Registar fatura»** e escreve o número tal como aparece no ERP, por exemplo `FAT 15200126/538`.
   - A Olyvia confirma a fatura no Eticadata antes de a registar. Se não existir, recusa e diz porquê.
   - Se o NIF da fatura no ERP for diferente do NIF de faturação do negócio, avisa (mas regista na mesma).
   - Sem ligação ao ERP, oferece **«Registar sem confirmar»**. Nesse caso, o pagamento valida-se à mão, como antes.
3. **À espera do pagamento:** em «Fatura e recibo» aparece o painel **«No Eticadata»**, com o total, o que está pago, o que falta, o estado (`por pagar`, `vencida`, `paga em parte`, `paga` ou `anulada`), os recibos com a data e o meio, e a hora da última leitura.
   - Tem **«Verificar agora»** e volta a ler sozinho **a cada minuto**, enquanto o negócio estiver aberto com o papel Financeiro.
   - Tem também **«Validar à mão»**, para quando o ERP não responde.
4. **Quando a fatura está paga** (falta menos de 1 €):
   - o recibo do negócio passa a ser o do ERP (`REC …`);
   - a data, o valor e o comprovativo do pagamento vêm do ERP;
   - a encomenda de cliente vai para o Inventário e o negócio passa a Obra, como no «Validar pagamento».

A V2 e a V2 funcional não mudaram: continuam com o registo por tranches do `FinanceiroV2`.

### Como funciona por dentro

```
 Browser (protótipo)                    PC na rede da empresa                    BMINVESTE-SRV
 FaturaErp.tsx / motor.ts --fetch-->  Vite dev: /api/erp/fatura  ----SQL---->  ETICADATA (porta 64864)
 erpEticadata.ts                      server/eticadataLeitura.ts (só SELECT)     Emp_Z004 (testes)
```

| Ficheiro | O que faz |
|---|---|
| `server/eticadataLeitura.ts` | O plugin do Vite que responde em `GET /api/erp/fatura?numero=…`. Lê a ligação de `D:\Olyvia\.eticadata` e corre a consulta da secção 6, com parâmetros. Só existe no servidor de desenvolvimento (`npm run dev`), não no build |
| `src/pages/prototipo-negocios/erpEticadata.ts` | `lerFaturaErp(numero)` (o pedido e as respostas: lida, não existe, sem ligação) e `resumoErp(info)` (o estado numa frase) |
| `src/pages/prototipo-negocios/FaturaErp.tsx` | `RegistarFaturaErp` (o campo do número) e `EstadoFaturaErp` (o painel «No Eticadata», com a leitura a cada minuto) |
| `src/pages/prototipo-negocios/motor.ts` | `registarFaturaErp`, `verificarErp`, `pagoNoErp` e `pago` (o que o pagamento confirmado faz, partilhado com o `validar`). O negócio guarda a última leitura em `d.fin.erp` |
| `src/pages/prototipo-negocios/preparacaoObra.ts` | Os passos «Registar a fatura do ERP» e «À espera do pagamento» no caminho do contrato à obra |
| `src/pages/prototipo-negocios/faturaErp.test.ts` | Os testes, com o ERP simulado: por pagar, paga em parte, paga, sem ligação, não existe, só o Financeiro regista |

### Como pôr a funcionar noutro PC

1. O PC tem de estar na rede da empresa e chegar a `192.168.1.252`, na porta `64864`.
2. Cria-se `D:\Olyvia\.eticadata`, fora do git, com uma linha:
   ```
   Server=192.168.1.252,64864;User ID=<utilizador>;Password=<password>
   ```
   Pode estar noutro sítio, indicado em `ETICADATA_LIGACAO`.
3. Por omissão, lê a BD de testes `Emp_Z004`. Para a real da Mudelar, arranca-se o Vite com `ETICADATA_BD=Emp_B004` (só quando o Financeiro aprovar).
4. `npm run dev` e abre-se `/prototipo/negocios`. Para testar sem mexer na sala partilhada, junta-se `?sala=teste-erp` ao endereço.
5. Para experimentar na `Emp_Z004`: `FAT 15200126/538` está paga, `FAT 15200126/539` está paga dentro da tolerância (faltam 0,50 €) e `FAT 15200126/548` está vencida e por pagar.

### Segurança

- **Só leitura:** só `SELECT`, com o número passado como parâmetro (sem SQL montado com texto), a ligação marcada como só de leitura (`readOnlyIntent`) e `READ UNCOMMITTED`, para nunca bloquear o ERP.
- **Só neste PC:** o servidor do Vite também está aberto à rede local, por isso a rota recusa os pedidos que não venham do próprio PC (`127.0.0.1` ou `::1`).
- **Credenciais fora do git:** a ligação vive em `D:\Olyvia\.eticadata`. Os `.csv` das consultas estão no `.gitignore`.
- **Em falta:** a leitura usa o `sa`. Antes de ir para produção, é preciso **trocar a password do `sa`** e usar um **utilizador SQL só de leitura** (pedido ao revendedor). Depois, basta mudar a linha do ficheiro da ligação.

### Limites

- Só funciona no PC que está na rede da empresa. Na versão publicada, a rota não existe: a fatura regista-se sem confirmar e o pagamento valida-se à mão. Para funcionar em todo o lado, é precisa a ponte (secção 4).
- Não compara o total da fatura do ERP com o valor do negócio. Com as faturas da BD de testes os valores não batem, porque são de outros clientes.
- As faturas das adendas continuam com o «Emitir» simulado.
