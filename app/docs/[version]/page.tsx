import { notFound } from "next/navigation";
import { DeveloperPortal } from "@/src/components/docs/DeveloperPortal";

export function generateStaticParams() {
  return [{ version: "v1" }, { version: "v2" }];
}

export default async function DocumentationPage({
  params,
}: {
  params: Promise<{ version: string }>;
}) {
  const { version } = await params;
  if (version !== "v1" && version !== "v2") notFound();
  return <DeveloperPortal version={version} />;
}
