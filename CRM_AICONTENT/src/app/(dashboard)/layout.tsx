"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { AuthProvider } from "@/lib/auth/auth-context";
import { AuthGuard } from "@/lib/auth/auth-guard";
import { JobsProvider } from "@/lib/hooks/use-jobs";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <AuthGuard>
        <JobsProvider>
          <div className="min-h-screen bg-background">
            <Sidebar />
            <main className="pl-[260px]">
              <div className="mx-auto max-w-[1400px] p-6 lg:p-8">{children}</div>
            </main>
          </div>
        </JobsProvider>
      </AuthGuard>
    </AuthProvider>
  );
}
