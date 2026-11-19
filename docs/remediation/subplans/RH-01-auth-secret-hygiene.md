# Subetapa RH-01 — Higiene de Segredos e Blindagem de Autenticação na UI

**Especialista Responsável:** AppSec & Secret Hygiene Specialist  
**Gate:** `G-RH01`  
**Pré-requisito:** Repositório base importado e íntegro  
**Bloqueia:** `RH-02`

---

## 1. Diagnóstico Preciso do Problema
No código original (`apps/web/src/app/page.tsx`), o formulário de autenticação inicializa estados React com credenciais literais de teste:
- `email`: `"admin@managet.local"`
- `password`: `"Managet123!"`

**Riscos Reais:**
1. Exposição de credenciais padrão diretamente no bundle JavaScript público enviado ao navegador em qualquer ambiente.
2. Risco de operadores reutilizarem a senha padrão `Managet123!` em projetos Supabase reais de homologação/produção.
3. Preenchimento silencioso de senha em telas compartilhadas ou gravações de tela.

---

## 2. Passo a Passo de Implementação
1. Criar o módulo utilitário seguro `apps/web/src/lib/auth-defaults.ts`:
   - `getInitialAuthEmail(env)`: retorna `""` em produção (`NODE_ENV !== "development"`). Mesmo em `development`, só preenche e-mail se `NEXT_PUBLIC_DEV_AUTOFILL_EMAIL` estiver explicitamente definida e validada como formato de e-mail seguro.
   - `getInitialAuthPassword()`: retorna **sempre** `""` em todos os ambientes (senhas jamais transitam por `NEXT_PUBLIC_*` nem constantes de código).
   - `sanitizeAuthEmail(raw)`: normaliza espaços, limita tamanho máximo ($\le 254$ chars) e bloqueia caracteres de controle (`\r`, `\n`, `\0`).
2. Atualizar `apps/web/src/app/page.tsx` para consumir `getInitialAuthEmail()` e `getInitialAuthPassword()`, adicionando atributos semânticos seguros (`autoComplete="email"`, `autoComplete="current-password"` / `"new-password"`).
3. Documentar `NEXT_PUBLIC_DEV_AUTOFILL_EMAIL=` vazia em `.env.example`.

---

## 3. Plano de Testes (4 Dimensões)
Arquivo: `tests/remediation/test_rh01_security_auth_hygiene.py`

1. **Segurança (SAST & Secret Scanning):**
   - Varrer todos os arquivos `.ts`, `.tsx`, `.js`, `.mjs`, `.py` e `.env.example` garantindo ausência absoluta de `Managet123!`, `admin@managet.local` em código de aplicação, chaves `sb_publishable_` reais, JWTs (`eyJ...`) ou chaves privadas PEM.
   - Verificar que nenhuma variável `NEXT_PUBLIC_*` contém os sufixos `PASSWORD`, `SECRET`, `SERVICE_ROLE` ou `PRIVATE_KEY`.
2. **Funcional & Contratos:**
   - Validar comportamento determinístico da política de autofill em `production`, `test` e `development`.
3. **Estresse:**
   - Executar 5.000 validações/sanitizações de payloads de e-mail variados (Unicode, strings longas de 100 KB, espaços extremos) em $< 200\text{ms}$ sem degradação ou regex backtracking (*ReDoS*).
4. **Caos & Injeção Hostil:**
   - Injetar variáveis de ambiente corrompidas, strings com CRLF (`admin@x.com\r\nSet-Cookie:...`), null bytes (`\x00`), tags `<script>` e `NODE_ENV` adulterado (`PRODUCTION`, `prod`, indefinido) garantindo fallback seguro para string vazia `""`.
