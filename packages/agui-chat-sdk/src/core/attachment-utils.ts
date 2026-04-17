export interface AttachmentDraft {
  id: string;
  name: string;
  type: string;
  size: number;
  previewUrl?: string;
  base64: string;
  mimeType: string;
}

export type InputContent =
  | { type: "text"; text: string }
  | {
      type: "image" | "document" | "file";
      source: { type: "data"; value: string; mimeType: string };
      name?: string;
    };

export async function fileToAttachmentDraft(file: File): Promise<AttachmentDraft> {
  const base64 = await fileToBase64(file);
  return {
    id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
    base64,
    mimeType: file.type || "application/octet-stream",
  };
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export function attachmentToInputContent(attachment: AttachmentDraft): InputContent {
  const type = attachment.type.startsWith("image/") ? "image" : attachment.type === "application/pdf" ? "document" : "file";
  return {
    type,
    name: attachment.name,
    source: {
      type: "data",
      value: attachment.base64,
      mimeType: attachment.mimeType,
    },
  };
}
