# Context OS — Modelo de Ameaça (Threat Model)

*Versão 1.0 — Em conformidade com a Remediação v4 e LGPD*

---

## 1. Visão Geral e Arquitetura do Sistema

O **Context OS** é uma plataforma desktop e web para governança viva de especificações, versionamento Git e automação autônoma de engenharia com agentes de Inteligência Artificial.

A aplicação opera localmente na máquina do usuário, combinando:
1. **Frontend**: Single-Page Application (SPA) em TypeScript/React empacotada via Vite.
2. **Backend**: Servidor local em Node.js/Fastify (porta padrão `4100`) escutando estritamente em interfaces loopback (`127.0.0.1` e `localhost`).
3. **Desktop**: Wrapper Electron para distribuição desktop multiplataforma (macOS, Windows e Linux).
4. **Armazenamento**: Arquivos locais em disco gerenciados via Git, cofre local de senhas (`keychain`/`secret-tool`/DPAPI) e arquivos JSON atômicos.

---

## 2. Ativos Críticos (Assets)

| Ativo | Descrição | Nível de Sensibilidade |
|---|---|---|
| **Tokens de Acesso Git** | Personal Access Tokens (PATs) e OAuth tokens de provedores Git (GitHub, Forgejo, GitLab). | **Crítico** |
| **Chaves de API de IA** | Chaves para Google Gemini, OpenAI, Anthropic e provedores locais. | **Crítico** |
| **Documentação & Código** | Especificações de negócios, código proprietário, relatórios confidenciais e registros de RH. | **Alto** |
| **Credenciais de Sessão** | Tokens de autenticação efêmeros entre UI e backend local (`ctxos_session`). | **Alto** |
| **Scripts e Custom Tools** | Ferramentas e automações JavaScript personalizadas no workspace `.tools/`. | **Alto** |
| **Trilha de Auditoria** | Registros encadeados por hash SHA-256 de aprovações, commits, pushes e chamadas de IA. | **Alto** |

---

## 3. Atores e Perfis de Ameaça (Threat Actors)

1. **Páginas Web Maliciosas na Internet**: Websites visitados pelo usuário no navegador comum tentando executar CSRF, Cross-Site Scripting (XSS), DNS Rebinding ou port scanning contra `http://localhost:4100`.
2. **Processos Locais de Outros Usuários ou Malware Não-Privilegiado**: Softwares instalados na mesma máquina tentando ler arquivos de configuração, cofre de senhas ou sequestrar portas locais.
3. **Contribuidores / Autores de Pull Requests Hostis**: Atores que submetem repositórios, branches ou PRs contendo nomes de arquivos hostis, commits malformados, scripts perigosos ou injeções de comandos.
4. **Agentes de IA e Ferramentas Automatizadas**: Chamadas de IA tentando realizar ações no disco ou disparar comandos Git não intencionais sem validação humana.

---

## 4. Fronteiras de Confiança (Trust Boundaries)

```
┌────────────────────────────────────────────────────────┐
│                   Navegador / Internet                 │
└───────────────────────────┬────────────────────────────┘
                            │ (Rejeitado por CORS & SameSite)
                            ▼
┌────────────────────────────────────────────────────────┐
│               Frontend Local (SPA / Renderer)          │
│ - Sanitização rigorosa (DOMPurify, sem atributo style) │
│ - Token de sessão efêmero no cabeçalho ou cookie       │
└───────────────────────────┬────────────────────────────┘
                            │ (API Loopback 127.0.0.1:4100)
                            ▼
┌────────────────────────────────────────────────────────┐
│            Backend Local Fastify (Node.js)             │
│ - Helmet (CSP, Referrer-Policy, Frame-Options, noSniff)│
│ - Rate Limiting & Validação de Sessão (12h TTL)        │
│ - Redação de caminhos do SO em erros 4xx/500          │
└─────────────┬───────────────────────────┬──────────────┘
              │                           │
              ▼                           ▼
┌───────────────────────────┐ ┌──────────────────────────┐
│     Git CLI Nativo        │ │ Sandbox Custom Tools     │
│ - Sem invocação de shell  │ │ - Node Permission Model  │
│ - Validação de branch/refs│ │ - Sem rede, sem Buffer   │
└───────────────────────────┘ └──────────────────────────┘
```

---

## 5. O que NÃO é Controle de Segurança (Non-Goals Explícitos)

Para garantir clareza arquitetural e evitar falsa sensação de segurança, os seguintes itens **NÃO** são considerados controles herméticos de segurança:

1. **Ofuscação via Bytenode**: A compilação V8 em bytecode (`.jsc`) adotada no instalador desktop é tratada estritamente como **ofuscação de propriedade intelectual contra visualização casual**, e **NÃO** como criptografia hermética ou defesa contra engenharia reversa especializada.
2. **Restrições de Governança Local com Clone Completo**: As regras de governança (`denied_paths`, `canAccessDocument`) regulam fluxos e permissões na interface do Context OS. Como o repositório Git reside fisicamente no disco do usuário, qualquer processo com acesso ao diretório do usuário pode ler o `.git`. A governança é uma proteção de fluxo de trabalho e conformidade, não criptografia de disco.
3. **Defesa contra Usuário Root / Administrador do SO**: Se o sistema operacional do usuário for comprometido com privilégios de root/administrador, o invasor tem acesso irrestrito à memória do processo, aos arquivos do usuário e ao cofre nativo de senhas.

---

## 6. Mecanismos de Proteção Implementados

### 6.1 Prevenção de Injeção de Comandos (Git & Shell)
- **Zero invocação de shell**: Todos os comandos Git utilizam `execFile` ou `spawn` diretamente (`shell: false`), impossibilitando injeção via quebras de aspas, ponto-e-vírgula (`;`), pipes (`|`), crases (`` ` ``) ou expansões do tipo `$(whoami)`.
- **Validação estrita de referências**: Validadores estritos (`assertBranchName`, `assertCommitish`, `assertRemoteName`, `assertGitPath`) barram injeção de flags como `--upload-pack`, `-f` ou caracteres de controle.

### 6.2 Proteção contra Ataques Baseados em Navegador
- **Content-Security-Policy (CSP)**: Implementado via `@fastify/helmet` com `default-src 'self'`.
- **CORS Estrito**: Apenas a origem do frontend configurada é permitida; tentativas de origens não autorizadas respondem com HTTP 403 Forbidden estruturado.
- **Cookies de Sessão**: O cookie `ctxos_session` utiliza `Path=/api`, `HttpOnly`, `SameSite=Strict` e tempo de expiração de 12 horas (`Max-Age=43200`) com renovação deslizante.

### 6.3 Sandbox de Custom Tools
- Ferramentas personalizadas são executadas em contexto VM hermético sem acesso a protótipos do host (`Buffer`, `process`, `fetch` desabilitados).
- Execução isolada com Node Permission Model (`--permission`) restringindo acessos a disco e proibindo child processes.
- Aprovações de ferramentas exigem cabeçalho `X-ContextOS-Confirm: <hash>` e gravam a identidade real do usuário logado (`os.userInfo().username`).

### 6.4 Privacidade LGPD e Modelos de IA
- **Classificação de Documentos**: Documentos classificados como `confidential` ou `restricted` são barrados de envio para provedores de nuvem externos (Gemini, OpenAI, Anthropic), sendo autorizados apenas para instâncias locais (Ollama/On-Premise).
- **Leitura Dinâmica**: A política é lida dinamicamente do `.project.config.json` via WorkspaceContext.
