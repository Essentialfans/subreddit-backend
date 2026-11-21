/** Browser upload with live % (fetch can't report upload progress). */

export type UploadProgressHandler = (pct: number) => void;

export function postFormWithProgress<T>(
  endpoint: string,
  form: FormData,
  onProgress?: UploadProgressHandler
): Promise<{ status: number; json: T }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", endpoint);
    xhr.upload.onprogress = (event) => {
      if (!onProgress) return;
      if (!event.lengthComputable || event.total <= 0) {
        onProgress(0);
        return;
      }
      onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText || "{}") as T;
        onProgress?.(100);
        resolve({ status: xhr.status, json });
      } catch {
        reject(new Error("Upload failed"));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.onabort = () => reject(new Error("Upload cancelled"));
    xhr.send(form);
  });
}

/** Upload a file to `/api/generation/upload` and return the public URL. */
export async function uploadGenerationFile(
  file: File,
  onProgress?: UploadProgressHandler
): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const { status, json } = await postFormWithProgress<{
    ok: boolean;
    url?: string;
    error?: string;
  }>("/api/generation/upload", form, onProgress);
  if (status < 200 || status >= 300 || !json.ok || !json.url) {
    throw new Error(json.error || "Upload failed");
  }
  return json.url;
}
