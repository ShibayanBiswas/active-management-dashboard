"use client";

import Image from "next/image";
import Link from "next/link";

import { useTheme } from "@/lib/context/theme-provider";

export function BrandLogo() {
  const { theme } = useTheme();
  const src = theme === "dark" ? "/brand/arwl-logo-white.png" : "/brand/arwl-logo.png";
  return (
    <Link href="/" className="flex shrink-0 items-center">
      <Image src={src} alt="Anand Rathi Wealth" width={148} height={42} priority className="h-10 w-auto" />
    </Link>
  );
}
