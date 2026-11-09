import React, { useState, useEffect } from "react";
import { Modal, Button, FormField, Input } from "../ui";
import { API } from "../../services/api";
import { useRepoStore } from "../../stores/repoStore";
import { useAuth } from "../../context/AuthContext";
import type { Repo } from "../../types";
import { Trash2, AlertTriangle, HardDrive, Globe, Info } from "lucide-react";

interface DeleteRepoModalProps {
  isOpen: boolean;
  onClose: () => void;
  repo: Repo | null;
  initialMode?: "delete" | "unlink";
  onDeleted: () => void;
}

export const DeleteRepoModal: React.FC<DeleteRepoModalProps> = ({
  isOpen,
  onClose,
  repo,
  initialMode = "delete",
  onDeleted,
}) => {
  const [confirmName, setConfirmName] = useState("");
  const [deleteMode, setDeleteMode] = useState<"both" | "local_only">(
    initialMode === "unlink" ? "local_only" : "both",
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { activeOrg } = useRepoStore();
  const { user } = useAuth();
  const isOrgAdmin = Boolean(
    activeOrg?.role === "admin" ||
    activeOrg?.is_owner ||
    (user?.login && activeOrg?.login && activeOrg.login.toLowerCase() === user.login.toLowerCase())
  );
  const isAdmin = Boolean(repo?.permissions?.admin ?? (repo?.is_owner || repo?.is_local || isOrgAdmin));
  const hasRemote = !repo?.is_local && Boolean(repo?.html_url || repo?.full_name);
  const isUnclonedAndNotAdmin = !isAdmin && !repo?.is_cloned_locally && hasRemote;

  useEffect(() => {
    if (isOpen) {
      setConfirmName("");
      setErrorMsg(null);
      // Sempre padronizar para desvincular/remover localmente por segurança,
      // evitando falhas de permissão de exclusão remota na nuvem (403 Forbidden).
      setDeleteMode("local_only");
    }
  }, [isOpen, repo, hasRemote, isAdmin, initialMode]);

  if (!isOpen || !repo) return null;

  const isConfirmed = confirmName.trim().toLowerCase() === repo.name.trim().toLowerCase();

  const handleDelete = async () => {
    if (!isConfirmed) return;
    setIsDeleting(true);
    setErrorMsg(null);

    try {
      const deleteRemote = deleteMode === "both" && hasRemote && isAdmin;
      const res = await API.deleteRepo({
        name: repo.name,
        owner: repo.owner,
        delete_remote: deleteRemote,
        delete_local: true,
      });

      if (res.ok) {
        await onDeleted();
        onClose();
      } else {
        const errorText = res.data?.error || res.data?.message || "Erro ao processar exclusão.";
        if (deleteRemote && (errorText.includes("403") || errorText.includes("401") || errorText.includes("remoto"))) {
          setErrorMsg(`${errorText}. Dica: marque a opção "Apenas desvincular do Contexos" para remover o repositório da sua máquina.`);
        } else {
          setErrorMsg(errorText);
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Falha na comunicação com o servidor.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && isConfirmed && !isDeleting) {
      e.preventDefault();
      handleDelete();
    }
  };

  if (isUnclonedAndNotAdmin) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Repositório Remoto"
        size="md"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              padding: "12px 14px",
              borderRadius: "var(--radius-md, 8px)",
              backgroundColor: "rgba(59, 130, 246, 0.08)",
              border: "1px solid rgba(59, 130, 246, 0.2)",
            }}
          >
            <Info size={20} style={{ color: "var(--primary, #2563eb)", flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: "13px", lineHeight: "1.5", color: "var(--text-primary)" }}>
              <strong>Repositório Não Clonado:</strong> Este repositório pertence à organização remota e ainda não está baixado na sua máquina local.
              <br /><br />
              Como você não possui privilégios de administrador nesta organização, o GitHub barra comandos de exclusão remota (403 Forbidden). Como ele ainda não está clonado na sua máquina, não há arquivos locais para desvincular.
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
            <Button variant="primary" size="sm" onClick={onClose}>
              Entendido
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  const isUnlinking = deleteMode === "local_only" && hasRemote;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isUnlinking ? "Desvincular Repositório" : "Excluir Repositório"}
      size="md"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            padding: "12px 14px",
            borderRadius: "var(--radius-md, 8px)",
            backgroundColor: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.2)",
          }}
        >
          <AlertTriangle size={20} style={{ color: "#ef4444", flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: "13px", lineHeight: "1.5", color: "var(--text-primary)" }}>
            <strong>Atenção:</strong> {isUnlinking
              ? `Esta ação removerá a cópia local do repositório da sua máquina (projects/${repo.name}). O repositório remoto permanecerá intacto.`
              : "Esta ação é irreversível para os arquivos selecionados."}
          </div>
        </div>

        {hasRemote && (
          <FormField label="Opção de Exclusão:">
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
              {isAdmin ? (
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    borderRadius: "var(--radius-md, 6px)",
                    border: deleteMode === "both" ? "1px solid var(--primary)" : "1px solid var(--border-color)",
                    backgroundColor: deleteMode === "both" ? "var(--primary-light, rgba(26, 115, 232, 0.06))" : "transparent",
                    cursor: "pointer",
                    fontSize: "13px",
                  }}
                >
                  <input
                    type="radio"
                    name="delete-mode"
                    value="both"
                    checked={deleteMode === "both"}
                    onChange={() => setDeleteMode("both")}
                    style={{ accentColor: "var(--primary)" }}
                  />
                  <Globe size={15} style={{ color: "var(--text-muted)" }} />
                  <div>
                    <span style={{ fontWeight: 500 }}>Excluir no Provedor Remoto e Local</span>
                    <div style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                      Deleta permanentemente o repositório remoto e apaga a pasta local.
                    </div>
                  </div>
                </label>
              ) : null}

              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: "var(--radius-md, 6px)",
                  border: deleteMode === "local_only" ? "1px solid var(--primary)" : "1px solid var(--border-color)",
                  backgroundColor: deleteMode === "local_only" ? "var(--primary-light, rgba(26, 115, 232, 0.06))" : "transparent",
                  cursor: "pointer",
                  fontSize: "13px",
                }}
              >
                <input
                  type="radio"
                  name="delete-mode"
                  value="local_only"
                  checked={deleteMode === "local_only"}
                  onChange={() => setDeleteMode("local_only")}
                  style={{ accentColor: "var(--primary)" }}
                />
                <HardDrive size={15} style={{ color: "var(--text-muted)" }} />
                <div>
                  <span style={{ fontWeight: 500 }}>Apenas desvincular do Contexos</span>
                  <div style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                    Remove o cache local de <code>projects/{repo.name}</code> mantendo o repositório intacto no servidor remoto.
                  </div>
                </div>
              </label>
            </div>
          </FormField>
        )}

        <FormField
          label={`Digite "${repo.name}" para confirmar:`}
        >
          <Input
            id="input-confirm-delete-repo"
            placeholder={repo.name}
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
          />
        </FormField>

        {errorMsg && (
          <div style={{ color: "#ef4444", fontSize: "12.5px" }}>
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
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isDeleting}>
            Cancelar
          </Button>
          <Button
            id="btn-confirm-delete-repo"
            variant={isUnlinking ? "primary" : "danger"}
            size="sm"
            isLoading={isDeleting}
            disabled={!isConfirmed}
            icon={isUnlinking ? <HardDrive size={14} /> : <Trash2 size={14} />}
            onClick={handleDelete}
          >
            {isUnlinking ? "Desvincular Repositório" : "Excluir Repositório"}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
