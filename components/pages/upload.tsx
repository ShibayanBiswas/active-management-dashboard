"use client";

import { useState } from "react";
import { CheckCircle2, Download, FileUp, Upload as UploadIcon } from "lucide-react";

import { Field, GhostButton, Input, KpiBand, Panel, PrimaryButton, SectionTitle, TabHeading } from "@/components/ui/desk-ui";
import { useDesk } from "@/lib/context/desk-provider";
import { formatDeskDate } from "@/lib/dates";

type Kind = "master" | "surface" | "chain" | "fixings";
type Result = { summary?: Record<string, unknown>; issues?: string[]; saved?: boolean; saveNote?: string | null; error?: string };

const CARDS: Array<{ kind: Kind; title: string; body: string; accept: string; sample: string }> = [
  {
    kind: "master",
    title: "Product Master",
    body: "One row per option leg with the product fields repeated: allotment and maturity, mobilisation, face value, coupon, tenor, actual target, costs, rates and up to seven observation dates. Replaces the whole book.",
    accept: ".xlsx",
    sample: "/samples/product-master-sample.xlsx",
  },
  {
    kind: "surface",
    title: "Volatility Surface",
    body: "Reference level, a header of moneyness percents and one row of vols per expiry. An Expiry and Spread table on any sheet replaces the bid ask spreads.",
    accept: ".xlsx",
    sample: "/samples/vol-surface-sample.xlsx",
  },
  {
    kind: "chain",
    title: "NSE Option Chain",
    body: "The NSE option chain export for one expiry, calls left of the strike and puts right of it. Enter the expiry date or keep it in the file name.",
    accept: ".csv,.xlsx",
    sample: "/samples/option-chain-sample.csv",
  },
  {
    kind: "fixings",
    title: "Fixing History",
    body: "Optional Date and Close columns for Nifty closes; fills or overrides the closes fetched live.",
    accept: ".csv,.xlsx",
    sample: "/samples/fixings-sample.csv",
  },
];

function UploadCard({ card, deskKey }: { card: (typeof CARDS)[number]; deskKey: string }) {
  const { reload } = useDesk();
  const [file, setFile] = useState<File | null>(null);
  const [expiry, setExpiry] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const send = async (dryRun: boolean) => {
    if (!file) return;
    setBusy(true);
    const form = new FormData();
    form.set("file", file);
    if (dryRun) form.set("dryRun", "1");
    if (expiry) form.set("expiry", expiry);
    if (deskKey) form.set("deskKey", deskKey);
    try {
      const res = await fetch(`/api/uploads/${card.kind}`, { method: "POST", body: form });
      const body = (await res.json()) as Result;
      setResult(body);
      if (body.saved) await reload();
    } catch {
      setResult({ error: "Upload Failed" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel>
      <SectionTitle icon={FileUp}>{card.title}</SectionTitle>
      <p className="mb-3 text-sm text-muted">{card.body}</p>
      <div className="upload-dropzone flex flex-col gap-3 font-ui">
        <input
          type="file"
          accept={card.accept}
          aria-label={`${card.title} File`}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setResult(null);
          }}
        />
        {card.kind === "chain" ? (
          <Field label="Expiry Date">
            <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          </Field>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <GhostButton disabled={!file || busy} onClick={() => void send(true)}>
            <CheckCircle2 className="h-4 w-4" /> Validate
          </GhostButton>
          <PrimaryButton disabled={!file || busy} onClick={() => void send(false)}>
            <UploadIcon className="h-4 w-4" /> Validate And Save
          </PrimaryButton>
          <a className="btn-ghost btn-animated inline-flex items-center gap-2 text-xs" href={card.sample} download>
            <Download className="h-3.5 w-3.5" /> Sample File
          </a>
        </div>
      </div>
      {result ? (
        <div className="mt-3 space-y-2 font-ui text-sm">
          {result.error ? <p className="desk-alert-error">{result.error}</p> : null}
          {result.summary ? (
            <p className="desk-badge-neutral inline-block">
              {Object.entries(result.summary)
                .map(([k, v]) => `${k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase())} ${v ?? "-"}`)
                .join(" · ")}
            </p>
          ) : null}
          {result.saved ? <p className="text-emerald-700 dark:text-emerald-400">Saved And Active On The Desk</p> : null}
          {result.saveNote ? <p className="desk-alert">{result.saveNote}</p> : null}
          {result.issues?.length ? (
            <ul className="desk-alert max-h-40 overflow-auto">
              {result.issues.slice(0, 40).map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}

export function UploadPage() {
  const { data } = useDesk();
  const [deskKey, setDeskKey] = useState("");
  const fixings = data?.fixings ?? [];
  return (
    <>
      <TabHeading title="Uploads" subtitle="Replace the active desk data. Validate parses only; Validate And Save makes the file active for everyone." />
      <KpiBand
        items={[
          { label: "Book Source", value: data ? (data.source === "mongo" ? "Database" : "Demo Seed") : "-" },
          { label: "Products", value: data ? String(data.products.length) : "-" },
          { label: "Surface", value: data?.surface.label ?? "-" },
          { label: "Option Chains", value: data ? String(data.chains.length) : "-" },
          { label: "Fixings", value: fixings.length ? `${fixings.length} To ${formatDeskDate(fixings.at(-1)!.date)}` : "-" },
        ]}
      />
      <Panel className="my-4">
        <Field label="Desk Key" hint="Needed to save when the desk has a write key configured">
          <Input type="password" value={deskKey} onChange={(e) => setDeskKey(e.target.value)} autoComplete="off" />
        </Field>
      </Panel>
      <div className="grid gap-4 xl:grid-cols-2">
        {CARDS.map((card) => (
          <UploadCard key={card.kind} card={card} deskKey={deskKey} />
        ))}
      </div>
    </>
  );
}
