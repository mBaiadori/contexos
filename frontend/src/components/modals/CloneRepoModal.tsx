import React, { useState, useEffect } from "react";
import { Modal, Button, FormField, Input, Switch } from "../ui";
import { API } from "../../services/api";
import type { Repo } from "../../types";
import { Copy, FolderGit2, Globe, Lock } from "lucide-react";

interface CloneRepoModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceRepo: Repo | null;
  orgs: string[];
  userLogin?: string;
  onCloned: (newRepo: Repo) => void;
}

export const CloneRepoModal: React.FC<CloneRepoModalProps> = ({
  isOpen,
  onClose,
  sourceRepo,
  orgs,
  userLogin,
  onCloned,
}) => {
  const [newRepoName, setNewRepoName] = useState("");
  const [selectedOwner, setSelectedOwner] = useState("personal");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && sourceRepo) {
      setNewRepoName(`${sourceRepo.name}-clone`);
      setDescription(`Cópia clonada de ${sourceRepo.full_name || sourceRepo.name}`);
      setSelectedOwner(sourceRepo.owner || "personal");
      setIsPrivate(sourceRepo.is_private ?? true);
      setErrorMsg(null);
    }
  }, [isOpen, sourceRepo]);

  if (!isOpen || !sourceRepo) return null;

  const handleClone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRepoName.trim()) {
      setErrorMsg("O nome do repositório clonado é obrigatório.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const ownerValue =
        selectedOwner === "personal" || selectedOwner === "all"
          ? userLogin
          : selectedOwner;

      const res = await API.cloneRepo({
        source_name: sourceRepo.name,
        new_name: newRepoName.trim().toLowerCase().replace(/\s+/g, "-"),
        owner: ownerValue,
        description: description.trim(),
        is_private: isPrivate,
      });

      if (res.ok && res.data?.repo) {
        onCloned(res.data.repo);
        onClose();
      } else {
        setErrorMsg(res.data?.error || res.data?.message || "Erro ao clonar repositório.");
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
      title="Clonar Repositório (Administrador)"
      size="md"
    >
      <form onSubmit={handleClone} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Banner com informações do repositório base */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 14px",
            borderRadius: "var(--radius-md, 8px)",
            backgroundColor: "var(--color-surface-container-low, #f8fafc)",
            border: "1px solid var(--color-outline-variant, #e2e8f0)",
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              backgroundColor: "rgba(26, 115, 232, 0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--color-primary, #1a73e8)",
              flexShrink: 0,
            }}
          >
            <FolderGit2 size={16} />
          </div>
          <div>
            <div style={{ fontSize: "11px", color: "var(--color-outline, #64748b)", fontWeight: 500 }}>
              REPOSITÓRIO DE ORIGEM
            </div>
            <div style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--color-on-surface, #0f172a)" }}>
              {sourceRepo.full_name || sourceRepo.name}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 14 }}>
          <FormField label="Destino (Conta / Org):">
            <select
              id="clone-repo-owner"
              className="ui-input"
              value={selectedOwner}
              onChange={(e) => setSelectedOwner(e.target.value)}
            >
              <option value="personal">{userLogin || "Pessoal"} (Pessoal)</option>
              {orgs.map((o) => (
                <option key={o} value={o}>
                  @{o} (Organização)
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Novo Nome do Repositório:" required>
            <Input
              id="clone-repo-name"
              placeholder="ex: billing-service-v2"
              value={newRepoName}
              onChange={(e) => setNewRepoName(e.target.value)}
              required
              autoFocus
            />
          </FormField>
        </div>

        <FormField label="Descrição do Clone:">
          <Input
            id="clone-repo-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descrição da cópia do projeto"
          />
        </FormField>

        {!sourceRepo.is_local && (
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
              id="clone-repo-private-switch"
              checked={isPrivate}
              onChange={setIsPrivate}
              label={
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {isPrivate ? <Lock size={14} /> : <Globe size={14} />}
                  <span>{isPrivate ? "Repositório Clonado Privado" : "Repositório Clonado Público"}</span>
                </span>
              }
              description="Define a visibilidade da nova cópia no servidor remoto."
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
            id="btn-confirm-clone-repo"
            type="submit"
            variant="primary"
            size="sm"
            isLoading={isSubmitting}
            disabled={!newRepoName.trim()}
            leftIcon={<Copy size={14} />}
          >
            Clonar Repositório
          </Button>
        </div>
      </form>
    </Modal>
  );
};
