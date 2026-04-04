import { Link, useLocation } from 'wouter';
import { cn } from "@/lib/utils";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  
  // Don't show layout on display page
  if (location === '/display') {
    return <div className="h-screen w-screen bg-black text-white">{children}</div>;
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Navigation */}
        <nav className="glass-panel flex items-center justify-between p-4">
          <Link href="/">
            <h1 className="cursor-pointer text-xl font-bold text-gray-800 hover:text-primary">
              Armenian Liturgy Turner
            </h1>
          </Link>
          
          <div className="flex gap-4">
             <Link href="/">
               <span className={cn("cursor-pointer font-medium hover:text-primary", location === '/' && "text-primary")}>Dashboard</span>
             </Link>
             <Link href="/live">
               <span className={cn("cursor-pointer font-medium hover:text-primary", location === '/live' && "text-primary")}>Live Mode</span>
             </Link>
             <Link href="/training">
               <span className={cn("cursor-pointer font-medium hover:text-primary", location === '/training' && "text-primary")}>Training</span>
             </Link>
             <Link href="/dictionary">
               <span className={cn("cursor-pointer font-medium hover:text-primary", location === '/dictionary' && "text-primary")}>Dictionary</span>
             </Link>
             <Link href="/database">
               <span className={cn("cursor-pointer font-medium hover:text-primary", location === '/database' && "text-primary")}>Database</span>
             </Link>
             <Link href="/display" target="_blank">
               <span className="cursor-pointer font-medium hover:text-primary">Display</span>
             </Link>
          </div>
        </nav>

        {children}
      </div>
    </div>
  );
}
