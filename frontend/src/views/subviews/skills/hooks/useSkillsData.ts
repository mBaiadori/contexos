import { useEffect, useState } from "react";
import { useAI } from "../../../../context/AIContext";
import { useWorkspace } from "../../../../context/WorkspaceContext";
import { API } from "../../../../services/api";
import type { SkillItem } from "../../../../types";
import type { ScopeFilter } from "../types";

export function useSkillsData() {
  const { activeRepo } = useWorkspace();
  const { activeSkillId, setActiveSkillId } = useAI();

  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("installed");
  const [hubSkills, setHubSkills] = useState<SkillItem[]>([]);
  const [installedSkills, setInstalledSkills] = useState<SkillItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedSkill, setSelectedSkill] = useState<SkillItem | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);

  const loadSkills = async () => {
    setLoading(true);
    try {
      const [hubRes, projRes] = await Promise.all([
        API.getSkillsHub(),
        API.getSkillsProject(activeRepo?.name),
      ]);

      if (hubRes.ok && hubRes.data) {
        setHubSkills(hubRes.data.skills || []);
      }
      if (projRes.ok && projRes.data) {
        const installed = projRes.data.installed_skills || [];
        setInstalledSkills(installed);
      }
    } catch (err) {
      console.error("Erro ao carregar skills:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSkills();
  }, [activeRepo]);

  const handleInstall = async (skill: SkillItem) => {
    try {
      setActionFeedback({
        ok: true,
        msg: `Instalando '${skill.title || skill.name}' no projeto...`,
      });
      const res = await API.installSkill(skill.id, activeRepo?.name);
      if (res.ok) {
        setActionFeedback({
          ok: true,
          msg: `Skill '${skill.title || skill.name}' instalada com sucesso!`,
        });
        await loadSkills();
        setTimeout(() => setActionFeedback(null), 3500);
      } else {
        setActionFeedback({
          ok: false,
          msg: (res.data as { message?: string } | undefined)?.message || "Falha ao instalar skill.",
        });
      }
    } catch (err: unknown) {
      setActionFeedback({ ok: false, msg: err instanceof Error ? err.message : "Erro de conexão." });
    }
  };

  const handleUninstall = async (skillId: string) => {
    const ok = window.confirm(
      "Deseja remover esta skill do projeto? (O catálogo global continuará disponível no Hub)"
    );
    if (!ok) return;

    try {
      setActionFeedback({ ok: true, msg: "Desinstalando skill..." });
      const res = await API.uninstallSkill(skillId, activeRepo?.name);
      if (res.ok) {
        setActionFeedback({ ok: true, msg: "Skill desinstalada do projeto." });
        await loadSkills();
        if (selectedSkill?.id === skillId) {
          setSelectedSkill(null);
        }
        if (activeSkillId === skillId) {
          setActiveSkillId(null);
        }
        setTimeout(() => setActionFeedback(null), 3500);
      } else {
        setActionFeedback({
          ok: false,
          msg: (res.data as { message?: string } | undefined)?.message || "Falha ao desinstalar skill.",
        });
      }
    } catch (err: unknown) {
      setActionFeedback({ ok: false, msg: err instanceof Error ? err.message : "Erro de conexão." });
    }
  };

  const isInstalled = (id: string) => installedSkills.some((s) => s.id === id);

  const systemSkills = hubSkills.filter((s) => s.source === "system");
  const communitySkills = hubSkills.filter(
    (s) => s.source === "community" || (!s.source && s.source !== "system")
  );

  const displayedList =
    scopeFilter === "installed"
      ? installedSkills
      : scopeFilter === "system"
        ? systemSkills
        : communitySkills;

  const filteredSkills = displayedList.filter((s) => {
    const matchesCat =
      selectedCategory === "all" ||
      s.category?.toLowerCase() === selectedCategory.toLowerCase();

    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      s.name.toLowerCase().includes(q) ||
      (s.title && s.title.toLowerCase().includes(q)) ||
      s.description.toLowerCase().includes(q) ||
      (s.tags && s.tags.some((t) => t.toLowerCase().includes(q)));

    return matchesCat && matchesSearch;
  });

  return {
    activeRepo,
    activeSkillId,
    setActiveSkillId,
    scopeFilter,
    setScopeFilter,
    hubSkills,
    installedSkills,
    systemSkills,
    communitySkills,
    loading,
    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    selectedSkill,
    setSelectedSkill,
    actionFeedback,
    setActionFeedback,
    loadSkills,
    handleInstall,
    handleUninstall,
    isInstalled,
    filteredSkills,
  };
}
