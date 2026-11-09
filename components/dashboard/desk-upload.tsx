"use client";

import { useRef, useState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";

import { DeskDialog, type DeskDialogTone } from "@/components/ui/desk-dialog";
import { useDataset } from "@/lib/context/dataset-provider";
import { useWriteFetch } from "@/lib/context/desk-key-provider";
import type { ProductMaster, VolSurface } from "@/lib/types";
import {
  currentUploadMonthKey,
  MAX_UPLOAD_BYTES,
  productMasterDeskMismatch,
  type DeskUploadKind,
} from "@/lib/workbook/upload-schema";

type DialogState = {
  tone: DeskDialogTone;
  title: string;
  body: string;
  issues: string[];
};

function currentMonthLabel(): string {
  return new Date().toLocaleString("en-IN", { month: "long", year: "numeric" });
}

export function useDeskUpload() {
  const { refresh, applyBook } = useDataset();
  const writeFetch = useWriteFetch();
  const [busyKind, setBusyKind] = useState<DeskUploadKind | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const inFlight = useRef(false);

  async function upload(kind: DeskUploadKind, file: File, monthKey = currentUploadMonthKey()) {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusyKind(kind);
    try {
      if (file.size > MAX_UPLOAD_BYTES) {
        setDialog({
          tone: "error",
          title: "Upload Failed",
          body: "The upload could not be completed. Check the file and try again.",
          issues: [
            "This workbook is larger than 96 MB. Upload a Product Master or Volatility Surface workbook, not an unrelated archive.",
          ],
        });
        return false;
      }
      if (kind === "product-master") {
        const deskIssue = productMasterDeskMismatch(file.name, "multi");
        if (deskIssue) {
          setDialog({
            tone: "error",
            title: "Wrong Desk For This File",
            body: "The header buttons replace the full product book. This file is a single-product master.",
            issues: [deskIssue],
          });
          return false;
        }
      }
      const form = new FormData();
      form.append("file", file);
      if (kind === "vol-surface") form.append("monthKey", monthKey);
      const endpoint =
        kind === "vol-surface" ? "/api/uploads/vol-surface" : "/api/multi/uploads/product-master";
      const res = await writeFetch(endpoint, { method: "POST", body: form });
      if (!res) return false;
      const raw = await res.text();
      let data: {
        error?: string;
        issues?: string[];
        persisted?: boolean;
        surface?: {
          label?: string;
          monthKey?: string;
          expiries?: string[];
          moneyness?: number[];
          pricingParams?: { fwdSellRate?: number; volBump?: number }[];
          referenceUnderlyingPrice?: number;
        };
        product?: { productName?: string; productCode?: string; legs?: unknown[] };
        products?: ProductMaster[];
        summary?: {
          expiries?: number;
          strikePercents?: number[];
          productName?: string;
          productCode?: string;
          legs?: number;
        };
      } = {};
      try {
        data = raw ? (JSON.parse(raw) as typeof data) : {};
      } catch {
        data = {
          error: `HTTP ${res.status}`,
          issues: [
            res.status === 413
              ? "This workbook is over the 4.5 MB request limit of the hosted desk. Upload it from a local run (npm run dev), or send a smaller workbook."
              : res.status >= 500
                ? "The server could not read this workbook. Use the Product Master or Volatility Surface sample."
                : "The server did not accept this workbook.",
          ],
        };
      }
      if (!res.ok) {
        const issues = data.issues?.length
          ? data.issues
          : [data.error || "The server did not accept this workbook."];
        const databaseIssue = issues.some((issue) => /write concern|desk database|mongo/i.test(issue));
        // Refused by the Desk Key check before the workbook was read.
        const guardRefusal = res.status === 413 || res.status === 429 || res.status === 503;
        setDialog({
          tone: "error",
          title: guardRefusal && data.error ? data.error : "Upload Failed",
          body: guardRefusal
            ? "The workbook was not saved."
            : res.status >= 500 || databaseIssue
              ? "The workbook was read, but the desk database could not save it. Try Save again after the next deploy."
              : kind === "vol-surface"
                ? "This file does not match the Volatility Surface sample. Keep the same labels and sheet layout. You may add or remove expiry rows and strike-percent columns."
                : "This file does not match the Multiple Products master sample. Keep the same 28 column labels. One workbook replaces every product on this desk.",
          issues,
        });
        return false;
      }
      if (data.surface) applyBook({ surface: data.surface as unknown as VolSurface });
      if (data.products?.length) applyBook({ products: data.products, product: data.product as ProductMaster | undefined });
      else if (data.product) applyBook({ product: data.product as unknown as ProductMaster });
      if (kind === "vol-surface") {
        const expiries = data.summary?.expiries ?? data.surface?.expiries?.length ?? 0;
        const percents = data.summary?.strikePercents?.length ?? data.surface?.moneyness?.length ?? 0;
        const fwd = data.surface?.pricingParams?.[0]?.fwdSellRate;
        const fwdLabel =
          typeof fwd === "number" && Number.isFinite(fwd) ? ` Forward Sell Rate ${(fwd * 100).toFixed(2)}%.` : "";
        const persistNote =
          data.persisted === false
            ? " This session is using the upload in memory — the desk database did not save it, so a hard reload may revert."
            : "";
        setDialog({
          tone: data.persisted === false ? "error" : "success",
          title: data.persisted === false ? "Upload Applied Locally" : "Upload Complete",
          body: `Volatility Surface replaced. Home now reads ${data.surface?.label ?? currentMonthLabel()}.${fwdLabel} ${expiries} expiries and ${percents} strike percents were accepted.${persistNote}`,
          issues:
            data.persisted === false
              ? ["Set MONGODB_URI on the host so Volatility Surface uploads survive a reload."]
              : [],
        });
      } else {
        const legs = data.summary?.legs ?? data.product?.legs?.length ?? 0;
        const productCount = data.products?.length ?? 1;
        const persistNote =
          data.persisted === false
            ? " This session is using the upload in memory — the desk database did not save it, so a hard reload may revert."
            : "";
        setDialog({
          tone: data.persisted === false ? "error" : "success",
          title: data.persisted === false ? "Upload Applied Locally" : "Upload Complete",
          body:
            `The desk now reads ${productCount > 1 ? `${productCount} products` : data.product?.productName ?? "the uploaded product"} with ${legs} option legs.` +
            persistNote,
          issues:
            data.persisted === false
              ? ["Set MONGODB_URI on the host so Product Master uploads survive a reload."]
              : [],
        });
      }
      // Do not block the upload spinner on a heavy Multi dataset refresh — book is already applied.
      void refresh()
        .then(() => {
          if (data.surface) applyBook({ surface: data.surface as unknown as VolSurface });
          if (data.products?.length) {
            applyBook({ products: data.products, product: data.product as ProductMaster | undefined });
          } else if (data.product) {
            applyBook({ product: data.product as unknown as ProductMaster });
          }
        })
        .catch(() => {
          // Upload payload already applied above.
        });
      return true;
    } catch (e) {
      setDialog({
        tone: "error",
        title: "Upload Failed",
        body: "The upload could not be completed. Check the file and try again.",
        issues: [
          e instanceof Error && e.message
            ? e.message
            : "The server did not accept this workbook.",
        ],
      });
      return false;
    } finally {
      inFlight.current = false;
      setBusyKind(null);
    }
  }

  function closeDialog() {
    setDialog(null);
  }

  const dialogNode = (
    <DeskDialog
      open={Boolean(dialog)}
      tone={dialog?.tone ?? "success"}
      title={dialog?.title ?? ""}
      onClose={closeDialog}
    >
      <p>{dialog?.body}</p>
      {dialog?.issues.length ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-maroon dark:text-gold">
          {dialog.issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      ) : null}
    </DeskDialog>
  );

  return { upload, busyKind, dialogNode };
}

export function HeaderUploadShortcuts() {
  const { upload, busyKind, dialogNode } = useDeskUpload();
  const volRef = useRef<HTMLInputElement>(null);
  const masterRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <div className="header-actions">
        <span className="hidden rounded-full border border-gold/35 bg-gold/15 px-2.5 py-1 text-[10px] font-bold tracking-wide text-gold-dark xl:inline-flex">
          Multiple Product
        </span>
        <button
          type="button"
          className="btn-animated btn-motion btn-accent !px-3 !py-1.5 text-xs"
          disabled={busyKind != null}
          title="Upload Volatility Surface"
          aria-label="Upload Volatility Surface"
          onClick={() => volRef.current?.click()}
        >
          <span className="btn-shine" aria-hidden />
          <span className="relative z-10 inline-flex items-center gap-1.5">
            <Upload className="h-3.5 w-3.5" />
            <FileSpreadsheet className="hidden h-3.5 w-3.5 sm:inline" />
            <span className="hidden lg:inline">{busyKind === "vol-surface" ? "Uploading…" : "Upload Volatility Surface"}</span>
            <span className="lg:hidden">{busyKind === "vol-surface" ? "…" : "Vol Surface"}</span>
          </span>
        </button>
        <button
          type="button"
          className="btn-animated btn-motion btn-accent !px-3 !py-1.5 text-xs"
          disabled={busyKind != null}
          title="Upload the product book"
          aria-label="Upload Multiple Product Master"
          onClick={() => masterRef.current?.click()}
        >
          <span className="btn-shine" aria-hidden />
          <span className="relative z-10 inline-flex items-center gap-1.5">
            <Upload className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">
              {busyKind === "product-master" ? "Uploading…" : "Upload Multiple Product Master"}
            </span>
            <span className="lg:hidden">
              {busyKind === "product-master" ? "…" : "Multi Master"}
            </span>
          </span>
        </button>
        <input
          ref={volRef}
          type="file"
          accept=".xlsx,.xlsm"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload("vol-surface", file);
            e.target.value = "";
          }}
        />
        <input
          ref={masterRef}
          type="file"
          accept=".xlsx,.xlsm"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload("product-master", file);
            e.target.value = "";
          }}
        />
      </div>
      {dialogNode}
    </>
  );
}
