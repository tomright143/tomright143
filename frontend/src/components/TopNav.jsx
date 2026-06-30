import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Film, LogOut, User as UserIcon, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function TopNav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const handleLogout = async () => { await logout(); navigate("/login"); };

  return (
    <header className="border-b border-[#232326] bg-[#0A0A0B]/80 backdrop-blur sticky top-0 z-30">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-8 h-14 flex items-center justify-between">
        <Link to="/dashboard" className="flex items-center gap-2" data-testid="brand-link">
          {user?.brand_logo ? (
            <img src={user.brand_logo} alt="brand" className="h-6"/>
          ) : (
            <>
              <div className="w-6 h-6 rounded-sm bg-[#5A67D8] flex items-center justify-center"><Film className="w-3.5 h-3.5 text-white"/></div>
              <span className="font-mono text-xs tracking-[0.2em] uppercase">Review.io</span>
            </>
          )}
        </Link>
        <nav className="flex items-center gap-2">
          {user?.is_admin && (
            <Link to="/admin" className="hidden sm:inline-block">
              <Button variant="ghost" className="text-[#5A67D8] hover:text-white hover:bg-[#121214] h-9 rounded-sm" data-testid="nav-admin">
                <span className="font-mono text-xs uppercase tracking-wider">Admin</span>
              </Button>
            </Link>
          )}
          <Link to="/pricing" className="hidden sm:inline-block">
            <Button variant="ghost" className="text-[#8A8A93] hover:text-white hover:bg-[#121214] h-9 rounded-sm" data-testid="nav-pricing">
              <span className="font-mono text-xs uppercase tracking-wider">Pricing</span>
            </Button>
          </Link>
          <span className="hidden sm:inline-flex items-center px-2 py-1 border border-[#232326] rounded-sm font-mono text-[10px] uppercase tracking-wider text-[#8A8A93]" data-testid="plan-badge">
            {user?.plan || "free"}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button data-testid="profile-menu-trigger" className="rounded-full focus:outline-none focus:ring-2 focus:ring-[#5A67D8]">
                <Avatar className="w-8 h-8 border border-[#232326]">
                  <AvatarImage src={user?.picture} />
                  <AvatarFallback className="bg-[#121214] text-xs">{user?.name?.[0] || "U"}</AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-[#121214] border-[#232326] text-[#EDEDF0]">
              <div className="px-2 py-1.5">
                <div className="text-sm font-medium">{user?.name}</div>
                <div className="text-xs text-[#8A8A93]">{user?.email}</div>
              </div>
              <DropdownMenuSeparator className="bg-[#232326]"/>
              <DropdownMenuItem onClick={() => navigate("/settings")} data-testid="menu-settings" className="cursor-pointer">
                <UserIcon className="w-3.5 h-3.5 mr-2"/> Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/pricing")} data-testid="menu-billing" className="cursor-pointer">
                <CreditCard className="w-3.5 h-3.5 mr-2"/> Billing
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-[#232326]"/>
              <DropdownMenuItem onClick={handleLogout} data-testid="menu-logout" className="cursor-pointer text-[#EF4444]">
                <LogOut className="w-3.5 h-3.5 mr-2"/> Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
      </div>
    </header>
  );
}
