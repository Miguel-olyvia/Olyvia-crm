import { test, expect } from '@playwright/test'

// Modulo de RH -- pessoas. Verifica ao vivo o que as rondas 1 e 2 prometeram,
// e em especial as correccoes que o utilizador pediu por escrito:
//   - fora os separadores Atividade e Equipas, que nao tinham sido pedidos
//   - Organograma e Funcoes levam ao que ja existe, nao a stubs
//   - o formulario permite preencher tudo de uma vez, por seccoes
//   - sem "Entidade legal" nem "Grupo de colaboradores": a entidade legal e a
//     da organizacao activa e nao se escolhe
//   - fechar com dados preenchidos pede confirmacao em vez de descartar
//   - a primeira seccao comeca pelo e-mail de trabalho, e depois nome e apelido
//   - "Nome social" e "Pronomes" deixaram de existir (colunas largadas)
//
// Nao escreve nada na base: preenche e fecha, nunca submete.

test.describe('RH — Pessoas', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/rh/pessoas', { waitUntil: 'domcontentloaded' })
  })

  test('a lista abre e nao e negada por permissoes', async ({ page }) => {
    await expect(page.getByText('Access Denied')).toHaveCount(0)
    await expect(page.getByText('Perfil não encontrado')).toHaveCount(0)
    expect(page.url()).toContain('/rh/pessoas')
  })

  test('os separadores sao os pedidos, e nada mais', async ({ page }) => {
    const tabs = page.getByRole('tablist').first()
    // allInnerTexts() NAO espera por nada: devolve o que estiver no DOM naquele
    // instante. Com waitUntil 'domcontentloaded' isso e antes de o React
    // renderizar, e a lista vinha vazia -- o teste falhava sem a aplicacao ter
    // defeito nenhum. Espera-se explicitamente pelo primeiro separador.
    await expect(tabs.getByRole('tab').first()).toBeVisible()
    const rotulos = (await tabs.getByRole('tab').allInnerTexts())
      .map(t => t.trim())
      .filter(Boolean)

    // Estes tres tem de estar.
    for (const esperado of [/pessoas|people/i, /organograma|org chart/i, /func|roles/i]) {
      expect(
        rotulos.some(r => esperado.test(r)),
        `separador em falta (${esperado}); encontrei: ${rotulos.join(', ')}`,
      ).toBe(true)
    }

    // Estes dois nao foram pedidos e tinham sido inventados na ronda 1.
    for (const proibido of [/atividade|activity/i, /equipas|teams/i]) {
      expect(
        rotulos.some(r => proibido.test(r)),
        `separador que nao devia existir (${proibido}); encontrei: ${rotulos.join(', ')}`,
      ).toBe(false)
    }
  })

  test('o formulario de criar pessoa tem as cinco seccoes', async ({ page }) => {
    await page.getByRole('button', { name: /nova pessoa|new person|adicionar pessoa/i }).first().click()
    const dialogo = page.getByRole('dialog')
    await expect(dialogo).toBeVisible()

    for (const seccao of [
      /informa(ç|c)(õ|o)es gerais|general/i,
      /detalhes pessoais|personal/i,
      /informa(ç|c)(õ|o)es laborais|work/i,
      /contrato|contract/i,
      /configura(ç|c)(õ|o)es|settings/i,
    ]) {
      await expect(
        dialogo.getByText(seccao).first(),
        `seccao em falta: ${seccao}`,
      ).toBeVisible()
    }
  })

  test('o formulario nao pede entidade legal nem grupo de colaboradores', async ({ page }) => {
    await page.getByRole('button', { name: /nova pessoa|new person|adicionar pessoa/i }).first().click()
    const dialogo = page.getByRole('dialog')
    await expect(dialogo).toBeVisible()

    // A entidade legal e a da organizacao activa, ponto -- nao e uma ESCOLHA.
    // O que nao pode existir e um campo para a escolher. Mostra-la em texto,
    // para quem preenche saber a que empresa a ficha vai, e o comportamento
    // pretendido -- por isso nao se afirma que as palavras nao aparecem.
    const escolhaDeEntidade = dialogo
      .getByRole('combobox')
      .filter({ hasText: /entidade legal|legal entity/i })
    await expect(escolhaDeEntidade).toHaveCount(0)
    await expect(dialogo.getByLabel(/entidade legal|legal entity/i)).toHaveCount(0)

    // O grupo de colaboradores nao existe de forma nenhuma.
    await expect(dialogo.getByText(/grupo de colaboradores|employee group/i)).toHaveCount(0)
  })

  test('a seccao 1 comeca pelo e-mail de trabalho, depois nome e apelido', async ({ page }) => {
    await page.getByRole('button', { name: /nova pessoa|new person|adicionar pessoa/i }).first().click()
    const dialogo = page.getByRole('dialog')
    await expect(dialogo).toBeVisible()

    // A ordem foi pedida por escrito, e a razao esta no componente: o e-mail
    // de trabalho e o futuro identificador de entrada.
    for (const etiqueta of [
      /e-mail de trabalho|work email/i,
      /primeiro nome|first name/i,
      /apelido|last name/i,
    ]) {
      await expect(dialogo.getByLabel(etiqueta).first()).toBeVisible()
    }

    // A ordem prova-se pela ordem NO DOCUMENTO, nao pela geometria. O primeiro
    // nome e o apelido estao lado a lado numa grelha de duas colunas: tem o
    // mesmo y, e compara-los por altura nao prova nada -- fazia o teste falhar
    // com o ecra correcto, por uma diferenca de sub-pixel entre dois campos da
    // mesma linha.
    const nomesAcessiveis = await dialogo
      .getByRole('textbox')
      .evaluateAll(campos =>
        campos.map(c => (c as HTMLElement).getAttribute('aria-label')
          ?? (c.id ? document.querySelector(`label[for="${c.id}"]`)?.textContent : null)
          ?? ''),
      )

    const indiceDe = (padrao: RegExp) => nomesAcessiveis.findIndex(n => padrao.test(n.trim()))
    const iEmail = indiceDe(/e-mail de trabalho|work email/i)
    const iNome = indiceDe(/primeiro nome|first name/i)
    const iApelido = indiceDe(/apelido|last name/i)

    expect(iEmail, `e-mail de trabalho nao encontrado; vi: ${nomesAcessiveis.join(' | ')}`).toBeGreaterThanOrEqual(0)
    expect(iNome, 'primeiro nome nao encontrado').toBeGreaterThanOrEqual(0)
    expect(iApelido, 'apelido nao encontrado').toBeGreaterThanOrEqual(0)
    expect(iEmail, 'o e-mail de trabalho vem primeiro').toBeLessThan(iNome)
    expect(iNome, 'o primeiro nome vem antes do apelido').toBeLessThan(iApelido)

    // "ID do colaborador" FICA: sobre ele o utilizador disse "nsei", e isso
    // nao e uma decisao.
    await expect(dialogo.getByLabel(/id do colaborador|employee id/i)).toHaveCount(1)
  })

  test('nome social e pronomes deixaram de existir', async ({ page }) => {
    await page.getByRole('button', { name: /nova pessoa|new person|adicionar pessoa/i }).first().click()
    const dialogo = page.getByRole('dialog')
    await expect(dialogo).toBeVisible()

    // As colunas foram largadas em 20261120210000: nao ha campo, e nao ha
    // rotulo nenhum a falar deles em lado nenhum do formulario.
    await expect(dialogo.getByLabel(/nome social|preferred name|rufname/i)).toHaveCount(0)
    await expect(dialogo.getByLabel(/pronomes|pronouns/i)).toHaveCount(0)
  })

  test('fechar com dados preenchidos pede confirmacao antes de descartar', async ({ page }) => {
    await page.getByRole('button', { name: /nova pessoa|new person|adicionar pessoa/i }).first().click()
    const dialogo = page.getByRole('dialog')
    await expect(dialogo).toBeVisible()

    // Um campo preenchido basta para haver algo a perder. Por ETIQUETA e nao
    // por posicao: a ordem da seccao 1 mudou e um selector posicional
    // passaria a apontar para outro campo sem falhar.
    const primeiro = dialogo.getByLabel(/primeiro nome|first name/i).first()
    await primeiro.fill('Teste')
    await primeiro.blur()

    await page.keyboard.press('Escape')

    // Nao pode fechar em silencio: tem de aparecer a confirmacao.
    await expect(
      page.getByRole('alertdialog').or(page.getByText(/descartar|perde os dados/i)).first(),
    ).toBeVisible({ timeout: 5000 })
  })

  test('um formulario intocado fecha sem perguntar nada', async ({ page }) => {
    await page.getByRole('button', { name: /nova pessoa|new person|adicionar pessoa/i }).first().click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.keyboard.press('Escape')

    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
})
