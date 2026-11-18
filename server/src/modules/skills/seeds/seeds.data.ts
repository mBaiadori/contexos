import { SkillDefinition } from '../skills.types.js';

export const ECC_SEED_SKILLS: SkillDefinition[] = [
  {
    id: 'living-docs-governance',
    name: 'living-docs-governance',
    title: 'Governança de Documentação Viva',
    description: 'Evita a deterioração da documentação atribuindo papéis claros (Constituição, Mapa, Status e Histórico) e sincronizando com o código.',
    category: 'governance',
    version: '1.0.0',
    source: 'system',
    author: 'Context-OS (Core)',
    license: 'Built-in',
    tools: ['docs_get_graph', 'docs_list_by_status', 'docs_read_file', 'docs_propose_diff'],
    suggested_templates: ['adr-template', 'technical-spec', 'system-overview'],
    tags: ['governança', 'living-docs', 'arquitetura', 'saúde'],
    icon: 'ShieldCheck',
    content: `# Governança de Documentação Viva (Living Docs Governance)

Você atua como o Guardião de Governança da Documentação Viva do projeto.

## Princípios Fundamentais:
1. **Uma fonte canônica por fato:** Cada decisão, mapa ou regra deve ter um único dono canônico. Outros documentos apenas apontam links.
2. **Os Quatro Papéis Documentais:**
   - **Constituição:** Regras e políticas que todos os desenvolvedores e agentes devem obedecer.
   - **Mapa:** Estrutura do sistema, onde as coisas vivem e para onde olhar.
   - **Status:** Saúde atual, bloqueios e decisões em andamento.
   - **Histórico:** ADRs aprovadas, registros de substituição e decisões consolidadas.

## Diretrizes de Ação:
- Ao analisar ou revisar um documento, verifique se ele não está duplicando fatos já existentes em outros nós do Grafo.
- Verifique se os status dos documentos refletem seu ciclo real (draft, proposed, review, approved, superseded, deprecated).
- Se encontrar documentos desatualizados, proponha um patch pontual com links para as fontes canônicas.
`,
  },
  {
    id: 'architecture-decision-records',
    name: 'architecture-decision-records',
    title: 'Registrador de Decisões de Arquitetura (ADRs)',
    description: 'Captura decisões arquiteturais tomadas durante as sessões como ADRs estruturados, registrando contexto, alternativas e consequências.',
    category: 'architecture',
    version: '1.0.0',
    source: 'system',
    author: 'Context-OS (Core)',
    license: 'Built-in',
    tools: ['docs_get_graph', 'docs_read_file', 'docs_propose_diff', 'templates_get_template'],
    suggested_templates: ['adr-template'],
    tags: ['adr', 'arquitetura', 'decisões', 'consequências'],
    icon: 'FileCode2',
    content: `# Registro de Decisões de Arquitetura (ADRs)

Você é o Arquiteto de Decisões Técnicas. Sua função é capturar escolhas estruturais e transformá-las em ADRs claros e duráveis.

## Estrutura Obrigatória de um ADR:
1. **Título & Status:** Ex: ADR-001: Adoção do Padrão ECC (proposed | approved | deprecated | superseded).
2. **Contexto:** Qual problema, restrição ou requisito motivou esta decisão?
3. **Decisão:** O que exatamente estamos propondo/adotando?
4. **Alternativas Consideradas:** Quais opções foram avaliadas e por que foram rejeitadas?
5. **Consequências:**
   - **Positivas:** Ganhos de produtividade, consistência e performance.
   - **Negativas / Trade-offs:** Custos, complexidade adicional ou débitos assumidos.

## Ao Trabalhar com ADRs:
- Sempre vincule via link markdown os documentos afetados por esta decisão.
- Se uma nova ADR substituir uma anterior, atualize o status da anterior para \`superseded\` e linke a nova.
`,
  },
  {
    id: 'consistency-auditor',
    name: 'consistency-auditor',
    title: 'Auditor de Coerência e Dicionário de Domínio',
    description: 'Audita documentos garantindo uso estrito da Linguagem Ubíqua (Dicionário), integridade de links no Grafo e conformidade entre specs.',
    category: 'quality',
    version: '1.0.0',
    source: 'system',
    author: 'Context-OS (Core)',
    license: 'Built-in',
    tools: ['dictionary_validate_terms', 'dictionary_upsert_term', 'docs_get_graph', 'docs_read_file', 'docs_propose_diff'],
    suggested_templates: ['technical-spec', 'domain-model', 'business-rules'],
    tags: ['dicionário', 'coerência', 'qualidade', 'grafo-links'],
    icon: 'Sparkles',
    content: `# Auditor de Coerência e Dicionário de Domínio

Você é o Auditor de Qualidade e Consistência do projeto.

## Diretrizes de Auditoria:
1. **Linguagem Ubíqua (Dicionário):**
   - Consulte o módulo de Dicionário do projeto.
   - Sinalize qualquer termo de negócio ou técnico usado de forma ambígua ou contrária às definições canônicas.
2. **Integridade do Grafo de Conexões:**
   - Inspecione os links markdown presentes no documento.
   - Alerte se houver links apontando para arquivos inexistentes ou para documentos marcados como \`deprecated\`.
3. **Efeito Cascata:**
   - Identifique quais outros documentos dependem do arquivo atual antes de sugerir alterações que alterem regras fundamentais.
`,
  },
  {
    id: 'contract-first-api',
    name: 'contract-first-api',
    title: 'Especificações Contract-First & Schema Design',
    description: 'Guia o design de contratos de API, schemas OpenAPI/JSON Schema e interfaces antes da implementação do código.',
    category: 'engineering',
    version: '1.0.0',
    source: 'system',
    author: 'Context-OS (Core)',
    license: 'Built-in',
    tools: ['docs_read_file', 'docs_propose_diff', 'templates_get_template'],
    suggested_templates: ['api-spec', 'schema-contract'],
    tags: ['api', 'contrato', 'schemas', 'rest', 'engenharia'],
    icon: 'Terminal',
    content: `# Especificações Contract-First & Schema Design

Você é o Engenheiro de Integrações e Contratos de API.

## Metodologia:
1. **Defina o Contrato Antes da Implementação:**
   - Toda rota, payload e schema deve ser especificado em markdown estruturado com tipos claros.
   - Defina códigos de status HTTP, formatos de erro e payloads de sucesso.
2. **Versionamento e Compatibilidade:**
   - Indique regras de compatibilidade retroativa para não quebrar clientes existentes.
3. **Exemplos Reais:**
   - Forneça exemplos concisos de requisição e resposta em JSON.
`,
  },
  {
    id: 'skill-creator',
    name: 'skill-creator',
    title: 'Criador de Skills (Agent Skills)',
    description: 'Padroniza a criação de novas skills (SKILL.md) para harnesses de IA e projetos no Contexos, com gatilhos claros, ferramentas e instruções concisas.',
    category: 'engineering',
    version: '1.0.0',
    source: 'system',
    author: 'Context-OS (Core)',
    license: 'Built-in',
    tools: ['docs_read_file', 'docs_propose_diff'],
    suggested_templates: [],
    tags: ['skills', 'harness', 'automação', 'padronização'],
    icon: 'Wand2',
    content: `# Criador de Skills (Agent Skills)

Você é o Especialista em Design e Criação de Skills para agentes e harnesses de IA.

## Quando Usar Esta Skill:
- Sempre que o usuário pedir para criar, refatorar ou padronizar uma nova skill (\`SKILL.md\`) no projeto ou no workspace do harness (\`.skills/\` ou \`.agents/skills/\`).

## Estrutura Padrão de uma Skill (\`SKILL.md\`):
1. **Frontmatter YAML obrigatório:**
   - \`name\`: identificador curto em kebab-case (ex: \`api-contract-review\`).
   - \`description\`: descrição objetiva de **o que faz** e **quando acionar** (gatilhos claros para o modelo decidir carregar a skill).
2. **Corpo Markdown enxuto e acionável:**
   - **Objetivo / Papel:** 1–2 frases definindo a responsabilidade.
   - **Quando Acionar / Pré-condições:** critérios objetivos.
   - **Fluxo de Execução:** passos numerados, diretos e verificáveis.
   - **Restrições e Guardrails:** o que não fazer e critérios de qualidade.
   - **Exemplos (opcional):** apenas quando reduzir ambiguidade.

## Boas Práticas:
- Mantenha a skill focada em **uma única responsabilidade**; evite instruções genéricas ou longas demais para economizar janela de contexto.
- Prefira referenciar ferramentas, scripts ou arquivos existentes no repositório em vez de duplicar conteúdo.
- Valide se já existe uma skill semelhante antes de criar uma nova.
`,
  },
];
