import React, { useState, useEffect, useCallback } from 'react';
import { 
  Sparkles, 
  Download, 
  Trash2, 
  ShieldCheck, 
  FileCode2, 
  Terminal, 
  Brain, 
  CheckCircle2, 
  Layers, 
  BookOpen, 
  ExternalLink,
  Wrench
} from 'lucide-react';
import { API } from '../../services/api';
import type { SkillItem } from '../../types';
import { Modal, Tabs, SearchInput, Button, Badge, AlertBanner, Spinner } from '../ui';

interface SkillsHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeRepo?: string;
  onSkillSelect?: (skill: SkillItem) => void;
}

export const SkillsHubModal: React.FC<SkillsHubModalProps> = ({
  isOpen,
  onClose,
  activeRepo,
  onSkillSelect,
}) => {
  const [activeTab, setActiveTab] = useState<'hub' | 'installed'>('hub');
  const [hubSkills, setHubSkills] = useState<SkillItem[]>([]);
  const [installedSkills, setInstalledSkills] = useState<SkillItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSkill, setSelectedSkill] = useState<SkillItem | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionType, setActionType] = useState<'info' | 'success' | 'error'>('info');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [hubRes, projRes] = await Promise.all([
        API.getSkillsHub(),
        API.getSkillsProject(activeRepo),
      ]);

      if (hubRes.ok && hubRes.data) {
        setHubSkills(hubRes.data.skills || []);
      }
      if (projRes.ok && projRes.data) {
        setInstalledSkills(projRes.data.installed_skills || []);
      }
    } catch (err) {
      console.error('Erro ao carregar skills:', err);
    } finally {
      setLoading(false);
    }
  }, [activeRepo]);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

  const handleInstall = async (skill: SkillItem) => {
    try {
      setActionType('info');
      setActionMessage(`Instalando '${skill.title || skill.name}'...`);
      const res = await API.installSkill(skill.id, activeRepo);
      if (res.ok) {
        setActionType('success');
        setActionMessage(`Skill '${skill.title || skill.name}' instalada com sucesso!`);
        await loadData();
        setTimeout(() => setActionMessage(null), 3000);
      }
    } catch (err: unknown) {
      setActionType('error');
      setActionMessage(`Erro: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleUninstall = async (skillId: string) => {
    try {
      setActionType('info');
      setActionMessage('Desinstalando skill...');
      const res = await API.uninstallSkill(skillId, activeRepo);
      if (res.ok) {
        setActionType('success');
        setActionMessage('Skill desinstalada.');
        await loadData();
        if (selectedSkill?.id === skillId) {
          setSelectedSkill(null);
        }
        setTimeout(() => setActionMessage(null), 3000);
      }
    } catch (err: unknown) {
      setActionType('error');
      setActionMessage(`Erro: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  if (!isOpen) return null;

  const isInstalled = (id: string) => installedSkills.some((s) => s.id === id);

  const displayedList = activeTab === 'hub' ? hubSkills : installedSkills;
  const filteredSkills = displayedList.filter((s) => {
    const matchesCategory = selectedCategory === 'all' || s.category.toLowerCase() === selectedCategory.toLowerCase();
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      s.name.toLowerCase().includes(q) ||
      (s.title && s.title.toLowerCase().includes(q)) ||
      s.description.toLowerCase().includes(q) ||
      (s.tags && s.tags.some((t) => t.toLowerCase().includes(q)));
    return matchesCategory && matchesSearch;
  });

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'governance':
        return <ShieldCheck size={16} style={{ color: 'var(--color-success)' }} />;
      case 'architecture':
        return <FileCode2 size={16} style={{ color: 'var(--color-primary)' }} />;
      case 'quality':
        return <Sparkles size={16} style={{ color: 'var(--color-warning)' }} />;
      case 'engineering':
        return <Terminal size={16} style={{ color: '#a855f7' }} />;
      case 'memory':
        return <Brain size={16} style={{ color: '#ec4899' }} />;
      default:
        return <Layers size={16} style={{ color: 'var(--color-outline)' }} />;
    }
  };

  const tabList = [
    { id: 'hub', label: 'Catálogo Global', badge: hubSkills.length, icon: <Sparkles size={14} /> },
    { id: 'installed', label: 'Instaladas no Projeto', badge: installedSkills.length, icon: <CheckCircle2 size={14} /> },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Hub de Skills do Agente"
      subtitle={`Instale habilidades e ferramentas autônomas no projeto ${activeRepo || 'local'}`}
      icon={<Sparkles size={18} />}
      size="xl"
      footer={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--color-on-surface-variant)' }}>
            <span>Origem ECC:</span>
            <a
              href="https://github.com/mBaiadori/ECC"
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--color-primary)', display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none', fontWeight: 600 }}
            >
              mBaiadori/ECC <ExternalLink size={12} />
            </a>
          </div>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Fechar
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '62vh' }}>
        {actionMessage && (
          <AlertBanner
            variant={actionType}
            title={actionMessage}
            onClose={() => setActionMessage(null)}
          />
        )}

        <div style={{ display: 'flex', gap: '16px', flex: 1, minHeight: 0 }}>
          {/* Left Panel: Search, Filter, Cards */}
          <div style={{ width: '58%', display: 'flex', flexDirection: 'column', gap: '12px', minHeight: 0 }}>
            <Tabs
              tabs={tabList}
              activeTab={activeTab}
              onChange={(tab) => setActiveTab(tab as 'installed' | 'hub')}
              variant="pills"
            />

            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ flex: 1 }}>
                <SearchInput
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Pesquisar skills por nome ou tags..."
                  onClear={() => setSearchQuery('')}
                />
              </div>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                style={{
                  background: 'var(--color-surface-container-high)',
                  border: '1px solid var(--color-outline-variant)',
                  borderRadius: 'var(--radius-md, 8px)',
                  padding: '6px 10px',
                  fontSize: '12.5px',
                  color: 'var(--color-on-surface)',
                  outline: 'none',
                }}
              >
                <option value="all">Todas Categorias</option>
                <option value="governance">Governança</option>
                <option value="architecture">Arquitetura</option>
                <option value="quality">Qualidade</option>
                <option value="engineering">Engenharia</option>
                <option value="memory">Memória</option>
              </select>
            </div>

            {/* Skills Scroll List */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
              {loading ? (
                <div style={{ padding: '40px 0', display: 'flex', justifyContent: 'center' }}>
                  <Spinner size="md" message="Carregando catálogo de skills..." />
                </div>
              ) : filteredSkills.length === 0 ? (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--color-outline)', fontSize: '13px' }}>
                  {activeTab === 'installed'
                    ? 'Nenhuma skill instalada neste projeto ainda. Explore o Catálogo Global!'
                    : 'Nenhuma skill encontrada para o filtro.'}
                </div>
              ) : (
                filteredSkills.map((skill) => {
                  const installed = isInstalled(skill.id);
                  const isSelected = selectedSkill?.id === skill.id;

                  return (
                    <div
                      key={skill.id}
                      onClick={() => setSelectedSkill(skill)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 'var(--radius-md, 8px)',
                        border: isSelected ? '1px solid var(--color-primary)' : '1px solid var(--color-outline-variant)',
                        background: isSelected ? 'var(--color-primary-container)' : 'var(--color-surface-container)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {getCategoryIcon(skill.category)}
                          <strong style={{ fontSize: '13px', color: 'var(--color-on-surface)' }}>
                            {skill.title || skill.name}
                          </strong>
                          {installed && (
                            <Badge variant="success" size="sm">Instalada</Badge>
                          )}
                        </div>
                        <span style={{ fontSize: '11px', color: 'var(--color-outline)', fontFamily: 'var(--font-mono, monospace)' }}>
                          v{skill.version}
                        </span>
                      </div>

                      <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--color-on-surface-variant)', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {skill.description}
                      </p>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                        {skill.tools && skill.tools.slice(0, 3).map((tool) => (
                          <span
                            key={tool}
                            style={{
                              fontSize: '10px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: 'var(--color-surface-container-high)',
                              color: 'var(--color-on-surface-variant)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              border: '1px solid var(--color-outline-variant)',
                            }}
                          >
                            <Wrench size={10} style={{ color: 'var(--color-primary)' }} />
                            {tool}
                          </span>
                        ))}
                        {skill.tools && skill.tools.length > 3 && (
                          <span style={{ fontSize: '10px', color: 'var(--color-outline)' }}>+{skill.tools.length - 3}</span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Panel: Skill Details & Action */}
          <div
            style={{
              width: '42%',
              background: 'var(--color-surface-container-low)',
              border: '1px solid var(--color-outline-variant)',
              borderRadius: 'var(--radius-lg, 12px)',
              padding: '14px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
            }}
          >
            {selectedSkill ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {getCategoryIcon(selectedSkill.category)}
                      <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-primary)', fontWeight: 700 }}>
                        {selectedSkill.category}
                      </span>
                    </div>
                    <h3 style={{ margin: '4px 0 0 0', fontSize: '15px', fontWeight: 700, color: 'var(--color-on-surface)' }}>
                      {selectedSkill.title || selectedSkill.name}
                    </h3>
                    <div style={{ fontSize: '11px', color: 'var(--color-outline)', fontFamily: 'var(--font-mono, monospace)', marginTop: '2px' }}>
                      id: {selectedSkill.id} • v{selectedSkill.version}
                    </div>
                  </div>

                  {isInstalled(selectedSkill.id) ? (
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleUninstall(selectedSkill.id)}
                      icon={<Trash2 size={13} />}
                    >
                      Desinstalar
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleInstall(selectedSkill)}
                      icon={<Download size={13} />}
                    >
                      Instalar
                    </Button>
                  )}
                </div>

                <div
                  style={{
                    fontSize: '12.5px',
                    color: 'var(--color-on-surface-variant)',
                    background: 'var(--color-surface-container)',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-md, 8px)',
                    border: '1px solid var(--color-outline-variant)',
                    lineHeight: 1.45,
                  }}
                >
                  {selectedSkill.description}
                </div>

                {/* Native Tools */}
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-outline)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Wrench size={12} style={{ color: 'var(--color-primary)' }} />
                    Ferramentas Nativas Vinculadas
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {selectedSkill.tools && selectedSkill.tools.length > 0 ? (
                      selectedSkill.tools.map((tool) => (
                        <span
                          key={tool}
                          style={{
                            fontSize: '11px',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            background: 'var(--color-surface-container-high)',
                            border: '1px solid var(--color-outline-variant)',
                            color: 'var(--color-on-surface)',
                            fontFamily: 'var(--font-mono, monospace)',
                          }}
                        >
                          {tool}
                        </span>
                      ))
                    ) : (
                      <span style={{ fontSize: '11.5px', color: 'var(--color-outline)' }}>Nenhuma ferramenta especial requerida.</span>
                    )}
                  </div>
                </div>

                {/* Suggested Templates */}
                {selectedSkill.suggested_templates && selectedSkill.suggested_templates.length > 0 && (
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-outline)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <BookOpen size={12} style={{ color: 'var(--color-success)' }} />
                      Templates Recomendados
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {selectedSkill.suggested_templates.map((tpl) => (
                        <span
                          key={tpl}
                          style={{
                            fontSize: '11px',
                            padding: '3px 8px',
                            borderRadius: '4px',
                            background: 'var(--color-surface-container-high)',
                            border: '1px solid var(--color-outline-variant)',
                            color: 'var(--color-success)',
                          }}
                        >
                          {tpl}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* SKILL.md Preview */}
                {selectedSkill.content && (
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--color-outline)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
                      Instruções do Agente (SKILL.md)
                    </div>
                    <pre
                      style={{
                        fontSize: '11px',
                        color: 'var(--color-on-surface-variant)',
                        background: 'var(--color-surface-container-lowest)',
                        padding: '10px',
                        borderRadius: 'var(--radius-md, 8px)',
                        border: '1px solid var(--color-outline-variant)',
                        overflowX: 'auto',
                        maxHeight: '180px',
                        whiteSpace: 'pre-wrap',
                        fontFamily: 'var(--font-mono, monospace)',
                        margin: 0,
                      }}
                    >
                      {selectedSkill.content}
                    </pre>
                  </div>
                )}

                {onSkillSelect && isInstalled(selectedSkill.id) && (
                  <Button
                    variant="primary"
                    size="sm"
                    fullWidth
                    onClick={() => {
                      onSkillSelect(selectedSkill);
                      onClose();
                    }}
                    icon={<Sparkles size={14} />}
                  >
                    Ativar esta Skill no Copilot Agora
                  </Button>
                )}
              </div>
            ) : (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: 'var(--color-outline)', padding: '20px' }}>
                <Sparkles size={36} style={{ color: 'var(--color-outline)', opacity: 0.5, marginBottom: '12px' }} />
                <strong style={{ fontSize: '13px', color: 'var(--color-on-surface-variant)' }}>Selecione uma Skill</strong>
                <p style={{ fontSize: '12px', marginTop: '4px', maxWidth: '240px' }}>
                  Clique em qualquer habilidade da lista para ver detalhes, ferramentas associadas e instalá-la.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
