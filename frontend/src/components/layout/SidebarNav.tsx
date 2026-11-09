import {
  BookOpen,
  BookTemplate,
  ChevronLeft,
  Cpu,
  FileText,
  GitBranch,
  GitPullRequest,
  History,
  Settings,
  ShieldCheck,
  SpellCheck,
} from "lucide-react";
import React, { useState } from "react";

export type SubViewType =
  | "editor"
  | "edits"
  | "versions"
  | "dictionary"
  | "wiki"
  | "templates"
  | "skills"
  | "aicenter"
  | "prs"
  | "governance"
  | "settings";

export const MODULES_SIDEBAR_COLLAPSED_KEY = "spec_modules_sidebar_collapsed";

interface SidebarNavProps {
  activeView: SubViewType;
  onSelectView: (view: SubViewType) => void;
  hasUnreadWhatsNew?: boolean;
}

export const SidebarNav: React.FC<SidebarNavProps> = ({
  activeView,
  onSelectView,
  hasUnreadWhatsNew = false,
}) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(MODULES_SIDEBAR_COLLAPSED_KEY);
      return saved === "true";
    } catch {
      return false;
    }
  });

  const handleToggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(MODULES_SIDEBAR_COLLAPSED_KEY, String(next));
      } catch {}
      return next;
    });
  };

  const navItems = [
    {
      id: "editor" as SubViewType,
      label: "Documentos",
      icon: <FileText size={19} />,
      title: "Documentos",
    },
    {
      id: "versions" as SubViewType,
      label: "Versões",
      icon: <GitBranch size={19} />,
      title: "Versões",
    },
    {
      id: "edits" as SubViewType,
      label: "Edições",
      icon: <History size={19} />,
      title: "Edições",
      hasBadge: hasUnreadWhatsNew,
    },
    {
      id: "templates" as SubViewType,
      label: "Templates",
      icon: <BookTemplate size={19} />,
      title: "Templates & Assistentes de Documentos",
    },
    {
      id: "aicenter" as SubViewType,
      label: "AI Center",
      icon: <Cpu size={19} />,
      title: "AI Center: Skills, Personas, Ferramentas Nativas & MCP",
      isActive: activeView === "aicenter" || activeView === "skills",
    },
    {
      id: "prs" as SubViewType,
      label: "Revisões",
      icon: <GitPullRequest size={19} />,
      title: "Revisões e Propostas de Evolução da Documentação",
    },
    {
      id: "governance" as SubViewType,
      label: "Governança",
      icon: <ShieldCheck size={19} />,
      title: "Membros, Quórum, Proteção de Branch & Cofre de Segurança",
    },
    {
      id: "wiki" as SubViewType,
      label: "Conhecimento",
      icon: <BookOpen size={19} />,
      title: "Base de Conhecimento & Decisões",
    },
    {
      id: "dictionary" as SubViewType,
      label: "Dicionário",
      icon: <SpellCheck size={19} />,
      title: "Dicionário Ubíquo & Vocabulário Oficial",
    },
    {
      id: "settings" as SubViewType,
      label: "Configurações",
      icon: <Settings size={19} />,
      title: "Configurações do Projeto, Equipe & IA",
    },
  ];

  return (
    <aside
      className={`dash-sidebar-nav ${isCollapsed ? "collapsed" : ""}`}
      id="dash-sidebar-nav"
    >
      <div className="dash-menu">
        <div className="dash-menu-header-row">
          <span className="dash-menu-header">Módulos</span>
          <button
            id="btn-toggle-global-sidebar"
            className="dash-sidebar-toggle-top"
            aria-expanded={!isCollapsed}
            aria-label={
              isCollapsed ? "Expandir Menu Lateral" : "Recolher Menu Lateral"
            }
            title={
              isCollapsed ? "Expandir Menu Lateral" : "Recolher Menu Lateral"
            }
            onClick={handleToggleCollapse}
          >
            <span className="toggle-arrow">
              <ChevronLeft size={14} />
            </span>
          </button>
        </div>

        {navItems.map((item) => {
          const isItemActive =
            item.isActive !== undefined
              ? item.isActive
              : activeView === item.id;
          return (
            <button
              key={item.id}
              className={`dash-nav-item ${isItemActive ? "active" : ""}`}
              data-view={item.id}
              title={item.title}
              onClick={() => onSelectView(item.id)}
              style={{ position: "relative" }}
            >
              <span
                className="nav-icon"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {item.icon}
              </span>
              <span className="nav-label">{item.label}</span>
              {item.hasBadge && (
                <span
                  style={{
                    width: "7px",
                    height: "7px",
                    borderRadius: "50%",
                    backgroundColor: "#22c55e",
                    boxShadow: "0 0 6px #22c55e",
                    position: "absolute",
                    top: "50%",
                    transform: "translateY(-50%)",
                    right: "14px",
                  }}
                  title="Novidades não visualizadas!"
                />
              )}
            </button>
          );
        })}
      </div>

      <div
        className="dash-sidebar-footer"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: isCollapsed ? "10px 0" : "10px 12px",
          minHeight: "40px",
          borderTop: "1px solid var(--border-subtle, rgba(0, 0, 0, 0.08))",
        }}
      >
        {isCollapsed ? (
          <img
            src="/favicon.svg"
            alt="Contexos"
            title="Contexos"
            style={{
              width: "18px",
              height: "18px",
              objectFit: "contain",
              display: "block",
            }}
          />
        ) : (
          <img
            src="/logo.png"
            alt="contexos"
            title="contexos"
            className="dash-sidebar-logo"
            style={{
              width: "100%",
              maxWidth: "96px",
              height: "auto",
              maxHeight: "16px",
              objectFit: "contain",
              display: "block",
            }}
          />
        )}
      </div>
    </aside>
  );
};
