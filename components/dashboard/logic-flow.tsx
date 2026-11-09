"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Cpu,
  Database,
  LineChart,
  Search,
  Zap,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type FlowNodeKind = "input" | "process" | "engine" | "lookup" | "output";

export type FlowNodeSpec = {
  id?: string;
  kind: FlowNodeKind;
  label: string;
  description: string;
};

const kindIcons: Record<FlowNodeKind, LucideIcon> = {
  input: Search,
  process: Cpu,
  engine: Zap,
  lookup: Database,
  output: LineChart,
};

const kindColorMap: Record<
  FlowNodeKind,
  { border: string; bg: string; text: string; textDark: string; iconBg: string }
> = {
  input: {
    border: "border-sky-400/50",
    bg: "bg-gradient-to-br from-sky-50 via-white to-cyan-50/70",
    text: "text-sky-800",
    textDark: "dark:text-sky-300",
    iconBg: "bg-sky-500/12 dark:bg-sky-400/15",
  },
  process: {
    border: "border-teal-500/45",
    bg: "bg-gradient-to-br from-teal-50 via-white to-emerald-50/60",
    text: "text-teal-800",
    textDark: "dark:text-teal-300",
    iconBg: "bg-teal-500/12 dark:bg-teal-400/15",
  },
  engine: {
    border: "border-violet-500/45",
    bg: "bg-gradient-to-br from-violet-50 via-white to-fuchsia-50/50",
    text: "text-violet-900",
    textDark: "dark:text-violet-300",
    iconBg: "bg-violet-500/12 dark:bg-violet-400/15",
  },
  lookup: {
    border: "border-indigo-500/45",
    bg: "bg-gradient-to-br from-indigo-50 via-white to-blue-50/60",
    text: "text-indigo-900",
    textDark: "dark:text-indigo-300",
    iconBg: "bg-indigo-500/12 dark:bg-indigo-400/15",
  },
  output: {
    border: "border-emerald-500/50",
    bg: "bg-gradient-to-br from-emerald-50 via-white to-lime-50/50",
    text: "text-emerald-900",
    textDark: "dark:text-emerald-300",
    iconBg: "bg-emerald-500/12 dark:bg-emerald-400/15",
  },
};

const arrowByKind: Record<FlowNodeKind, string> = {
  input: "text-sky-600/80 dark:text-sky-400/90",
  process: "text-teal-600/80 dark:text-teal-400/90",
  engine: "text-violet-600/80 dark:text-violet-400/90",
  lookup: "text-indigo-600/80 dark:text-indigo-400/90",
  output: "text-emerald-600/80 dark:text-emerald-400/90",
};

function FlowNode({
  node,
  index,
  active,
  onClick,
}: {
  node: FlowNodeSpec;
  index: number;
  active?: boolean;
  onClick?: () => void;
}) {
  const reduce = useReducedMotion();
  const Icon = kindIcons[node.kind];
  const colors = kindColorMap[node.kind];
  return (
    <motion.button
      type="button"
      onClick={onClick}
      className={cn(
        "logic-node group relative w-full overflow-hidden rounded-xl border p-3.5 text-left shadow-sm transition-all duration-200",
        `logic-node--${node.kind}`,
        colors.border,
        colors.bg,
        active && "ring-2 ring-gold/50 ring-offset-2 ring-offset-[color:var(--ar-surface)]",
        onClick && "cursor-pointer hover:shadow-lg",
      )}
      initial={reduce ? false : { opacity: 0, y: 14, scale: 0.96 }}
      animate={reduce ? undefined : { opacity: 1, y: 0, scale: 1 }}
      whileHover={reduce ? undefined : { y: -4, scale: 1.02 }}
      transition={{ delay: index * 0.06, duration: 0.35, ease: "easeOut" }}
    >
      <motion.span
        aria-hidden
        className="logic-node__orb"
        animate={reduce ? undefined : { opacity: [0.35, 0.65, 0.35], scale: [1, 1.15, 1] }}
        transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut", delay: index * 0.12 }}
      />
      <div className="relative z-[1] flex items-start gap-3">
        <motion.div
          className={cn("rounded-xl p-2", colors.iconBg)}
          animate={reduce ? undefined : { rotate: [0, -6, 6, 0] }}
          transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut", delay: index * 0.18 }}
        >
          <Icon className={cn("h-4 w-4", colors.text, colors.textDark)} />
        </motion.div>
        <div className="min-w-0 flex-1">
          <p className={cn("text-[10px] font-bold uppercase tracking-[0.25em]", colors.text, colors.textDark)}>
            {node.kind}
          </p>
          <p className="mt-1 font-semibold text-ink dark:text-stone-100">{node.label}</p>
          {node.description ? (
            <p className="mt-1.5 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
              {node.description}
            </p>
          ) : null}
        </div>
      </div>
    </motion.button>
  );
}

function FlowArrow({ toKind }: { toKind: FlowNodeKind }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className="flex flex-col items-center justify-center py-1"
      animate={reduce ? undefined : { opacity: [0.45, 1, 0.45], x: [0, 3, 0] }}
      transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
    >
      <ArrowRight className={cn("h-4 w-4", arrowByKind[toKind])} />
    </motion.div>
  );
}

/** Horizontal pipeline of flow nodes joined by animated arrows. */
export function LogicFlowDiagram({
  nodes,
  activeNodeId,
  onNodeSelect,
}: {
  nodes: FlowNodeSpec[];
  activeNodeId?: string;
  onNodeSelect?: (node: FlowNodeSpec) => void;
}) {
  return (
    <div className="logic-pipeline-rail -mx-1 overflow-x-auto px-1 pb-2">
      <div className="flex min-w-min snap-x snap-mandatory items-stretch gap-2">
        {nodes.map((node, index) => (
          <div
            key={node.id ?? node.label}
            className="flex min-w-[300px] max-w-[440px] snap-start items-center gap-2"
          >
            {index > 0 ? <FlowArrow toKind={node.kind} /> : null}
            <FlowNode
              index={index}
              node={node}
              active={Boolean(activeNodeId) && (node.id ?? node.label) === activeNodeId}
              onClick={onNodeSelect ? () => onNodeSelect(node) : undefined}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
