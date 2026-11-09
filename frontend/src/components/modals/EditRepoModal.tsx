import React, { useState, useEffect } from "react";
import { Modal, Button, FormField, Input, Switch } from "../ui";
import { API } from "../../services/api";
import type { Repo } from "../../types";
import { Edit3, AlertTriangle, Globe, Lock } from "lucide-react";

interface EditRepoModalProps {
  isOpen: boolean;
  onClose: () => void;
  repo: Repo | null;
  onUpdated: () => void;
}

export const EditRepoModal: React.FC<EditRepoModalProps> = ({
  isOpen,
  onClose,
  repo,
  onUpdated,
}) => {
  const [repoName, setRepoName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && repo) {
      setRepoName(repo.name || "");
      setDescription(repo.description || "");
      setIsPrivate(Boolean(repo.is_private));
      setErrorMsg(null);
    }
  }, [isOpen, repo]);

  if (!isOpen || !repo) return null;

  const isNameChanged = repoName.trim().toLowerCase() !== repo.name.trim().toLowerCase();

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoName.trim()) {
      setErrorMsg("O nome do repositório não pode ficar em branco.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await API.updateRepo({
        current_name: repo.name,
        new_name: isNameChanged ? repoName.trim().toLowerCase().replace(/\s+/g, "-") : undefined,
        description: description.trim(),
        is_private: isPrivate,
        owner: repo.owner,
      });

      if (res.ok && res.data?.success) {
        onUpdated();
        onClose();
      } else {
        setErrorMsg(res.data?.error || res.data?.message || "Erro ao salvar alterações no repositório.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Falha na comunicação com o servidor.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Editar Configurações do Repositório"
      size="md"
    >
      <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Alerta caso vá renomear */}
        {isNameChanged && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "10px 14px",
              borderRadius: "var(--radius-md, 8px)",
              backgroundColor: "rgba(245, 158, 11, 0.1)",
              border: "1px solid rgba(245, 158, 11, 0.3)",
              fontSize: "12.5px",
              color: "var(--text-primary)",
              lineHeight: "1.45",
            }}
          >
            <AlertTriangle size={18} style={{ color: "#f59e0b", flexShrink: 0, marginTop: 1 }} />
            <div>
              <strong>Atenção ao renomear:</strong> Alterar o nome do repositório modifica sua URL remota no servidor e renomeia a pasta local de cache. Webhooks e links compartilhados podem precisar de atualização.
            </div>
          </div>
        )}

        <FormField label="Nome do Repositório:" required>
          <Input
            id="edit-repo-name"
            value={repoName}
            onChange={(e) => setRepoName(e.target.value)}
            required
            autoFocus
          />
        </FormField>

        <FormField label="Descrição do Repositório:">
          <Input
            id="edit-repo-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="ex: Repositório de governança e documentação viva"
          />
        </FormField>

        {!repo.is_local && (
          <div
            style={{
              padding: "12px 14px",
              borderRadius: "8px",
              border: "1px solid var(--color-outline-variant, #e2e8f0)",
              backgroundColor: "var(--color-surface-container-low, #f8fafc)",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <Switch
              id="edit-repo-private-switch"
              checked={isPrivate}
              onChange={setIsPrivate}
              label={
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {isPrivate ? <Lock size={14} /> : <Globe size={14} />}
                  <span>{isPrivate ? "Repositório Privado" : "Repositório Público"}</span>
                </span>
              }
              description={
                isPrivate
                  ? "Acesso restrito apenas aos colaboradores e administradores autorizados."
                  : "Repositório público e visível para todos no servidor remoto."
              }
            />
          </div>
        )}

        {errorMsg && (
          <div
            style={{
              padding: "8px 12px",
              borderRadius: "6px",
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              border: "1px solid #ef4444",
              color: "#ef4444",
              fontSize: "12.5px",
            }}
          >
            {errorMsg}
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
            marginTop: 8,
          }}
        >
          <Button variant="ghost" size="sm" type="button" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            id="btn-save-edit-repo"
            type="submit"
            variant="primary"
            size="sm"
            isLoading={isSubmitting}
            disabled={!repoName.trim()}
            leftIcon={<Edit3 size={14} />}
          >
            Salvar Alterações
          </Button>
        </div>
      </form>
    </Modal>
  );
};
