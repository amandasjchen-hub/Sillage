import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index.tsx";
import Auth from "./pages/Auth.tsx";
import Welcome from "./pages/Welcome.tsx";
import Collection from "./pages/Collection.tsx";
import AddPerfume from "./pages/AddPerfume.tsx";
import ScanPerfume from "./pages/ScanPerfume.tsx";
import PerfumeDetail from "./pages/PerfumeDetail.tsx";
import Diary from "./pages/Diary.tsx";
import Shelves from "./pages/Shelves.tsx";
import Discover from "./pages/Discover.tsx";
import Account from "./pages/Account.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

// Show Welcome on the first visit of a tab session.
function WelcomeGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const seen = typeof window !== "undefined" && sessionStorage.getItem("sillage_welcomed") === "1";
  if (loading) return <div className="min-h-screen bg-background" />;
  if (user) return <>{children}</>;
  if (!seen) return <Navigate to="/welcome" replace />;
  return <>{children}</>;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <ThemeProvider>
            <Routes>
              <Route path="/welcome" element={<Welcome />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/" element={<WelcomeGate><ProtectedRoute><Index /></ProtectedRoute></WelcomeGate>} />
              <Route path="/wishlist" element={<ProtectedRoute><Collection status="wishlist" /></ProtectedRoute>} />
              <Route path="/diary" element={<ProtectedRoute><Diary /></ProtectedRoute>} />
              <Route path="/shelves" element={<ProtectedRoute><Shelves /></ProtectedRoute>} />
              <Route path="/discover" element={<ProtectedRoute><Discover /></ProtectedRoute>} />
              <Route path="/account" element={<ProtectedRoute><Account /></ProtectedRoute>} />
              <Route path="/add" element={<ProtectedRoute><AddPerfume /></ProtectedRoute>} />
              <Route path="/scan" element={<ProtectedRoute><ScanPerfume /></ProtectedRoute>} />
              <Route path="/perfume/:id" element={<ProtectedRoute><PerfumeDetail /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </ThemeProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
