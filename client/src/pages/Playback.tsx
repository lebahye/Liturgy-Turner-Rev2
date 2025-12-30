import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function Playback() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
        </Link>
        <h1 className="text-3xl font-bold">Playback Recordings</h1>
      </div>
      
      <div className="rounded-lg border bg-white p-12 text-center text-gray-500 shadow-sm dark:bg-gray-800">
         <p className="text-lg">No recordings found.</p>
         <p className="mt-2 text-sm">Recordings created in Training Mode will appear here.</p>
      </div>
    </div>
  );
}
