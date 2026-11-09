"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BrainCircuit,
  FileSpreadsheet,
  Sparkles,
  Table2,
} from "lucide-react";

import { DeskBookExplorer } from "@/components/dashboard/desk-book-explorer";
import { AssumedLevelInputs } from "@/components/multi/assumed-level-inputs";
import { MultiProductTable } from "@/components/multi/multi-product-table";
import { PostObservationTable } from "@/components/multi/post-observation-table";
import { AppPage, Panel, SectionTitle, SpecRail } from "@/components/layout/app-ui";
import { HorizontalBand, HorizontalRail } from "@/components/layout/horizontal-rail";
import { useDataset } from "@/lib/context/dataset-provider";
import { useMultiDesk } from "@/lib/context/multi-desk-provider";
import { referenceSensexPrice, referenceUnderlyingPrice, INDEX_STRIKE_PRICE_DECIMALS } from "@/lib/engine/vol-surface";
import { uniqueProductsByIsin } from "@/lib/multi/product-key";
import { formatNumber } from "@/lib/utils";
import { volSurfaceSampleFileName } from "@/lib/workbook/upload-schema";

const bandMotion = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const },
};

export function MultiHomePage() {
  const { surface } = useDataset();
  const { products, allProducts } = useMultiDesk();
  // Unique by Product Code (ISIN); name only if code blank — no double counting.
  const uniqueCount = uniqueProductsByIsin(products).length;
  const deskBookCount = uniqueProductsByIsin(allProducts).length;
  const deskBookLegs = allProducts.reduce((sum, item) => sum + item.legs.length, 0);
  const volSampleName = volSurfaceSampleFileName();
  const specCards = [
    { label: "Volatility Surface", value: surface?.label ?? surface?.monthKey ?? "Loading…" },
    {
      label: "Reference Nifty Price",
      value:
        surface && referenceUnderlyingPrice(surface) > 0
          ? `₹ ${formatNumber(referenceUnderlyingPrice(surface), INDEX_STRIKE_PRICE_DECIMALS)}`
          : "—",
    },
    {
      label: "Reference Sensex Price",
      value:
        surface && referenceSensexPrice(surface) > 0
          ? `₹ ${formatNumber(referenceSensexPrice(surface), INDEX_STRIKE_PRICE_DECIMALS)}`
          : "—",
    },
    { label: "Products Loaded", value: String(uniqueCount) },
  ];

  return (
    <AppPage dense>
      <div className="flex flex-col gap-4">
        <motion.div {...bandMotion}>
          <HorizontalBand>
            <motion.header
              className="intel-hero"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, ease: "easeOut" }}
            >
              <span className="intel-hero-orb intel-hero-orb--gold" aria-hidden />
              <span className="intel-hero-orb intel-hero-orb--maroon" aria-hidden />
              <p className="intel-hero-kicker relative z-10">
                Anand Rathi Wealth · Structured Products
              </p>
              <h2 className="intel-hero-title relative z-10">Multiple Product Desk</h2>
              <p className="intel-hero-sub relative z-10">
                Live quotes for products that have not matured. Click a row to open one.
              </p>
              <div className="intel-hero-meta relative z-10">
                <motion.span
                  className="intel-hero-badge"
                  animate={{
                    boxShadow: [
                      "0 0 0 rgba(212,178,76,0)",
                      "0 0 18px rgba(212,178,76,0.35)",
                      "0 0 0 rgba(212,178,76,0)",
                    ],
                  }}
                  transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Live Market Data
                </motion.span>
                <span className="intel-hero-badge">{uniqueCount} Products</span>
                <span className="intel-hero-badge">
                  Surface · {surface?.label ?? surface?.monthKey ?? "Loading…"}
                </span>
                <span className="intel-hero-badge">
                  Nifty · ₹ {formatNumber(surface ? referenceUnderlyingPrice(surface) : null, INDEX_STRIKE_PRICE_DECIMALS)}
                </span>
                <span className="intel-hero-badge">
                  Sensex · ₹ {formatNumber(surface ? referenceSensexPrice(surface) : null, INDEX_STRIKE_PRICE_DECIMALS)}
                </span>
              </div>
            </motion.header>
          </HorizontalBand>
        </motion.div>

        <motion.div {...bandMotion} transition={{ ...bandMotion.transition, delay: 0.05 }}>
          <HorizontalBand>
            <Panel>
              <SectionTitle icon={Sparkles}>Desk Snapshot</SectionTitle>
              <SpecRail cards={specCards} />
            </Panel>
          </HorizontalBand>
        </motion.div>

        <motion.div {...bandMotion} transition={{ ...bandMotion.transition, delay: 0.08 }}>
          <HorizontalBand>
            <Panel>
              <SectionTitle icon={Sparkles}>Product Book</SectionTitle>
              <AssumedLevelInputs />
              <MultiProductTable />
            </Panel>
          </HorizontalBand>
        </motion.div>

        <motion.div {...bandMotion} transition={{ ...bandMotion.transition, delay: 0.1 }}>
          <HorizontalBand>
            <Panel>
              <SectionTitle icon={Sparkles}>Post Observation Analytics</SectionTitle>
              <PostObservationTable />
            </Panel>
          </HorizontalBand>
        </motion.div>

        <motion.div {...bandMotion} transition={{ ...bandMotion.transition, delay: 0.12 }}>
          <HorizontalBand>
            <Panel>
              <SectionTitle icon={Sparkles}>Desk Modules</SectionTitle>
              <div className="grid gap-3 sm:grid-cols-3">
                <Link href="/portfolio/unwinding" className="desk-module-tile">
                  <span className="desk-module-tile__kicker">Portfolio</span>
                  <span className="desk-module-tile__title">Unwinding Calculator</span>
                  <span className="desk-module-tile__cta">
                    Open Quote Desk <ArrowRight className="h-4 w-4" />
                  </span>
                </Link>
                <Link href="/portfolio/pricer" className="desk-module-tile">
                  <span className="desk-module-tile__kicker">Portfolio</span>
                  <span className="desk-module-tile__title">
                    <Table2 className="h-4 w-4 shrink-0 text-gold" /> Pricer Table
                  </span>
                  <span className="desk-module-tile__cta">
                    Open Marks <ArrowRight className="h-4 w-4" />
                  </span>
                </Link>
                <Link href="/intelligence" className="desk-module-tile">
                  <span className="desk-module-tile__kicker">Intelligence</span>
                  <span className="desk-module-tile__title">
                    <BrainCircuit className="h-4 w-4 shrink-0 text-gold" /> Logic Atlas
                  </span>
                  <span className="desk-module-tile__cta">
                    Open Pipelines <ArrowRight className="h-4 w-4" />
                  </span>
                </Link>
              </div>
              <HorizontalRail className="mt-3" fillFirst gap="gap-3">
                <a
                  href={`/samples/${volSampleName}`}
                  download={volSampleName}
                  className="desk-module-tile desk-module-tile--compact"
                >
                  <span className="desk-module-tile__kicker">Sample Input</span>
                  <span className="desk-module-tile__title">
                    <FileSpreadsheet className="h-4 w-4 shrink-0 text-gold" /> Volatility Surface
                  </span>
                </a>
                <a
                  href="/samples/Product_Master_Input_Multiple_Products.xlsx"
                  download="Product_Master_Input_Multiple_Products.xlsx"
                  className="desk-module-tile desk-module-tile--compact"
                >
                  <span className="desk-module-tile__kicker">Sample Input</span>
                  <span className="desk-module-tile__title">
                    <FileSpreadsheet className="h-4 w-4 shrink-0 text-gold" /> Product Master
                  </span>
                </a>
                <a
                  href="/samples/Product_Master_Input_Multiple_Products_Repeated_Rows.xlsx"
                  download="Product_Master_Input_Multiple_Products_Repeated_Rows.xlsx"
                  className="desk-module-tile desk-module-tile--compact"
                >
                  <span className="desk-module-tile__kicker">Sample Input</span>
                  <span className="desk-module-tile__title">
                    <FileSpreadsheet className="h-4 w-4 shrink-0 text-gold" /> Product Master · Repeated Rows
                  </span>
                </a>
              </HorizontalRail>
            </Panel>
          </HorizontalBand>
        </motion.div>

        <motion.div {...bandMotion} transition={{ ...bandMotion.transition, delay: 0.16 }}>
          <HorizontalBand>
            <DeskBookExplorer
              kicker={`${deskBookCount} products · ${deskBookLegs} legs`}
            />
          </HorizontalBand>
        </motion.div>
      </div>
    </AppPage>
  );
}
