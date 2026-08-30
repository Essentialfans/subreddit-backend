"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Moon, Sparkles, Sun } from "lucide-react";
import { navigation } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth/auth-context";
import { useHasMounted } from "@/lib/hooks/use-has-mounted";
import { Button } from "@/components/ui/button";

export function Sidebar() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { signOut } = useAuth();
  const mounted = useHasMounted();

  const isDark = mounted ? theme === "dark" : true;

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-[260px] flex-col border-r border-border bg-sidebar">
      <div className="flex h-16 items-center gap-2.5 border-b border-border px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
          <Sparkles className="h-4 w-4 text-primary-foreground" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">AiInstaReels</p>
          <p className="text-[10px] text-muted-foreground">Content Studio</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {navigation.map((section) => (
          <div key={section.title} className="mb-5">
            <p className="mb-2 px-3 text-[10px] font-semibold tracking-wider text-muted-foreground">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                const Icon = item.icon;

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                        isActive
                          ? "bg-sidebar-active text-primary shadow-[inset_0_0_0_1px_rgba(124,58,237,0.25)]"
                          : "text-sidebar-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="space-y-2 border-t border-border p-4">
        <button
          type="button"
          onClick={() => setTheme(isDark ? "light" : "dark")}
          className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {isDark ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
          {isDark ? "Light mode" : "Dark mode"}
        </button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start px-3"
          onClick={signOut}
        >
          Sign out
        </Button>
      </div>
    </aside>
  );
}
