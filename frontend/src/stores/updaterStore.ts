import { create } from "zustand";
import type { UpdaterStatusEvent } from "../services/api/client";

export interface UpdateInfoState extends UpdaterStatusEvent {
  percent?: number;
}

interface UpdaterStore {
  updateInfo: UpdateInfoState | null;
  isChecking: boolean;
  init: () => void;
  checkForUpdates: () => Promise<void>;
  applyUpdate: () => void;
}

let isInitialized = false;

export const useUpdaterStore = create<UpdaterStore>((set, get) => ({
  updateInfo: null,
  isChecking: false,

  init: () => {
    if (isInitialized) return;
    isInitialized = true;

    const bridge =
      typeof window !== "undefined" ? window.desktopBridge : undefined;
    if (!bridge) return;

    // 1. Tentar ler imediatamente o último status em cache (ex: checado antes no login ou no main)
    if (bridge.getUpdateStatus) {
      bridge
        .getUpdateStatus()
        .then((cached) => {
          if (cached) {
            set((prev) => ({
              updateInfo: {
                ...(prev.updateInfo || {}),
                ...cached,
              },
            }));
          }
        })
        .catch(() => {});
    }

    // 2. Registrar listener de status do updater
    if (bridge.onUpdaterStatus) {
      bridge.onUpdaterStatus((data) => {
        set((prev) => ({
          updateInfo: {
            ...(prev.updateInfo || {}),
            ...data,
          },
          isChecking: data.status === "checking",
        }));
      });
    }

    // 3. Registrar listener de progresso do download
    if (bridge.onUpdaterProgress) {
      bridge.onUpdaterProgress((prog) => {
        set((prev) => ({
          updateInfo: {
            status: prev.updateInfo?.status || "available",
            ...prev.updateInfo,
            percent: prog.percent,
          },
        }));
      });
    }

    // 4. Disparar checagem caso ainda não tenhamos status conclusivo de atualização
    const currentInfo = get().updateInfo;
    if (
      !currentInfo ||
      (currentInfo.status !== "available-manual" &&
        currentInfo.status !== "available" &&
        currentInfo.status !== "downloaded")
    ) {
      get().checkForUpdates();
    }
  },

  checkForUpdates: async () => {
    const bridge =
      typeof window !== "undefined" ? window.desktopBridge : undefined;
    if (!bridge?.checkForUpdates) return;

    set({ isChecking: true });
    try {
      const res = await bridge.checkForUpdates();
      if (res && res.updateInfo) {
        const info = res.updateInfo;
        set((prev) => ({
          updateInfo: {
            ...(prev.updateInfo || {}),
            ...info,
            status: info.status,
          },
        }));
      }
    } catch {
      // Ignora falhas de conexão de forma não intrusiva
    } finally {
      set({ isChecking: false });
    }
  },

  applyUpdate: () => {
    const bridge =
      typeof window !== "undefined" ? window.desktopBridge : undefined;
    const { updateInfo } = get();
    if (!bridge) return;

    set((prev) => ({
      updateInfo: prev.updateInfo
        ? { ...prev.updateInfo, status: "updating" }
        : { status: "updating" },
    }));

    if (bridge.quitAndInstallUpdate) {
      bridge.quitAndInstallUpdate();
    } else if (updateInfo?.downloadUrl && bridge.openExternal) {
      bridge.openExternal(updateInfo.downloadUrl);
    }
  },
}));
