import multiSeed from "@/lib/data/multi-products-seed.json";
import type { ProductMaster } from "@/lib/types";

const book = multiSeed as ProductMaster[];

/** Live products on the collated FY21–FY27 multi master (unique product codes). */
export const MULTI_BOOK_PRODUCT_COUNT = book.length;

/** Live legs after blank/NaN qty skip and duplicate-position filter. */
export const MULTI_BOOK_LEG_COUNT = book.reduce((sum, product) => sum + product.legs.length, 0);
