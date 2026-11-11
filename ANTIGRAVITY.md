# Guia de Releases — Contexos (Antigravity Reference)

Este documento serve como referência rápida para o Antigravity e desenvolvedores quando for solicitada uma **nova release** do projeto.

---

## ⚡ Comando Rápido de Release

O projeto possui automação completa configurada no script `scripts/release.mjs` e integrada ao `package.json`:

```bash
# Executa os testes (verify), faz bump de versão, commit, tag e push automático para o GitHub:
npm run release
```

---

## 🔢 Como escolher o tipo de Release (SemVer)

O versionamento segue o formato **`MAJOR.MINOR.PATCH`** (Ex: `1.0.15`):

| Comando | Tipo | O que altera | Quando usar |
|---|---|---|---|
| `npm run release` ou `npm run release patch` | **PATCH** | `1.0.15` ➔ `1.0.16` | Correções de bugs, pequenas melhorias e ajustes visuais. *(Padrão)* |
| `npm run release minor` | **MINOR** | `1.0.15` ➔ `1.1.0` | Novas funcionalidades, telas ou recursos compatíveis com versões anteriores. *(Zera o patch)* |
| `npm run release major` | **MAJOR** | `1.0.15` ➔ `2.0.0` | Mudanças estruturais críticas, quebras de compatibilidade ou redesign completo. *(Zera minor e patch)* |
| `npm run release X.Y.Z` | **Explícita** | Define `X.Y.Z` | Quando for necessário forçar um número específico de versão. |

---

## 🛠️ Opções e Flags Úteis

- **Modo Simulação (sem alterar nada):**
  ```bash
  npm run release -- --dry-run
  ```
- **Criar commit e tag apenas localmente (sem push remoto):**
  ```bash
  npm run release -- --no-push
  ```
- **Pular verificação de testes em emergência:**
  ```bash
  npm run release -- --skip-verify
  ```

---

## 📋 O que o comando faz automaticamente:

1. **Validação Git**: Garante que não há arquivos desnecessários ou não commitados soltos.
2. **Quality Gates (`npm run verify`)**:
   - TypeScript do Servidor e Frontend
   - Testes unitários do Servidor e Frontend
   - Build de produção do Frontend
   - Verificação dos 7 guardas estáticos de segurança
3. **Sincronização da versão** nos 5 arquivos canônicos:
   - `package.json`
   - `desktop/package.json`
   - `frontend/package.json`
   - `server/package.json`
   - `server/src/config/constants.ts`
4. **Git Commit & Tag**: Gera commit `chore(release): bump version to X.Y.Z` e tag `vX.Y.Z`.
5. **Push & CI/CD**: Envia para a branch `main` e tag `vX.Y.Z`, disparando o workflow do GitHub Actions (`Release Desktop App`) para compilar os instaladores (Windows `.exe` e macOS `.dmg`/`.zip`).
