import { test as setup } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

// package.json declares "type": "module", so __dirname does not exist here —
// the whole suite failed to load before reaching a single test.
const currentDir = path.dirname(fileURLToPath(import.meta.url))
const authFile = path.join(currentDir, '../.auth/user.json')

setup.setTimeout(120_000)

setup('autenticar utilizador', async ({ page }) => {
  await page.goto('/auth', { waitUntil: 'domcontentloaded' })
  await page.locator('input[type="email"]').waitFor({ timeout: 60000 })

  // Sem credenciais por omissao: a versao anterior trazia um email e uma
  // palavra-passe REAIS escritos aqui, e foram parar ao repositorio e ao main.
  // Uma credencial num ficheiro versionado deixa de ser um segredo no momento
  // em que e commitada -- fica no historico mesmo depois de apagada da versao
  // actual, e qualquer pessoa com acesso ao repositorio a le.
  //
  // Passam a vir do ambiente, e falha alto se nao estiverem la.
  const email = process.env.TEST_EMAIL
  const password = process.env.TEST_PASSWORD
  if (!email || !password) {
    throw new Error(
      'Faltam as credenciais dos testes. Define TEST_EMAIL e TEST_PASSWORD no ambiente ' +
      'antes de correr a suite -- por exemplo num .env.local, que o git ignora.',
    )
  }

  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.locator('button[type="submit"]').click()

  await page.waitForURL(url => !url.toString().includes('/auth'), { timeout: 15000 })
  await page.context().storageState({ path: authFile })
})
