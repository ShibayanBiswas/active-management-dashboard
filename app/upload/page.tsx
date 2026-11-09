import { MultiUploadPage } from "@/components/multi/multi-upload-page";

// Rendered per request so the Surface Month is this month, not the month of the deploy.
export const dynamic = "force-dynamic";

export default function Page() {
  return <MultiUploadPage />;
}
