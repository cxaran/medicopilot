import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import type { ResourceCatalog as ResourceCatalogType } from "@/core/api/contracts";
import type { SessionUser } from "@/core/auth/types";

export function PlatformShell({
  session,
  resources,
  children,
}: Readonly<{
  session: SessionUser;
  resources: ResourceCatalogType;
  children: React.ReactNode;
}>) {
  const availableResources = resources.map((resource) => resource.name);

  return (
    <div className="flex min-h-screen bg-[var(--bg)] text-[var(--tx)]">
      <Sidebar availableResources={availableResources} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar session={session} />
        <main className="flex-1 p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
