"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart2,
  BookText,
  Play,
  Settings,
} from "lucide-react";
import Image from "next/image";
import organizationLogo from "@/assets/VMLogoWhite.png";
import { PlaceHolderImages } from "@/lib/placeholder-images";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

const navItems = [
  { href: "/dashboard", icon: BarChart2, label: "Dashboard" },
  { href: "/start", icon: Play, label: "New Interview" },
  { href: "/review", icon: BookText, label: "Past Interviews" },
];

export function AppShell({ children, hideLayout = false }: { children: React.ReactNode, hideLayout?: boolean }) {
  const pathname = usePathname();

  if (hideLayout) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <header className="sticky top-0 z-50 border-b bg-white/90 px-4 py-4 backdrop-blur-md md:px-8">
          <div className="mx-auto flex w-full max-w-7xl items-center gap-4">
            <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <Image
                src={organizationLogo}
                alt="ValueMomentum Logo"
                className="h-5 w-auto object-contain"
                style={{ filter: "brightness(0) saturate(100%) invert(32%) sepia(95%) saturate(3083%) hue-rotate(213deg) brightness(99%) contrast(101%)" }}
              />
            </div>
            <div className="h-6 w-px bg-slate-200" />
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md border bg-[#F8F8F8] text-[10px] font-black text-[#056BFC]">A</div>
              <span className="bg-gradient-to-r from-[#303030] to-[#056BFC] bg-clip-text text-lg font-bold text-transparent">
                Aura
              </span>
            </div>
          </div>
        </header>
        <main className="flex-1 flex flex-col pt-6 pb-12 px-4 md:px-8">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50">
      <header className="flex h-16 items-center justify-between border-b bg-white/80 backdrop-blur-md px-6 sticky top-0 z-50">
        <div className="flex items-center gap-6">
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
             <Image
               src={organizationLogo}
               alt="ValueMomentum Logo"
               className="h-5 w-auto object-contain"
               style={{ filter: "brightness(0) saturate(100%) invert(32%) sepia(95%) saturate(3083%) hue-rotate(213deg) brightness(99%) contrast(101%)" }}
             />
          </div>
          <div className="w-px h-6 bg-slate-200" />
          <div className="flex items-center gap-2">
             <div className="h-6 w-6 bg-[#F8F8F8] rounded-md flex items-center justify-center text-[#056BFC] font-black text-[10px] border">A</div>
             <span className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-[#303030] to-[#056BFC]">
               Aura
             </span>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
           {pathname !== "/dashboard" && (
             <Button variant="ghost" asChild className="text-muted-foreground hover:text-foreground">
               <Link href="/dashboard" className="flex items-center gap-2">
                 <BarChart2 className="h-4 w-4" />
                 Dashboard
               </Link>
             </Button>
           )}
           <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-9 w-9 rounded-full ring-2 ring-slate-100 p-0 overflow-hidden">
                <Avatar className="h-full w-full">
                  <AvatarImage src={PlaceHolderImages.find(i => i.id === 'user-avatar')?.imageUrl || '/placeholder-user.jpg'} alt="@user" />
                  <AvatarFallback className="bg-slate-200">U</AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 mt-2" align="end" forceMount>
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-semibold leading-none">Candidate Name</p>
                  <p className="text-xs leading-none text-muted-foreground">
                    Interviewing Mode
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/dashboard" className="w-full">
                  <BarChart2 className="mr-2 h-4 w-4" />
                  <span>View Analytics</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Settings className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      
      <main className="flex-1 max-w-7xl mx-auto w-full py-8 px-4 md:px-8">
        {children}
      </main>

      <footer className="py-6 border-t bg-white flex justify-center">
         <p className="text-xs text-muted-foreground font-medium">Powered by Advanced AI Proctoring &copy; 2026</p>
      </footer>
    </div>
  );
}
