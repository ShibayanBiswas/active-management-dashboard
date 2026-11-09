export type UploadFileRead =
  | { ok: true; name: string; buffer: ArrayBuffer; monthKey: string }
  | { ok: false; error: string; issues: string[] };

function isUploadBlob(value: FormDataEntryValue | null): boolean {
  return Boolean(value && typeof value === "object" && typeof (value as Blob).arrayBuffer === "function");
}

/** Read the workbook from a multipart upload. Never throws HTML 500 on a JSON body. */
export async function readMultipartWorkbook(req: Request): Promise<UploadFileRead> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return {
      ok: false,
      error: "File required",
      issues: ["Choose an Excel workbook to upload."],
    };
  }
  const file = form.get("file");
  if (file == null || typeof file === "string" || !isUploadBlob(file)) {
    return {
      ok: false,
      error: "File required",
      issues: ["Choose an Excel workbook to upload."],
    };
  }
  const named = typeof file.name === "string" ? file.name.trim() : "";
  return {
    ok: true,
    name: named || "upload.xlsx",
    buffer: await file.arrayBuffer(),
    monthKey: String(form.get("monthKey") || ""),
  };
}
