import * as React from "react";
import Link from "next/link";

import { ProfileButton } from "@/components/ui/profile-button";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white text-black font-sans selection:bg-neon-green selection:text-black">
      {/* Top Navigation - Brutalist Style */}
      <nav className="border-b-4 border-black bg-white sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-20 items-center">
            <div className="flex items-center space-x-8">
              <Link href="/" className="text-3xl font-black tracking-tighter uppercase bg-black text-white px-3 py-1 -rotate-2 hover:rotate-0 transition-transform">
                GTMC
              </Link>
              <div className="hidden md:flex space-x-6">
                <Link href="/articles" className="font-bold text-lg border-b-4 border-transparent hover:border-tech-main transition-colors">
                  DATABASE
                </Link>
                <Link href="/draft" className="font-bold text-lg border-b-4 border-transparent hover:border-hot-pink transition-colors">
                  MY DRAFTS
                </Link>
                <Link href="/review" className="font-bold text-lg border-b-4 border-transparent hover:border-electric-blue transition-colors">
                  REVIEW HUB
                </Link>
              </div>
            </div>
            
            <div className="flex items-center">
              <React.Suspense fallback={<div className="w-10 h-10 border-2 border-black rounded-full bg-neon-green" />}>
                <ProfileButton />
              </React.Suspense>
            </div>
          </div>
        </div>
      </nav>

      <main className="min-h-[calc(100vh-5rem)] bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px]">
        {children}
      </main>
    </div>
  );
}