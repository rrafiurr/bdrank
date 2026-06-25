import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index";
import ReviewDetails from "./pages/ReviewDetails";
import Categories from "./pages/Categories";
import WriteReview from "./pages/WriteReview";
import Auth from "./pages/Auth";
import AddTimeline from "./pages/AddTimeline";
import Profile from "./pages/Profile";
import BrowseReviews from "./pages/BrowseReviews";
import ProductReviews from "./pages/ProductReviews";
import StaticPage from "./pages/StaticPage";
import OwnerRegister from "./pages/OwnerRegister";
import OwnerDashboard from "./pages/OwnerDashboard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/review/:id" element={<ReviewDetails />} />
            <Route path="/review/:id/add-timeline" element={<AddTimeline />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/browse" element={<BrowseReviews />} />
            <Route path="/write-review" element={<WriteReview />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/product/:id" element={<ProductReviews />} />
            <Route path="/page/:slug" element={<StaticPage />} />
            <Route path="/owner-register" element={<OwnerRegister />} />
            <Route path="/owner-dashboard" element={<OwnerDashboard />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
