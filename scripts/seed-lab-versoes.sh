#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# Script Gerador do Repositório de Laboratório de Versões (eNurse / lab-versoes)
# Uso: ./scripts/seed-lab-versoes.sh [caminho_opcional]
# ==============================================================================

WORKSPACE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${1:-$WORKSPACE_ROOT/projects/enursy/lab-versoes}"

echo "🚀 Iniciando criação do repositório de laboratório em:"
echo "   $TARGET_DIR"

# 1. Limpeza preventiva
if [ -d "$TARGET_DIR" ]; then
  echo "🧹 Removendo instalação anterior de $TARGET_DIR..."
  rm -rf "$TARGET_DIR"
fi

# Remove também se existir pasta órfã no topo de projects/
if [ -d "$WORKSPACE_ROOT/projects/lab-versoes" ]; then
  echo "🧹 Removendo pasta órfã $WORKSPACE_ROOT/projects/lab-versoes..."
  rm -rf "$WORKSPACE_ROOT/projects/lab-versoes"
fi

mkdir -p "$TARGET_DIR"
cd "$TARGET_DIR"

# 2. Inicialização do Git
git init -b main
git config user.name "Marcos Baiadori"
git config user.email "marcos@enursy.com"

# 3. Copiar ou gerar .project.config.json para conformidade do Context OS
if [ -f "$WORKSPACE_ROOT/projects/enursy/engenharia/.project.config.json" ]; then
  cp "$WORKSPACE_ROOT/projects/enursy/engenharia/.project.config.json" .
else
  cat << 'EOF' > .project.config.json
{
  "categories": [
    { "name": "produtos", "color": "#22c55e" },
    { "name": "infra", "color": "#8b5cf6" },
    { "name": "clinico", "color": "#06b6d4" }
  ],
  "badges": [
    { "name": "ADR", "color": "#3b82f6" },
    { "name": "HOTFIX", "color": "#ef4444" },
    { "name": "GOV", "color": "#f59e0b" }
  ],
  "tags": [
    { "name": "hardware", "color": "#f97316" },
    { "name": "ai", "color": "#ec4899" },
    { "name": "telemetria", "color": "#10b981" }
  ],
  "statuses": [
    { "name": "Em Análise", "color": "#eab308" },
    { "name": "Aprovado", "color": "#22c55e" },
    { "name": "Rejeitado", "color": "#ef4444" }
  ]
}
EOF
fi

cat << 'EOF' > .gitignore
node_modules/
dist/
.DS_Store
*.log
EOF

# ==============================================================================
# 4. Tronco Base (main) - Commits Fundacionais
# ==============================================================================
echo "==> Criando commits fundacionais no tronco main..."

echo "# Laboratório de Teste de Versões - eNurse" > README.md
echo "Ambiente de simulação avançada de branches, merges e governança clínica." >> README.md
git add .
git commit -m "feat: estrutura inicial do projeto eNurse"
COMMIT_ROOT=$(git rev-parse HEAD)

echo "export const Auth = { roles: ['doctor', 'nurse', 'admin', 'regulator'] };" > auth.ts
git add auth.ts
git commit -m "feat(auth): módulo de autenticação e perfis de acesso"
COMMIT_AUTH=$(git rev-parse HEAD)

echo "export const Medicine = { catalogVersion: '2026.1', units: ['mg', 'ml', 'mcg'] };" > medicine.ts
git add medicine.ts
git commit -m "feat(catalogo): catálogo de medicamentos e dosagens"
COMMIT_MEDICINE=$(git rev-parse HEAD)

echo "export const Treatment = { protocols: ['sedation', 'hydration', 'chemo'] };" > treatment.ts
git add treatment.ts
git commit -m "docs(iot): especificações de tratamento e telemetria de leito"
COMMIT_TREATMENT=$(git rev-parse HEAD)

echo "export const Sensors = { samplingRateHz: 50, scalePrecisionGrams: 0.1 };" > sensors.ts
git add sensors.ts
git commit -m "feat(sensores): integração com sensores de pesagem e volume"
COMMIT_SENSORS=$(git rev-parse HEAD)

# ==============================================================================
# 5. Cenário Específico: 2 Commits de uma Branch que viram Novas Branches!
#    Tronco da branch: gov/regras-dispensacao
#    - Commit 1 -> vira a branch gov/sub-regra-pediatrica
#    - Commit 2 -> vira a branch gov/regras-dispensacao-alertas
# ==============================================================================
echo "==> Criando cenário de múltiplos commits ramificando em sub-branches..."

git checkout -b gov/regras-dispensacao "$COMMIT_MEDICINE"
git config branch.gov/regras-dispensacao.parent "main"

# Commit 1 na branch gov/regras-dispensacao
echo "export const DosageValidation = { maxParacetamolMgPerDay: 4000 };" > regras.ts
git add regras.ts
git commit -m "feat(regras): validação de dosagem máxima diária"
COMMIT_REGRA_1=$(git rev-parse HEAD)

# Ramificação A partindo do Commit 1:
git checkout -b gov/sub-regra-pediatrica "$COMMIT_REGRA_1"
git config branch.gov/sub-regra-pediatrica.parent "gov/regras-dispensacao"
echo "export const PediatricDosageCurve = { ageMonthsThreshold: 24, factor: 0.35 };" > pediatria.ts
git add pediatria.ts
git commit -m "feat(pediatria): curva de atenuação para dosagem pediátrica"

# Retorna para gov/regras-dispensacao para o Commit 2:
git checkout gov/regras-dispensacao
echo "export const ScheduleLock = { blockOutsideShiftHours: true };" >> regras.ts
git add regras.ts
git commit -m "feat(regras): trava de segurança de horário de medicação"
COMMIT_REGRA_2=$(git rev-parse HEAD)

# Ramificação B partindo do Commit 2:
git checkout -b gov/regras-dispensacao-alertas "$COMMIT_REGRA_2"
git config branch.gov/regras-dispensacao-alertas.parent "gov/regras-dispensacao"
echo "export const BedNotification = { visualBlink: true, sirenDecibels: 65 };" > alerts.ts
git add alerts.ts
git commit -m "feat(alertas): notificação sonora e push no tablet do leito"
echo "export const NurseWebhook = { endpoint: 'https://pager.enurse.internal/v1/notify' };" >> alerts.ts
git add alerts.ts
git commit -m "feat(alertas): webhook de urgência para equipe plantonista"

# Sub-ramificação Lv3 de Alertas (Alertas Críticos):
git checkout -b gov/regras-dispensacao-alertas-criticos gov/regras-dispensacao-alertas
git config branch.gov/regras-dispensacao-alertas-criticos.parent "gov/regras-dispensacao-alertas"
echo "export const AnaphylaxisSiren = { continuousLoop: true };" > alerts_criticos.ts
git add alerts_criticos.ts
git commit -m "feat(criticos): sirene em caso de anafilaxia detectada"
echo "export const EmergencyBypass = { overridePinRequired: true };" >> alerts_criticos.ts
git add alerts_criticos.ts
git commit -m "feat(criticos): protocolo de bypass de emergência médica"
echo "export const MqttConfig = { latencyMs: 25, qos: 2 };" >> alerts_criticos.ts
git add alerts_criticos.ts
git commit -m "fix(criticos): ajuste de latência ultra-baixa no broker MQTT"

# ==============================================================================
# 6. Merges no Tronco Principal (Nível 1, Nível 2 e Nível 3)
# ==============================================================================
echo "==> Criando e mergeando branches no tronco main..."

# 6.1 Merge Lv1 (Hotfix simples)
git checkout -b gov/correcao-bug-dosagem "$COMMIT_MEDICINE"
git config branch.gov/correcao-bug-dosagem.parent "main"
echo "export const PEDIATRIC_FLOAT_PRECISION = 4;" > dosagem_fix.ts
git add dosagem_fix.ts
git commit -m "fix(dosagem): precisão de ponto flutuante em bombas volumétricas"
git checkout main
git merge --no-ff gov/correcao-bug-dosagem -m "Merge branch 'gov/correcao-bug-dosagem'"

# 6.2 Merge Lv1 (Prescrição eletrônica com múltiplos commits)
git checkout -b gov/prescricao-eletronica main
git config branch.gov/prescricao-eletronica.parent "main"
echo "export const PRESCRICAO_DIGITAL = { standard: 'CFM_ICP_BRASIL' };" > prescricao.ts
git add prescricao.ts
git commit -m "feat(prescricao): assinatura digital de receitas médicas"
echo "export const PROTOCOLOS_INTERNACAO = ['UTI', 'Enfermaria', 'Ambulatorio'];" >> prescricao.ts
git add prescricao.ts
git commit -m "feat(prescricao): validação de protocolos clínicos por ala hospitalar"
git checkout main
git merge --no-ff gov/prescricao-eletronica -m "Merge branch 'gov/prescricao-eletronica'"

# 6.3 Merge Lv1 (Triagem Manchester)
git checkout -b gov/modulo-triagem main
git config branch.gov/modulo-triagem.parent "main"
echo "export const PROTOCOLO_MANCHESTER = { cores: ['Vermelho', 'Laranja', 'Amarelo', 'Verde', 'Azul'] };" > triagem.ts
git add triagem.ts
git commit -m "feat(triagem): implementação do protocolo de Manchester"
git checkout main
git merge --no-ff gov/modulo-triagem -m "Merge branch 'gov/modulo-triagem'"

# 6.4 Cadeia Profunda com MERGE DE NÍVEL 3 (Bomba de Infusão: Lv1 -> Lv2 -> Lv3 -> Merge na main)
COMMIT_PRE_BOMBA=$(git rev-parse HEAD)
git checkout -b gov/bomba-infusao "$COMMIT_PRE_BOMBA"
git config branch.gov/bomba-infusao.parent "main"
echo "export const BOMBA_INFUSAO_DRIVERS = ['Alaris', 'B_Braun', 'Fresenius'];" > bomba.ts
git add bomba.ts
git commit -m "feat(bomba): drivers universais para bombas de infusão contínua"
echo "export const LIMITE_BOLUS_ML = 5.0;" >> bomba.ts
git add bomba.ts
git commit -m "feat(bomba): teto de proteção contra bolus acidental"

git checkout -b gov/bomba-infusao-protocolo-seringas gov/bomba-infusao
git config branch.gov/bomba-infusao-protocolo-seringas.parent "gov/bomba-infusao"
echo "export const CALIBRE_SERINGAS_MM = [10, 20, 50];" > seringas.ts
git add seringas.ts
git commit -m "feat(seringas): reconhecimento automático de êmbolo óptico"

git checkout -b gov/bomba-infusao-seguranca-anti-bolhas gov/bomba-infusao-protocolo-seringas
git config branch.gov/bomba-infusao-seguranca-anti-bolhas.parent "gov/bomba-infusao-protocolo-seringas"
echo "export const ULTRASSOM_AR_DETECTOR = { thresholdMicroliters: 15 };" > bolhas.ts
git add bolhas.ts
git commit -m "feat(seguranca): sensor piezoelétrico ultrassônico anti-êmbolo gasoso"
echo "export const PARADA_IMEDIATA_EMERGENCIA = true;" >> bolhas.ts
git add bolhas.ts
git commit -m "feat(seguranca): acionamento de corte eletromecânico em microsegundos"

# Merge Lv3 no main!
git checkout main
git merge --no-ff gov/bomba-infusao-seguranca-anti-bolhas -m "Merge branch 'gov/bomba-infusao-seguranca-anti-bolhas'"

# Merge da cadeia de Alertas Críticos (Lv3) no main!
git checkout main
git merge --no-ff gov/regras-dispensacao-alertas-criticos -m "Merge branch 'gov/regras-dispensacao-alertas-criticos'"

# ==============================================================================
# 7. Cadeia Profunda até NÍVEL 5 (Tele-Cirurgia Robótica)
# ==============================================================================
echo "==> Criando hierarquia profunda até Lv5 (Tele-Cirurgia)..."

# Lv1
git checkout -b gov/tele-cirurgia main
git config branch.gov/tele-cirurgia.parent "main"
echo "export const ROBO_CIRURGIA_MODELO = 'DaVinci_Xi_Bridge';" > cirurgia.ts
git add cirurgia.ts
git commit -m "feat(cirurgia): barramento de comunicação do console cirúrgico"

# Lv2
git checkout -b gov/tele-cirurgia-video-4k gov/tele-cirurgia
git config branch.gov/tele-cirurgia-video-4k.parent "gov/tele-cirurgia"
echo "export const STREAM_CODEC = 'HEVC_10BIT_60FPS';" > video4k.ts
git add video4k.ts
git commit -m "feat(video): pipeline de streaming endoscópico 3D 4K"
echo "export const LATENCIA_ALVO_MS = 12;" >> video4k.ts
git add video4k.ts
git commit -m "feat(video): buffer adaptativo para evitar jitter de quadros"

# Lv3 (Filha 1 de Lv2)
git checkout -b gov/tele-cirurgia-latencia-zero gov/tele-cirurgia-video-4k
git config branch.gov/tele-cirurgia-latencia-zero.parent "gov/tele-cirurgia-video-4k"
echo "export const UDP_FAST_PATH = true;" > fastpath.ts
git add fastpath.ts
git commit -m "feat(rede): rota prioritária SD-WAN hospitalar com QoS nível militar"

# Lv3 (Filha 2 de Lv2 - Leque em Lv3!)
git checkout -b gov/tele-cirurgia-overlay-ar gov/tele-cirurgia-video-4k
git config branch.gov/tele-cirurgia-overlay-ar.parent "gov/tele-cirurgia-video-4k"
echo "export const MAPPING_ORGAOS_3D = true;" > ar_overlay.ts
git add ar_overlay.ts
git commit -m "feat(ar): projeção holográfica de tomografia pré-operatória sobre o tecido"

# Lv4 (Filha de gov/tele-cirurgia-latencia-zero)
git checkout -b gov/tele-cirurgia-haptica-tatil gov/tele-cirurgia-latencia-zero
git config branch.gov/tele-cirurgia-haptica-tatil.parent "gov/tele-cirurgia-latencia-zero"
echo "export const RESISTENCIA_TECIDO_NEWTONS = { min: 0.1, max: 12.0 };" > haptico.ts
git add haptico.ts
git commit -m "feat(haptica): sensor de micro-força de tração com resposta nos joysticks"

# Lv5 (Filha de gov/tele-cirurgia-haptica-tatil)
git checkout -b gov/tele-cirurgia-failover-satelite gov/tele-cirurgia-haptica-tatil
git config branch.gov/tele-cirurgia-failover-satelite.parent "gov/tele-cirurgia-haptica-tatil"
echo "export const STARLINK_HEALTHCARE_LINK = { fallbackAutoMs: 50 };" > satelite.ts
git add satelite.ts
git commit -m "feat(failover): redundância automática por constelação LEO de satélites"
echo "export const MODO_AUTONOMO_SEGURANCA = true;" >> satelite.ts
git add satelite.ts
git commit -m "feat(failover): pinçamento automático e travamento em caso de perda total"

# ==============================================================================
# 8. Cadeia de Cadeia de Frio (Estoque e Sensores) com Merge de Nível 4 no Tronco
# ==============================================================================
echo "==> Criando cadeia de estoque térmico (Lv1 -> Lv4) e mergeando na main..."

git checkout -b gov/estoque-farmacia "$COMMIT_MEDICINE"
git config branch.gov/estoque-farmacia.parent "main"
echo "export const ESTOQUE_MINIMO = 50;" > estoque.ts
git add estoque.ts
git commit -m "feat(estoque): controle de saldo mínimo por farmácia satélite"

git checkout -b gov/estoque-farmacia-termolabeis gov/estoque-farmacia
git config branch.gov/estoque-farmacia-termolabeis.parent "gov/estoque-farmacia"
echo "export const FAIXA_TEMPERATURA = { min: 2, max: 8 };" > termolabeis.ts
git add termolabeis.ts
git commit -m "feat(termolabeis): controle de cadeia de frio (2°C a 8°C)"

git checkout -b gov/estoque-farmacia-termolabeis-sensores gov/estoque-farmacia-termolabeis
git config branch.gov/estoque-farmacia-termolabeis-sensores.parent "gov/estoque-farmacia-termolabeis"
echo "export const PROTOCOLO_IOT_BLE = 'Nordic_UART';" > sensores_frio.ts
git add sensores_frio.ts
git commit -m "feat(sensores): telemetria BLE de temperatura e umidade"

git checkout -b gov/estoque-farmacia-termolabeis-sensores-calibracao gov/estoque-farmacia-termolabeis-sensores
git config branch.gov/estoque-farmacia-termolabeis-sensores-calibracao.parent "gov/estoque-farmacia-termolabeis-sensores"
echo "export const LAUDO_INMETRO = 'BR-CAL-2026-99';" > calib.ts
git add calib.ts
git commit -m "feat(calibracao): validação periódica de termômetros certificados"

# Merge Lv4 na main
git checkout main
git merge --no-ff gov/estoque-farmacia-termolabeis-sensores-calibracao -m "Merge branch 'gov/estoque-farmacia-termolabeis-sensores-calibracao'"

# ==============================================================================
# 9. Leque de Branches (Rastreabilidade RFID com 3 sub-galhos paralelos)
# ==============================================================================
echo "==> Criando leque de branches RFID..."

git checkout -b gov/rastreabilidade-rfid "$COMMIT_MEDICINE"
git config branch.gov/rastreabilidade-rfid.parent "main"
echo "export const EPC_GEN2_STANDARD = true;" > rfid.ts
git add rfid.ts
git commit -m "feat(rfid): suporte a tags EPCglobal UHF Gen2"

git checkout -b gov/rastreabilidade-rfid-antenas gov/rastreabilidade-rfid
git config branch.gov/rastreabilidade-rfid-antenas.parent "gov/rastreabilidade-rfid"
echo "export const ANTENAS_PORTICO = 4;" > antenas.ts
git add antenas.ts
git commit -m "feat(antenas): posicionamento de pórticos inteligentes"

git checkout -b gov/rastreabilidade-rfid-etiquetas gov/rastreabilidade-rfid
git config branch.gov/rastreabilidade-rfid-etiquetas.parent "gov/rastreabilidade-rfid"
echo "export const CHIP_CRYPTO = 'NXP_UCODE';" > etiquetas.ts
git add etiquetas.ts
git commit -m "feat(etiquetas): codificação anti-clonagem de frascos"

git checkout -b gov/rastreabilidade-rfid-leitor-portatil gov/rastreabilidade-rfid
git config branch.gov/rastreabilidade-rfid-leitor-portatil.parent "gov/rastreabilidade-rfid"
echo "export const ZEBRA_SDK = 'v2.4';" > coletor.ts
git add coletor.ts
git commit -m "feat(coletor): integração com leitores móveis Zebra"

# ==============================================================================
# 10. Commits Intermediários Ramificados (HL7 FHIR com 5 etapas)
# ==============================================================================
echo "==> Criando branch FHIR de 5 commits e derivando sub-branches intermediárias..."

git checkout -b gov/integracao-hl7-fhir main
git config branch.gov/integracao-hl7-fhir.parent "main"
COMMIT_FHIR_2=""
COMMIT_FHIR_4=""

for i in 1 2 3 4 5; do
  echo "export const HL7_STEP_$i = { active: true, step: $i };" >> fhir.ts
  git add fhir.ts
  git commit -m "feat(fhir): recurso FHIR R4 etapa $i"
  if [ "$i" -eq 2 ]; then
    COMMIT_FHIR_2=$(git rev-parse HEAD)
  elif [ "$i" -eq 4 ]; then
    COMMIT_FHIR_4=$(git rev-parse HEAD)
  fi
done

git checkout -b gov/fhir-conversor-v2 "$COMMIT_FHIR_2"
git config branch.gov/fhir-conversor-v2.parent "gov/integracao-hl7-fhir"
echo "export const CONVERSOR_HL7_LEGACY = true;" > legacy_hl7.ts
git add legacy_hl7.ts
git commit -m "feat(conversor): parser de mensagens HL7 v2.5 piped para JSON FHIR"

git checkout -b gov/fhir-validador-schemas "$COMMIT_FHIR_4"
git config branch.gov/fhir-validador-schemas.parent "gov/integracao-hl7-fhir"
echo "export const FHIR_STRUCTURE_DEFINITION_URL = 'http://hl7.org/fhir/R4/';" > validator.ts
git add validator.ts
git commit -m "feat(validador): checagem de conformidade com schemas oficiais HL7 R4"

# ==============================================================================
# 11. Commits Avançados no Tronco Principal e Rascunho Stash
# ==============================================================================
echo "==> Avançando tronco main e gerando rascunho de trabalho (stash)..."

git checkout main
echo "export const IA_RISCO_SEPSE_MODEL = 'XGBoost_v3.2';" > sepse.ts
git add sepse.ts
git commit -m "feat(ia): modelo preditivo de sepse precoce em leitos de UTI (qSOFA)"

echo "export const ASSINATURA_ICP_BRASIL_A3 = true;" > icp.ts
git add icp.ts
git commit -m "feat(seguranca): integração com token A3/A4 ICP-Brasil para médicos"

# Gerar rascunho para visualização de Stash na árvore de versões
echo "// Rascunho não finalizado de integração biométrica" >> auth.ts
git stash push -m "WIP: rascunho de leitor biométrico à beira de leito"

# ==============================================================================
# 12. Metadados de Governança (.spec-memory/prs.json)
# ==============================================================================
echo "==> Gerando propostas e badges de governança em .spec-memory/prs.json..."
mkdir -p .spec-memory

cat << 'EOF' > .spec-memory/prs.json
[
  {
    "id": 1,
    "github_id": 9001,
    "github_number": 1,
    "repo_name": "lab-versoes",
    "title": "feat(tele-cirurgia): barramento de controle de tele-cirurgia robótica",
    "description": "Proposta de arquitetura de tele-cirurgia com latência zero e redundância por satélite LEO.",
    "branch": "gov/tele-cirurgia",
    "target_branch": "main",
    "status": "OPEN",
    "created_at": "2026-11-04T10:00:00Z",
    "author": "@mBaiadori",
    "approvals": [
      {
        "user": "@karlacbsantana-png",
        "role": "Engenheiro / Revisor",
        "timestamp": "2026-11-04T10:15:00Z",
        "status": "APPROVED",
        "comment": "Protocolo de telemetria validado conforme RDC 304."
      }
    ],
    "type": "feat",
    "layer": "Engenharia",
    "domain": "Telemedicina",
    "html_url": "https://github.com/enursy/lab-versoes/pull/1"
  },
  {
    "id": 2,
    "github_id": 9002,
    "github_number": 2,
    "repo_name": "lab-versoes",
    "title": "feat(regras): validação estrita de dosagem máxima diária",
    "description": "Trava de segurança para impedir prescrições com dosagem acumulada acima do limite aceito.",
    "branch": "gov/regras-dispensacao",
    "target_branch": "main",
    "status": "APPROVED",
    "created_at": "2026-11-04T10:20:00Z",
    "author": "@mBaiadori",
    "approvals": [
      {
        "user": "@mBaiadori",
        "role": "Tech Lead",
        "timestamp": "2026-11-04T10:30:00Z",
        "status": "APPROVED",
        "comment": "Curvas de dosagem aprovadas pela comissão médica."
      }
    ],
    "type": "feat",
    "layer": "Clínico",
    "domain": "Farmácia",
    "html_url": "https://github.com/enursy/lab-versoes/pull/2"
  },
  {
    "id": 3,
    "github_id": 9003,
    "github_number": 3,
    "repo_name": "lab-versoes",
    "title": "feat(bomba): sensor piezoelétrico ultrassônico anti-bolhas",
    "description": "Sistema de corte imediato de infusão com detecção de micro-bolhas de ar.",
    "branch": "gov/bomba-infusao-seguranca-anti-bolhas",
    "target_branch": "main",
    "status": "MERGED",
    "created_at": "2026-11-04T09:00:00Z",
    "merged_at": "2026-11-04T09:45:00Z",
    "closed_at": "2026-11-04T09:45:00Z",
    "author": "@mBaiadori",
    "approvals": [],
    "type": "feat",
    "layer": "Hardware",
    "domain": "Segurança",
    "html_url": "https://github.com/enursy/lab-versoes/pull/3"
  },
  {
    "id": 4,
    "github_id": 9004,
    "github_number": 4,
    "repo_name": "lab-versoes",
    "title": "feat(rfid): rastreamento de bolsas de sangue e frascos por radiofrequência",
    "description": "Implantação de antenas inteligentes nos pórticos da farmácia hospitalar.",
    "branch": "gov/rastreabilidade-rfid",
    "target_branch": "main",
    "status": "DRAFT",
    "created_at": "2026-11-04T11:00:00Z",
    "author": "@mBaiadori",
    "approvals": [],
    "type": "feat",
    "layer": "IoT",
    "domain": "Logística",
    "html_url": "https://github.com/enursy/lab-versoes/pull/4"
  }
]
EOF

echo ""
echo "✅ Repositório de laboratório gerado com sucesso em:"
echo "   $TARGET_DIR"
echo ""
echo "📊 Resumo da estrutura de ramos (git branch):"
git branch -v
echo ""
echo "📈 Grafo consolidado (git log --graph --oneline --all -n 25):"
git log --graph --oneline --all --decorate -n 25
