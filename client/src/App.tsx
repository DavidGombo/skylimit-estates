import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AccessGate } from "@/components/AccessGate";
import Dashboard from "@/pages/Dashboard";
import Properties from "@/pages/Properties";
import PropertyDetail from "@/pages/PropertyDetail";
import TenantsHub from "@/pages/TenantsHub";
import ComplianceHub from "@/pages/ComplianceHub";
import MaintenanceHub from "@/pages/MaintenanceHub";
import UtilitiesHub from "@/pages/UtilitiesHub";
import Finance from "@/pages/Finance";
import SendStatements from "@/pages/SendStatements";
import StatementEditor from "@/pages/StatementEditor";
import StatementPrint from "@/pages/StatementPrint";
import WorkOrder from "@/pages/WorkOrder";

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/properties" component={Properties} />
      <Route path="/property/:id" component={PropertyDetail} />
      <Route path="/tenants" component={TenantsHub} />
      <Route path="/compliance" component={ComplianceHub} />
      <Route path="/maintenance" component={MaintenanceHub} />
      <Route path="/utilities" component={UtilitiesHub} />
      <Route path="/finance" component={Finance} />
      <Route path="/send" component={SendStatements} />
      <Route path="/new/:propertyId" component={StatementEditor} />
      <Route path="/edit/:id" component={StatementEditor} />
      <Route path="/print/:id" component={StatementPrint} />
      <Route path="/work-order/:id" component={WorkOrder} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AccessGate>
          <Router hook={useHashLocation}>
            <AppRouter />
          </Router>
        </AccessGate>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
