"use client";

import { useRef, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  Download,
  FileSpreadsheet,
  UploadCloud,
} from "lucide-react";

import { useDeskUpload } from "@/components/dashboard/desk-upload";
import { AppPage, Panel, SectionTitle } from "@/components/layout/app-ui";
import { HorizontalBand } from "@/components/layout/horizontal-rail";
import {
  currentUploadMonthKey,
  volSurfaceSampleFileName,
  volSurfaceSampleLabel,
  type DeskUploadKind,
} from "@/lib/workbook/upload-schema";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function buildMonthOptions(): Array<{ value: string; label: string }> {
  const key = currentUploadMonthKey();
  const [year, month] = key.split("-").map(Number);
  return [{ value: key, label: `${MONTH_NAMES[(month || 1) - 1]} ${year}` }];
}

function Dropzone({
  title,
  subtitle,
  busy,
  onFile,
}: {
  title: string;
  subtitle: string;
  busy: boolean;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div
      className={`upload-dropzone flex flex-col items-center justify-center text-center transition hover:border-gold ${
        busy ? "pointer-events-none cursor-wait opacity-70" : "cursor-pointer"
      } ${dragOver && !busy ? "border-gold bg-gold/10" : ""}`}
      role="button"
      tabIndex={busy ? -1 : 0}
      aria-busy={busy}
      onClick={() => {
        if (!busy) inputRef.current?.click();
      }}
      onKeyDown={(e) => {
        if (busy) return;
        if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!busy) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (busy) return;
        const file = e.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
    >
      <UploadCloud className="mb-2 h-8 w-8 text-gold" />
      <p className="font-bold text-ink">{busy ? "Uploading…" : title}</p>
      <p className="mt-1 text-xs text-muted">{subtitle}</p>
      <p className="mt-2 text-[11px] font-bold tracking-wide text-gold-dark">
        Click Or Drop A File Here
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xlsm"
        className="hidden"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export function MultiUploadPage() {
  const { upload, busyKind, dialogNode } = useDeskUpload();
  const [monthOptions] = useState(buildMonthOptions);
  const [monthKey, setMonthKey] = useState(() => currentUploadMonthKey());
  const volSampleName = volSurfaceSampleFileName();
  const volSampleLabel = volSurfaceSampleLabel();

  function onFile(kind: DeskUploadKind, file: File) {
    void upload(kind, file, kind === "vol-surface" ? monthKey : undefined);
  }

  return (
    <AppPage dense>
      <div className="flex flex-col gap-4">
        <HorizontalBand>
          <Panel>
            <SectionTitle icon={Download}>Sample Input Downloads</SectionTitle>
            <p className="text-sm text-muted">
              Download a sample, or upload a file in the same layout.
            </p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <a
                href={`/samples/${volSampleName}`}
                download={volSampleName}
                className="btn-animated btn-motion btn-accent"
              >
                <span className="btn-shine" aria-hidden />
                <span className="relative z-10 inline-flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4" />
                  {volSampleLabel}
                </span>
              </a>
              <a
                href="/samples/Product_Master_Input_Multiple_Products.xlsx"
                download="Product_Master_Input_Multiple_Products.xlsx"
                className="btn-animated btn-motion btn-accent"
              >
                <span className="btn-shine" aria-hidden />
                <span className="relative z-10 inline-flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4" />
                  Product Master Input · Multiple Products
                </span>
              </a>
              <a
                href="/samples/Product_Master_Input_Multiple_Products_Repeated_Rows.xlsx"
                download="Product_Master_Input_Multiple_Products_Repeated_Rows.xlsx"
                className="btn-animated btn-motion btn-accent"
              >
                <span className="btn-shine" aria-hidden />
                <span className="relative z-10 inline-flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4" />
                  Product Master Input · Multiple Products · Repeated Rows
                </span>
              </a>
            </div>
          </Panel>
        </HorizontalBand>

        <HorizontalBand>
          <div className="grid gap-4 md:grid-cols-2">
            <Panel>
              <SectionTitle icon={UploadCloud}>Upload Volatility Surface</SectionTitle>
              <div className="mb-3 max-w-xs">
                <label className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-gold-dark">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Surface Month
                </label>
                <div className="relative">
                  <CalendarDays className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gold" />
                  <select
                    className="select-dark input-glow w-full cursor-pointer appearance-none rounded-2xl border border-[color:var(--ar-border)] py-3 pl-11 pr-10 text-sm font-semibold outline-none focus:border-gold"
                    value={monthKey}
                    onChange={(e) => setMonthKey(e.target.value)}
                  >
                    {monthOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gold-dark" />
                </div>
              </div>
              <Dropzone
                title="Upload the monthly Volatility Surface file"
                subtitle="Monthly volatility file"
                busy={busyKind != null}
                onFile={(f) => onFile("vol-surface", f)}
              />
            </Panel>
            <Panel>
              <SectionTitle icon={UploadCloud}>Upload Product Master</SectionTitle>
              <p className="mb-3 text-xs text-muted">
                Keep the column names from the sample.
              </p>
              <Dropzone
                title="Upload the Multiple Product Master file"
                subtitle="Product file"
                busy={busyKind != null}
                onFile={(f) => onFile("product-master", f)}
              />
            </Panel>
          </div>
        </HorizontalBand>

        <p className="text-xs text-muted">
          After an upload, open Home to see the new book.
        </p>
      </div>
      {dialogNode}
    </AppPage>
  );
}
