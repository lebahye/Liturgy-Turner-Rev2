import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/Layout";
import Home from "@/pages/Home";
import Live from "@/pages/Live";
import Training from "@/pages/Training";
import Display from "@/pages/Display";
import Playback from "@/pages/Playback";
import Bot from "@/pages/Bot";
import Dictionary from "@/pages/Dictionary";
import DatabaseViewer from "@/pages/DatabaseViewer";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/live" component={Live} />
      <Route path="/training" component={Training} />
      <Route path="/display" component={Display} />
      <Route path="/playback" component={Playback} />
      <Route path="/bot" component={Bot} />
      <Route path="/dictionary" component={Dictionary} />
      <Route path="/database" component={DatabaseViewer} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Layout>
          <Router />
        </Layout>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
