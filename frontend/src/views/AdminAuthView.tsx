import { KeyRound, ShieldCheck, Monitor, Zap, ArrowLeft } from "lucide-react";
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LanguageSwitcher } from "../components/common/LanguageSwitcher";
import {
  AlertBanner,
  Button,
  Card,
  CardContent,
  FormField,
  Input,
  Badge,
} from "../components/ui";
import { useAuth } from "../context/AuthContext";

interface AdminAuthViewProps {
  onLoginSuccess: () => void;
}

export const AdminAuthView: React.FC<AdminAuthViewProps> = ({
  onLoginSuccess,
}) => {
  const navigate = useNavigate();
  const { loginWithToken, loginLocal, version } = useAuth();

  const [manualToken, setManualToken] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    text: string;
    type: "error" | "info" | "success";
  } | null>(null);

  const handleManualTokenLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualToken.trim()) return;

    setIsLoading(true);
    setStatusMessage(null);

    try {
      const result = await loginWithToken(manualToken.trim());
      if (result.success) {
        onLoginSuccess();
      } else {
        setStatusMessage({
          text: result.error || "Falha ao autenticar com o token.",
          type: "error",
        });
      }
    } catch {
      setStatusMessage({
        text: "Erro de conexão com o servidor de autenticação.",
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLocalModeLogin = async () => {
    setIsLoading(true);
    try {
      await loginLocal();
      onLoginSuccess();
    } catch {
      setStatusMessage({
        text: "Erro ao iniciar no modo local.",
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      id="view-admin-auth"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        width: "100%",
        padding: "24px 16px",
        boxSizing: "border-box",
        background:
          "radial-gradient(ellipse at top, var(--color-surface-container-high) 0%, var(--color-surface) 75%)",
        position: "relative",
        overflowY: "auto",
      }}
    >
      {/* Botão de Idioma Superior Direito */}
      <div
        style={{ position: "absolute", top: "16px", right: "20px", zIndex: 10 }}
      >
        <LanguageSwitcher />
      </div>

      <div
        style={{
          width: "100%",
          maxWidth: "480px",
          display: "flex",
          flexDirection: "column",
          gap: "20px",
        }}
      >
        {/* Cabeçalho de Identidade */}
        <div
          style={{
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 12px",
              borderRadius: "16px",
              background: "var(--color-primary-container)",
              color: "var(--color-primary)",
              fontSize: "11.5px",
              fontWeight: 700,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              border:
                "1px solid rgba(var(--color-primary-rgb, 59, 130, 246), 0.2)",
            }}
          >
            <ShieldCheck size={13} />
            <span>Context OS • v{version || "1.0.6"}</span>
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: "26px",
              fontWeight: 800,
              color: "var(--color-on-surface)",
              letterSpacing: "-0.02em",
              lineHeight: 1.25,
            }}
          >
            Portal do Administrador
          </h1>
        </div>

        {/* Card Principal */}
        <Card
          style={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            borderRadius: "16px",
            boxShadow:
              "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.05)",
          }}
        >
          <CardContent
            style={{
              padding: "28px",
              display: "flex",
              flexDirection: "column",
              gap: "20px",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: "13.5px",
                color: "var(--color-on-surface-variant)",
                lineHeight: 1.45,
              }}
            >
              Autenticação com Personal Access Token para organizações,
              repositórios e governança.
            </p>
            {statusMessage && (
              <AlertBanner
                variant={statusMessage.type}
                title={statusMessage.text}
                onClose={() => setStatusMessage(null)}
              />
            )}

            {/* Banner com Escopos Recomendados */}
            <div
              style={{
                padding: "14px",
                borderRadius: "10px",
                backgroundColor: "var(--color-surface-container-low, #f8fafc)",
                border: "1px solid var(--color-outline-variant, #e2e8f0)",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "var(--color-on-surface, #0f172a)",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <ShieldCheck size={14} color="#1a73e8" />
                  Escopos Recomendados
                </span>
              </div>

              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                <Badge variant="primary">repo</Badge>
                <Badge variant="primary">admin:org</Badge>
                <Badge variant="info">write:org</Badge>
                <Badge variant="purple">workflow</Badge>
              </div>
              <a
                href="https://github.com/settings/tokens/new?description=Context%20OS%20Admin&scopes=repo,admin:org,write:org,user,workflow"
                target="_blank"
                rel="noreferrer"
                style={{
                  fontSize: "16px",
                  fontWeight: 700,
                  color: "var(--color-primary, #1a73e8)",
                  textDecoration: "none",
                  display: "flex",
                  alignItems: "center",
                  margin: "auto",
                  gap: "4px",
                }}
              >
                <Zap size={14} /> Gerar no GitHub
              </a>
            </div>
            <form
              onSubmit={handleManualTokenLogin}
              style={{ display: "flex", flexDirection: "column", gap: "14px" }}
            >
              <FormField
                label="Personal Access Token"
                helperText="Cole o token gerado no GitHub (ghp_...)"
                required
              >
                <Input
                  type="password"
                  id="pat-token-input"
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  autoComplete="off"
                  autoFocus
                />
              </FormField>

              <Button
                id="btn-admin-login"
                variant="primary"
                size="lg"
                fullWidth
                type="submit"
                loading={isLoading}
                disabled={!manualToken.trim()}
                style={{
                  padding: "14px",
                  fontSize: "15px",
                  fontWeight: 700,
                  borderRadius: "10px",
                }}
              >
                <KeyRound size={18} />
                <span>Autenticar como Administrador</span>
              </Button>
            </form>

            {/* Rodapé Alternativo: Voltar ao Login Comum e Modo Local */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                paddingTop: "10px",
                borderTop: "1px solid var(--color-outline-variant, #e2e8f0)",
              }}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/login")}
                style={{
                  fontSize: "11.5px",
                  color: "var(--color-outline, #64748b)",
                }}
              >
                <ArrowLeft size={13} />
                <span>Voltar ao login comum</span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleLocalModeLogin}
                style={{
                  fontSize: "11.5px",
                  color: "var(--color-outline, #64748b)",
                }}
              >
                <Monitor size={13} />
                <span>Modo Local (Offline)</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Rodapé com Versão */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            padding: "4px 0",
            fontSize: "12px",
            color: "var(--color-on-surface-variant, #64748b)",
          }}
        >
          <span>Context OS Desktop</span>
          <span style={{ opacity: 0.5 }}>•</span>
          <span
            style={{
              fontFamily: "monospace",
              fontWeight: 600,
              padding: "2px 6px",
              borderRadius: "4px",
              background: "var(--color-surface-container-high, #e2e8f0)",
              border: "1px solid var(--color-outline-variant, #cbd5e1)",
              color: "var(--color-on-surface, #0f172a)",
            }}
          >
            v{version || "1.0.6"}
          </span>
        </div>
      </div>
    </div>
  );
};
