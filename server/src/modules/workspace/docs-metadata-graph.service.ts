import { generateDocId, type DocumentMetadataItem } from "./docs-metadata-parser.js";

export class DocsMetadataGraphService {
  getDocumentNeighborhood(
    metaList: DocumentMetadataItem[],
    filePath: string,
    depth = 1,
  ) {
    const cleanPath = (filePath || "").replace(/^\/+/, "");
    const targetDoc = metaList.find(
      (d) => d.path === cleanPath || d.id === generateDocId(cleanPath),
    );

    if (!targetDoc)
      return { target: null, outgoing: [], incoming: [], second_degree: [] };

    // 1º Grau: Outgoing (Links que este documento aponta)
    const outgoingDocs = (targetDoc.links || [])
      .map((targetLink) => {
        const cleanTarget = targetLink.split("#")[0].replace(/^\.?\//, "");
        return metaList.find(
          (d) =>
            d.path === cleanTarget ||
            d.id === cleanTarget ||
            d.path.endsWith(cleanTarget),
        );
      })
      .filter((d): d is DocumentMetadataItem => Boolean(d));

    // 1º Grau: Incoming (Documentos que apontam para este)
    const incomingDocs = metaList.filter(
      (d) =>
        d.path !== targetDoc.path &&
        Array.isArray(d.links) &&
        d.links.some(
          (l) =>
            l.includes(cleanPath) ||
            l.includes(targetDoc.id) ||
            (targetDoc.name && l.includes(targetDoc.name)),
        ),
    );

    // 2º Grau (se solicitado)
    const secondDegreeDocs: DocumentMetadataItem[] = [];
    if (depth >= 2) {
      const firstDegreePaths = new Set([
        targetDoc.path,
        ...outgoingDocs.map((d) => d.path),
        ...incomingDocs.map((d) => d.path),
      ]);
      for (const firstDoc of [...outgoingDocs, ...incomingDocs]) {
        for (const link of firstDoc.links || []) {
          const cleanL = link.split("#")[0].replace(/^\.?\//, "");
          const match = metaList.find(
            (d) => d.path === cleanL || d.id === cleanL,
          );
          if (
            match &&
            !firstDegreePaths.has(match.path) &&
            !secondDegreeDocs.some((d) => d.path === match.path)
          ) {
            secondDegreeDocs.push(match);
          }
        }
      }
    }

    return {
      target: targetDoc,
      outgoing: outgoingDocs.map((d) => ({
        id: d.id,
        path: d.path,
        title: d.title || d.name,
        status: d.status,
        categories: d.categories,
      })),
      incoming: incomingDocs.map((d) => ({
        id: d.id,
        path: d.path,
        title: d.title || d.name,
        status: d.status,
        categories: d.categories,
      })),
      second_degree: secondDegreeDocs.map((d) => ({
        id: d.id,
        path: d.path,
        title: d.title || d.name,
        status: d.status,
      })),
    };
  }

  /**
   * Monta o Context Bundle completo para o Agente e Editor
   */
  buildDocumentContextBundle(
    metaList: DocumentMetadataItem[],
    filePath: string,
  ): {
    filePath: string;
    neighborhood: ReturnType<DocsMetadataGraphService["getDocumentNeighborhood"]>;
    relevantApprovedSpecs: Array<{
      id: string;
      path: string;
      title: string;
      categories: string;
    }>;
    contextPromptSnippet: string;
  } {
    const cleanPath = (filePath || "").replace(/^\/+/, "");
    const neighborhood = this.getDocumentNeighborhood(metaList, cleanPath, 2);

    // Specs aprovadas relevantes
    const approvedSpecs = metaList
      .filter(
        (d) => d.status?.toLowerCase() === "approved" && d.path !== cleanPath,
      )
      .slice(0, 5)
      .map((d) => ({
        id: d.id,
        path: d.path,
        title: d.title || d.name || "",
        categories: d.categories || "",
      }));

    let snippet = `\n### Contexto do Grafo de Documentação Viva (${cleanPath}):\n`;
    if (neighborhood.target) {
      snippet += `- **Status do Doc:** ${neighborhood.target.status || "-"} | **Categoria:** ${neighborhood.target.categories || "geral"}\n`;
    }
    if (neighborhood.outgoing.length > 0) {
      snippet += `- **Dependências (Links de Saída):** ${neighborhood.outgoing.map((d) => `[${d.title}](${d.path}) [${d.status}]`).join(", ")}\n`;
    }
    if (neighborhood.incoming.length > 0) {
      snippet += `- **Documentos que dependem deste:** ${neighborhood.incoming.map((d) => `[${d.title}](${d.path}) [${d.status}]`).join(", ")}\n`;
    }
    if (approvedSpecs.length > 0) {
      snippet += `- **Specs Canônicas Aprovadas:** ${approvedSpecs.map((s) => `[${s.title}](${s.path})`).join(", ")}\n`;
    }

    return {
      filePath: cleanPath,
      neighborhood,
      relevantApprovedSpecs: approvedSpecs,
      contextPromptSnippet: snippet,
    };
  }
}

export const docsMetadataGraphService = new DocsMetadataGraphService();
