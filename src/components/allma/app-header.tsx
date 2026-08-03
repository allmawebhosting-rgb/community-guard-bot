import { Link, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, LogOut, Moon, Shield, Sun, UserRound } from "lucide-react";
import { BrandLockup } from "@/components/allma/brand";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/lib/theme";

export function AppHeader() {
  const { theme, toggleTheme } = useTheme();
  const { isAuthenticated, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 glass border-b border-border/70">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between gap-3 px-4">
        <Link to="/chat" className="min-w-0">
          <BrandLockup />
        </Link>


        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Toggle colour theme"
            onClick={toggleTheme}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>

          {isAuthenticated ? (
            <>
              <Button variant="ghost" size="icon" aria-label="Police command center" asChild>
                <Link to="/police">
                  <Shield className="h-4 w-4" />
                </Link>
              </Button>
              <Button variant="ghost" size="icon" aria-label="Dashboard" asChild>
                <Link to="/dashboard">
                  <LayoutDashboard className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Sign out"
                onClick={async () => {
                  await signOut();
                  navigate({ to: "/", replace: true });
                }}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <Button size="sm" className="rounded-full" asChild>
              <Link to="/auth">
                <UserRound className="mr-1.5 h-4 w-4" />
                Sign in
              </Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
