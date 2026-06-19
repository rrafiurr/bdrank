import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Search, PenSquare, User, Menu, LogOut, X } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import logo from "@/assets/logo-tight.png";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch, type ApiSearchResult } from "@/lib/api";
import { getCategoryDisplay } from "@/lib/categoryDisplay";

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ApiSearchResult | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { user, signOut, loading } = useAuth();

  const userInitials = user?.full_name
    ? user.full_name.split(" ").filter(Boolean).map((n) => n[0]).join("").toUpperCase()
    : user?.email?.[0].toUpperCase() || "U";

  // Debounced search
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults(null);
      return;
    }
    const t = setTimeout(() => {
      apiFetch<ApiSearchResult>(`/search?q=${encodeURIComponent(searchQuery.trim())}&limit=5`)
        .then(setSearchResults)
        .catch(() => setSearchResults(null));
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const hasSuggestions =
    searchResults &&
    (searchResults.reviews.length > 0 || searchResults.products.length > 0);

  // Close search when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
        setSearchQuery("");
        setSearchResults(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Focus input when search opens
  useEffect(() => {
    if (isSearchOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isSearchOpen]);

  const handleSearchToggle = () => {
    setIsSearchOpen(!isSearchOpen);
    if (isSearchOpen) {
      setSearchQuery("");
      setSearchResults(null);
    }
  };

  const closeSuggestions = () => {
    setIsSearchOpen(false);
    setSearchQuery("");
    setSearchResults(null);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/browse?q=${encodeURIComponent(searchQuery.trim())}`);
      closeSuggestions();
    }
  };

  const getCategoryColor = (category: string) =>
    getCategoryDisplay(category).searchColor;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="container flex h-20 items-center justify-between px-4">
        <Link to="/" className="flex items-center">
          <img src={logo} alt="BdRanks" className="h-14 md:h-16 w-auto object-contain" />
        </Link>

        <nav className="hidden md:flex items-center gap-6">
          <Link to="/browse" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Browse Reviews
          </Link>
          <Link to="/timeline" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Timeline Reviews
          </Link>
          <Link to="/categories" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            Categories
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          {/* Search Section */}
          <div ref={searchRef} className="relative hidden sm:flex items-center">
            <div
              className={`
                flex items-center overflow-hidden transition-all duration-300 ease-out
                ${isSearchOpen ? "w-64" : "w-0"}
              `}
            >
              <form onSubmit={handleSearchSubmit} className="relative w-full">
                <Input
                  ref={inputRef}
                  type="text"
                  placeholder="Search reviews..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 w-full pr-8 border-border bg-background"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </form>
            </div>
            
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleSearchToggle}
              className={`transition-colors ${isSearchOpen ? "text-primary" : ""}`}
            >
              <Search className="h-5 w-5" />
            </Button>

            {/* Search Results Dropdown */}
            {isSearchOpen && hasSuggestions && (
              <div className="absolute top-full right-0 mt-2 w-80 bg-card border border-border rounded-lg shadow-lg overflow-hidden animate-fade-in z-50">
                <div className="p-2">
                  {(searchResults!.reviews ?? []).length > 0 && (
                    <>
                      <p className="text-xs text-muted-foreground px-2 py-1">Reviews</p>
                      <ul className="space-y-1 mb-1">
                        {searchResults!.reviews.map((r) => (
                          <li key={`r-${r.id}`}>
                            <button
                              onClick={() => { navigate(`/review/${r.id}`); closeSuggestions(); }}
                              className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent text-left transition-colors"
                            >
                              <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">{r.title}</p>
                                <p className={`text-xs capitalize ${getCategoryColor(r.category)}`}>{r.category}</p>
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {(searchResults!.products ?? []).length > 0 && (
                    <>
                      <p className="text-xs text-muted-foreground px-2 py-1">Products</p>
                      <ul className="space-y-1">
                        {searchResults!.products.map((p) => (
                          <li key={`p-${p.id}`}>
                            <button
                              onClick={() => { navigate(`/product/${p.id}`); closeSuggestions(); }}
                              className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent text-left transition-colors"
                            >
                              <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                                <p className={`text-xs capitalize ${getCategoryColor(p.category)}`}>{p.category}</p>
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* No Results */}
            {isSearchOpen && searchQuery.trim().length >= 2 && searchResults && !hasSuggestions && (
              <div className="absolute top-full right-0 mt-2 w-80 bg-card border border-border rounded-lg shadow-lg p-4 animate-fade-in z-50">
                <p className="text-sm text-muted-foreground text-center">
                  No results for "{searchQuery}"
                </p>
              </div>
            )}
          </div>

          <Link to="/write-review">
            <Button variant="hero" size="sm" className="hidden sm:flex gap-2">
              <PenSquare className="h-4 w-4" />
              Write Review
            </Button>
          </Link>
          
          {!loading && (
            user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="hidden sm:flex gap-2 px-2">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user.avatar_url} />
                      <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                        {userInitials}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 bg-card border-border">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium">{user.full_name || user.username || "User"}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild className="cursor-pointer">
                    <Link to="/profile" className="flex items-center">
                      <User className="h-4 w-4 mr-2" />
                      My Profile
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive cursor-pointer">
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link to="/auth">
                <Button variant="outline" size="sm" className="hidden sm:flex gap-2">
                  <User className="h-4 w-4" />
                  Sign In
                </Button>
              </Link>
            )
          )}
          
          <Button 
            variant="ghost" 
            size="icon" 
            className="md:hidden"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Mobile menu */}
      {isMenuOpen && (
        <div className="md:hidden border-t border-border bg-background p-4 animate-fade-in">
          <nav className="flex flex-col gap-3">
            {/* Mobile Search */}
            <form onSubmit={handleSearchSubmit} className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search reviews..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-10"
              />
            </form>
            <Link to="/browse" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors py-2">
              Browse Reviews
            </Link>
            <Link to="/timeline" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors py-2">
              Timeline Reviews
            </Link>
            <Link to="/categories" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors py-2">
              Categories
            </Link>
            {user && (
              <Link to="/profile" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors py-2">
                My Profile
              </Link>
            )}
            <div className="flex gap-2 pt-2">
              <Link to="/write-review" className="flex-1">
                <Button variant="hero" size="sm" className="w-full gap-2">
                  <PenSquare className="h-4 w-4" />
                  Write Review
                </Button>
              </Link>
              {user ? (
                <Button variant="outline" size="sm" className="flex-1 gap-2" onClick={signOut}>
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </Button>
              ) : (
                <Link to="/auth" className="flex-1">
                  <Button variant="outline" size="sm" className="w-full gap-2">
                    <User className="h-4 w-4" />
                    Sign In
                  </Button>
                </Link>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
