import React from "react";
import { AlertTriangle, History, Layers, ShieldCheck, Sparkles } from "lucide-react";

export interface CategoryMetaItem {
  label: string;
  short: string;
  badge: string;
  icon: React.ReactNode;
  color: string;
  badgeVariant: "primary" | "success" | "warning" | "danger" | "info" | "purple" | "neutral";
  desc: string;
}

export const CATEGORY_META: Record<string, CategoryMetaItem> = {
  decisions: {
    label: "Decisões Arquiteturais",
    short: "Decisões",
    badge: "ADR",
    icon: <Layers size={15} />,
    color: "var(--color-primary)",
    badgeVariant: "primary",
    desc: "Decisões técnicas e escolhas de arquitetura que definem a stack e contratos.",
  },
  _rules: {
    label: "Regras & Invariantes",
    short: "Regras",
    badge: "REGRA",
    icon: <ShieldCheck size={15} />,
    color: "var(--color-success)",
    badgeVariant: "success",
    desc: "Políticas inegociáveis de segurança, dados e qualidade seguidas em todo prompt.",
  },
  concepts: {
    label: "Conceitos & Domínio",
    short: "Conceitos",
    badge: "CONCEITO",
    icon: <Sparkles size={15} />,
    color: "#a855f7",
    badgeVariant: "purple",
    desc: "Glossário ubíquo, regras de negócio e limites de contexto do produto.",
  },
  gotchas: {
    label: "Gotchas & Armadilhas",
    short: "Gotchas",
    badge: "GOTCHA",
    icon: <AlertTriangle size={15} />,
    color: "var(--color-warning)",
    badgeVariant: "warning",
    desc: "Bugs conhecidos, armadilhas de libs e comportamentos não óbvios documentados.",
  },
  handoffs: {
    label: "Handoffs de Sessão",
    short: "Handoffs",
    badge: "HANDOFF",
    icon: <History size={15} />,
    color: "var(--color-info)",
    badgeVariant: "info",
    desc: "Passagens de bastão de contexto compiladas para continuidade entre agentes.",
  },
};

export const STARTER_TEMPLATES = [
  {
    category: "decisions",
    title: "ADR 0001: Autenticação Stateless e Segurança",
    slug: "0001-autenticacao-stateless",
    content: `## Contexto & Motivação\nA aplicação necessita de um mecanismo de autenticação seguro, escalável horizontalmente e compatível com microserviços e mobile.\n\n## Decisão Tomada\nAdotamos autenticação stateless baseada em **JWT (JSON Web Tokens)** assinados com chaves assimétricas **RSA-256 (RS256)**:\n- Tokens de acesso com TTL curto (15 minutos).\n- Refresh tokens armazenados em cookies seguros com flags \`HttpOnly\`, \`Secure\` e \`SameSite=Strict\`.\n\n## Consequências & Invariantes\n- Nenhum estado de sessão é mantido na memória dos nós de aplicação.\n- Toda rota autenticada valida a assinatura do token localmente via chave pública.`,
  },
  {
    category: "_rules",
    title: "Regra de Governança: Conformidade LGPD & Logs Sanitizados",
    slug: "regra-lgpd-sanitizacao-logs",
    content: `## Propósito\nGarantir que nenhum dado pessoal sensível (PII), chaves de API, senhas ou tokens trafeguem ou sejam persistidos em logs abertos.\n\n## Invariantes Obrigatórias\n1. **Sanitização Automática:** Todos os logs e transcrições passam por filtros de expressão regular antes de persistência no histórico.\n2. **Sem Credenciais no Código:** Segredos devem ser injetados exclusivamente via variáveis de ambiente ou Infisical.\n3. **Auditoria:** Apenas identificadores anônimos (UUID) podem ser indexados em métricas públicas.`,
  },
];

export interface WikiEntry {
  category: string;
  slug: string;
  title: string;
  content: string;
  updated_at?: string;
}
