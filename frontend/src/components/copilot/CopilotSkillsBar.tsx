import React, { useState, useRef, useEffect } from "react";

interface CopilotSkillsBarProps {
  templateSkills: string[];
  activeSkillIds: string[];
  extraActiveSkills: string[];
  availableSkills: Array<{ id: string; name?: string; title?: string; [key: string]: unknown }>;
  onToggleSkill: (id: string) => void;
  onRemoveActiveSkill: (id: string) => void;
  onClearAllSkills: () => void;
  onOpenSkillsHub: () => void;
}

export const CopilotSkillsBar: React.FC<CopilotSkillsBarProps> = ({
  templateSkills,
  activeSkillIds,
  extraActiveSkills,
  availableSkills,
  onToggleSkill,
  onRemoveActiveSkill,
  onClearAllSkills,
  onOpenSkillsHub,
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getSkillTitle = (id: string) => {
    const s = availableSkills.find((item) => item.id === id);
    return s?.title || s?.name || id;
  };

  return (
    <div
      ref={dropdownRef}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: "5px",
        flexWrap: "wrap",
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "3px",
          fontSize: "10.5px",
          fontWeight: 600,
          color: "var(--color-on-surface-variant, #475569)",
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{
            fontSize: "14px",
            color: "var(--color-primary, #2563eb)",
          }}
        >
          auto_awesome
        </span>
        <span>Skills:</span>
      </div>

      {/* 1. Template Skills: rendered just like Template Prompts with 1-click toggle */}
      {templateSkills.map((skillId) => {
        const isSkillActive = activeSkillIds.includes(skillId);
        const skillName = getSkillTitle(skillId);
        return (
          <button
            key={`tpl-skill-${skillId}`}
            type="button"
            onClick={() => onToggleSkill(skillId)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "2px 8px",
              borderRadius: "12px",
              border: "1px solid",
              fontSize: "10.5px",
              fontWeight: 600,
              cursor: "pointer",
              background: isSkillActive
                ? "var(--color-primary-container, #eff6ff)"
                : "var(--color-surface-container, #f1f5f9)",
              color: isSkillActive
                ? "var(--color-primary, #1d4ed8)"
                : "var(--text-muted, #64748b)",
              borderColor: isSkillActive
                ? "var(--color-primary, #3b82f6)"
                : "var(--color-outline-variant, #cbd5e1)",
              transition: "all 0.15s ease",
              maxWidth: "150px",
            }}
            title={
              isSkillActive
                ? `Skill do Template Ativa: ${skillName}. Clique para desativar.`
                : `Skill do Template Desativada: ${skillName}. Clique para ativar.`
            }
          >
            <span
              className="material-symbols-outlined"
              style={{
                fontSize: "13px",
                color: isSkillActive ? "#10b981" : "#94a3b8",
                flexShrink: 0,
              }}
            >
              {isSkillActive ? "check_circle" : "radio_button_unchecked"}
            </span>
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {skillName}
            </span>
          </button>
        );
      })}

      {/* 2. Extra Active Skills (Added by user that are not in templateSkills) */}
      {extraActiveSkills.map((skillId) => {
        const skillName = getSkillTitle(skillId);
        return (
          <div
            key={`extra-skill-${skillId}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              borderRadius: "12px",
              background: "var(--color-primary-container, #d2e3fc)",
              border: "1px solid var(--color-primary, #1a73e8)",
              overflow: "hidden",
            }}
          >
            <span
              style={{
                padding: "2px 6px 2px 8px",
                fontSize: "10.5px",
                fontWeight: 600,
                color: "var(--color-on-primary-container, #041e49)",
                maxWidth: "120px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={`Skill extra ativa: ${skillName}`}
            >
              {skillName}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemoveActiveSkill(skillId);
              }}
              title={`Remover skill ${skillName}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "2px 5px",
                border: "none",
                borderLeft: "1px solid rgba(26,115,232,0.3)",
                background: "rgba(255,255,255,0.4)",
                color: "var(--color-on-primary-container, #041e49)",
                cursor: "pointer",
                height: "100%",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "rgba(239,68,68,0.15)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "rgba(255,255,255,0.4)")
              }
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "12px" }}
              >
                close
              </span>
            </button>
          </div>
        );
      })}

      {/* 3. Add Skill Button / Trigger */}
      <button
        type="button"
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "2px",
          padding: "2px 7px",
          borderRadius: "12px",
          fontSize: "10.5px",
          fontWeight: 600,
          cursor: "pointer",
          background: "var(--color-surface-container, #f1f5f9)",
          color: "var(--color-primary, #2563eb)",
          border: "1px dashed var(--color-outline-variant, #cbd5e1)",
          transition: "all 0.15s ease",
        }}
        title="Adicionar ou alternar outras skills para a conversa no popover"
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: "13px" }}
        >
          add
        </span>
        <span>Skill</span>
      </button>

      {/* 4. Skills Dropdown Menu */}
      {isDropdownOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 1100,
            width: "290px",
            background: "var(--color-surface, #ffffff)",
            border: "1px solid var(--color-outline-variant, #cbd5e1)",
            borderRadius: "10px",
            boxShadow: "0 10px 28px rgba(0, 0, 0, 0.18)",
            padding: "8px",
            display: "flex",
            flexDirection: "column",
            gap: "6px",
            maxHeight: "360px",
            overflowY: "auto",
            animation: "fadeIn 0.12s ease-out",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "3px 6px 6px 6px",
              borderBottom: "1px solid #f1f5f9",
              fontSize: "11px",
              fontWeight: 600,
              color: "#334155",
            }}
          >
            <span>Skills de Contexto / Chat</span>
            <span
              style={{
                fontSize: "9.5px",
                padding: "1px 5px",
                borderRadius: "4px",
                background:
                  activeSkillIds.length > 0
                    ? "rgba(16,185,129,0.12)"
                    : "#f1f5f9",
                color: activeSkillIds.length > 0 ? "#059669" : "#64748b",
                fontWeight: 700,
              }}
            >
              {activeSkillIds.length > 0
                ? `${activeSkillIds.length} ATIVA(S)`
                : "DESATIVADAS"}
            </span>
          </div>

          {/* Option: Deactivate all skills if any active */}
          {activeSkillIds.length > 0 && (
            <button
              type="button"
              onClick={onClearAllSkills}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "5px 8px",
                borderRadius: "6px",
                border: "1px solid #fca5a5",
                background: "#fef2f2",
                color: "#dc2626",
                cursor: "pointer",
                fontSize: "11px",
                textAlign: "left",
                transition: "background 0.12s ease",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: "14px", color: "#dc2626" }}
                >
                  block
                </span>
                <span style={{ fontWeight: 600 }}>
                  Desativar Todas as Skills
                </span>
              </div>
            </button>
          )}

          {/* Section: Template Skills if available */}
          {templateSkills.length > 0 && (
            <>
              <div
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  color: "#94a3b8",
                  textTransform: "uppercase",
                  padding: "4px 6px 2px",
                }}
              >
                Skills do Template
              </div>
              {templateSkills.map((skillId) => {
                const isSelected = activeSkillIds.includes(skillId);
                const skillName = getSkillTitle(skillId);
                return (
                  <button
                    key={`dropdown-tpl-skill-${skillId}`}
                    type="button"
                    onClick={() => onToggleSkill(skillId)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "5px 8px",
                      borderRadius: "6px",
                      border: isSelected
                        ? "1px solid var(--color-primary, #2563eb)"
                        : "1px solid transparent",
                      background: isSelected
                        ? "var(--color-primary-container, #eff6ff)"
                        : "transparent",
                      color: isSelected
                        ? "var(--color-primary, #1d4ed8)"
                        : "var(--color-on-surface, #1e293b)",
                      cursor: "pointer",
                      fontSize: "11px",
                      textAlign: "left",
                      transition: "background 0.12s ease",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        overflow: "hidden",
                      }}
                    >
                      <span
                        className="material-symbols-outlined"
                        style={{
                          fontSize: "14px",
                          color: isSelected
                            ? "var(--color-primary, #2563eb)"
                            : "var(--text-muted, #94a3b8)",
                        }}
                      >
                        {isSelected
                          ? "check_circle"
                          : "radio_button_unchecked"}
                      </span>
                      <span
                        style={{
                          fontWeight: isSelected ? 600 : 400,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {skillName}
                      </span>
                    </div>
                  </button>
                );
              })}
            </>
          )}

          {/* Section: Extra / Available Skills */}
          <div
            style={{
              fontSize: "10px",
              fontWeight: 700,
              color: "#94a3b8",
              textTransform: "uppercase",
              padding: "4px 6px 2px",
              borderTop: "1px solid #f1f5f9",
              marginTop: "2px",
            }}
          >
            Todas as Skills
          </div>

          {availableSkills
            .filter((s) => !templateSkills.includes(s.id))
            .map((skill) => {
              const isSelected = activeSkillIds.includes(skill.id);
              return (
                <button
                  key={`dropdown-skill-${skill.id}`}
                  type="button"
                  onClick={() => onToggleSkill(skill.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "5px 8px",
                    borderRadius: "6px",
                    border: isSelected
                      ? "1px solid var(--color-primary, #2563eb)"
                      : "1px solid transparent",
                    background: isSelected
                      ? "var(--color-primary-container, #eff6ff)"
                      : "transparent",
                    color: isSelected
                      ? "var(--color-primary, #1d4ed8)"
                      : "var(--color-on-surface, #1e293b)",
                    cursor: "pointer",
                    fontSize: "11px",
                    textAlign: "left",
                    transition: "background 0.12s ease",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      overflow: "hidden",
                    }}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{
                        fontSize: "14px",
                        color: isSelected
                          ? "var(--color-primary, #2563eb)"
                          : "var(--text-muted, #94a3b8)",
                      }}
                    >
                      {isSelected
                        ? "check_circle"
                        : "radio_button_unchecked"}
                    </span>
                    <span
                      style={{
                        fontWeight: isSelected ? 600 : 400,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {skill.title || skill.name || skill.id}
                    </span>
                  </div>
                </button>
              );
            })}

          <div
            style={{
              borderTop: "1px solid #f1f5f9",
              paddingTop: "6px",
              marginTop: "4px",
            }}
          >
            <button
              type="button"
              onClick={() => {
                setIsDropdownOpen(false);
                onOpenSkillsHub();
              }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "4px",
                padding: "5px",
                borderRadius: "5px",
                border: "none",
                background: "var(--color-surface-container, #f8fafc)",
                color: "var(--color-primary, #2563eb)",
                fontSize: "10.5px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: "13px" }}
              >
                hub
              </span>
              Abrir Skills Hub Completo
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
