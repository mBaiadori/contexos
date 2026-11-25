import { BaseTranslationProvider } from "./BaseTranslationProvider.js";

export class LightweightLocalProvider extends BaseTranslationProvider {
  id = "lightweight-local";
  name = "Motor Leve de Servidor";
  description =
    "Tradução ultra-rápida e leve executada no servidor sem consumo de tokens de IA.";
  isLocal = true;

  private libreTranslateUrl = process.env.LIBRETRANSLATE_URL || "";

  async executeRawTranslation(
    text: string,
    sourceLang: string,
    targetLang: string,
    glossary?: Record<string, string>,
  ): Promise<string> {
    if (!text || !text.trim()) return text;

    // Normalizar códigos de idiomas (ex: pt-BR -> pt, en-US -> en)
    const normSource = sourceLang.split("-")[0].toLowerCase();
    const normTarget = targetLang.split("-")[0].toLowerCase();

    // Se houver LibreTranslate configurado no servidor, tentar traduzir via endpoint local
    if (this.libreTranslateUrl) {
      try {
        const res = await fetch(`${this.libreTranslateUrl}/translate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            q: text,
            source: normSource,
            target: normTarget,
            format: "text",
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as { translatedText?: string };
          if (data.translatedText) {
            return this.applyGlossary(data.translatedText, glossary);
          }
        }
      } catch (err) {
        console.warn(
          `[LightweightLocalProvider] Falha ao consultar LibreTranslate em ${this.libreTranslateUrl}:`,
          err,
        );
      }
    }

    // Tradução de alta velocidade via serviço de Machine Translation leve
    try {
      const translated = await this.translateViaFastEngine(
        text,
        normSource,
        normTarget,
      );
      return this.applyGlossary(translated, glossary);
    } catch (err) {
      console.warn("[LightweightLocalProvider] Erro na tradução rápida:", err);
      return text;
    }
  }

  private async translateViaFastEngine(
    text: string,
    source: string,
    target: string,
  ): Promise<string> {
    const lines = text.split("\n");
    const translatedLines: string[] = [];

    for (const line of lines) {
      if (!line.trim()) {
        translatedLines.push(line);
        continue;
      }

      // Se for apenas caracteres de controle ou separador markdown puro (como ---, ***, etc.)
      if (/^([#\->*|_\s]+)$/.test(line) && !line.trim().startsWith("#")) {
        translatedLines.push(line);
        continue;
      }

      // Se for exclusivamente um placeholder (ex: [[__CALLOUT_PLH_1__]], [[__CODEBLOCK_PLH_2__]]), mantém intacto
      if (/^\s*\[\[__\w+_PLH_\d+__\]\]\s*$/.test(line)) {
        translatedLines.push(line);
        continue;
      }

      // Se a linha for separador de tabela (| --- | --- |) ou placeholder de separador
      if (
        line.trim().startsWith("[[__TABLESEP") ||
        /^\|(?:\s*:?-+:?\s*\|)+$/.test(line.trim())
      ) {
        translatedLines.push(line);
        continue;
      }

      // Se a linha for uma linha de tabela Markdown (| célula 1 | célula 2 |)
      if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
        const rawCells = line.trim().split("|");
        const innerCells = rawCells.slice(1, -1);
        const translatedCells: string[] = [];
        for (const cell of innerCells) {
          const trimmedCell = cell.trim();
          if (!trimmedCell || /^\[\[__\w+_PLH_\d+__\]\]$/.test(trimmedCell)) {
            translatedCells.push(cell);
          } else {
            const transCell = await this.translateSingleText(trimmedCell, source, target);
            translatedCells.push(` ${transCell.trim()} `);
          }
        }
        translatedLines.push(`|${translatedCells.join("|")}|`);
        continue;
      }

      // Se for Heading (# Título, ## Título, etc.)
      const headingMatch = line.match(/^(\s*#{1,6}\s+)(.*)$/);
      if (headingMatch) {
        const prefix = headingMatch[1];
        const headingContent = headingMatch[2];
        const transHeading = await this.translateSingleText(headingContent, source, target);
        translatedLines.push(`${prefix}${transHeading.trim()}`);
        continue;
      }

      // Se for ToDo / Checklist com prefixo ToDoBox mascarado
      const todoMatch = line.match(/^(\s*\[\[__TODOBOX_PLH_\d+__\]\]\s*)(.*)$/);
      if (todoMatch) {
        const prefix = todoMatch[1];
        const todoContent = todoMatch[2];
        const transTodo = await this.translateSingleText(todoContent, source, target);
        translatedLines.push(`${prefix}${transTodo.trim()}`);
        continue;
      }

      // Se for Lista com marcadores (- , * , + , 1. )
      const listMatch = line.match(/^(\s*(?:[-*+]|\d+\.)\s+)(.*)$/);
      if (listMatch) {
        const prefix = listMatch[1];
        const listContent = listMatch[2];
        const transList = await this.translateSingleText(listContent, source, target);
        translatedLines.push(`${prefix}${transList.trim()}`);
        continue;
      }

      // Se for Blockquote (> texto)
      const quoteMatch = line.match(/^(\s*>\s*)(.*)$/);
      if (quoteMatch) {
        const prefix = quoteMatch[1];
        const quoteContent = quoteMatch[2];
        const transQuote = await this.translateSingleText(quoteContent, source, target);
        translatedLines.push(`${prefix}${transQuote.trim()}`);
        continue;
      }

      // Linha de texto padrão
      const translatedBlock = await this.translateSingleText(line, source, target);
      translatedLines.push(translatedBlock);
    }

    return translatedLines.join("\n");
  }

  private async translateSingleText(
    text: string,
    source: string,
    target: string,
  ): Promise<string> {
    if (!text.trim() || /^([#\->*|_\s]+)$/.test(text)) {
      return text;
    }

    // 1. Tentar via endpoint Google Translate rápido e confiável (dict-chrome-ex)
    try {
      const url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=${source}&tl=${target}&q=${encodeURIComponent(text)}`;
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json) && typeof json[0] === "string" && json[0].trim()) {
          return json[0];
        }
        if (Array.isArray(json) && Array.isArray(json[0])) {
          const joined = json[0]
            .map((item: unknown) =>
              typeof item === "string"
                ? item
                : Array.isArray(item)
                  ? String(item[0] || "")
                  : "",
            )
            .join("");
          if (joined.trim()) return joined;
        }
      }
    } catch {
      // Continua para o fallback
    }

    // 2. Fallback via MyMemory Translation API
    try {
      const memUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${source}|${target}`;
      const res = await fetch(memUrl);
      if (res.ok) {
        const json = (await res.json()) as {
          responseData?: { translatedText?: unknown };
        };
        if (json?.responseData?.translatedText && typeof json.responseData.translatedText === "string") {
          return json.responseData.translatedText;
        }
      }
    } catch {
      // Continua para o fallback GTX
    }

    // 3. Fallback via Google GTX
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${source}&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json) && Array.isArray(json[0])) {
          const translatedBlock = json[0]
            .map((item: unknown) => (Array.isArray(item) ? String(item[0] || "") : ""))
            .join("");
          if (translatedBlock.trim()) return translatedBlock;
        }
      }
    } catch {
      // Fallback final: retorna texto original
    }

    return text;
  }

  private applyGlossary(
    text: string,
    glossary?: Record<string, string>,
  ): string {
    if (!glossary || Object.keys(glossary).length === 0) return text;

    let result = text;
    for (const [term, replacement] of Object.entries(glossary)) {
      if (!term.trim() || !replacement.trim()) continue;
      const regex = new RegExp(
        `\\b${term.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\b`,
        "gi",
      );
      result = result.replace(regex, replacement);
    }
    return result;
  }
}
