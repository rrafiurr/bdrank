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
import { Search, PenSquare, User, Menu, LogOut, X, LayoutDashboard } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import logo from "@/assets/logo-tight.png";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch, type ApiSearchResult } from "@/lib/api";
import { getCategoryDisplay } from "@/lib/categoryDisplay";

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ApiSearchResult | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { user, signOut, loading } = useAuth();

  const userInitials = user?.full_name
    ? user.full_name.split(" ").filter(Boolean).map((n) => n[0]).join("").toUpperCase()
    : user?.email?.[0].toUpperCase() || "U";

  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults(null);
      return;
    }
    const t = setTimeout(() => {
      apiFetch<ApiSearchResult>(`/search?q=${encodeURIComponent(searchQuery.trim())}&limit=5`)
        .then(setSearchResults)
        .catch(() => setSearchResults(null));
    }, 280);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const hasSuggestions =
    searchResults &&
    (searchResults.reviews.length > 0 || searchResults.products.length > 0);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchFocused(false);
        setSearchQuery("");
        setSearchResults(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const clearSearch = () => {
    setSearchQuery("");
    setSearchResults(null);
    inputRef.current?.focus();
  };

  const closeSuggestions = () => {
    setSearchFocused(false);
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

  const showDropdown = searchFocused && (hasSuggestions || (searchQuery.trim().length >= 2 && searchResults));
  const getCategoryColor = (category: string) => getCategoryDisplay(category).searchColor;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/70 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <div className="container flex h-16 items-center gap-3 px-4">

        {/* Logo */}
        <Link to="/" className="flex items-center shrink-0">
          <img src={logo} alt="ReviewHub" className="h-10 md:h-11 w-auto object-contain" />
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden lg:flex items-center gap-1 ml-1">
          <Link
            to="/browse"
            className="text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 px-3 py-1.5 rounded-lg transition-colors"
          >
            Browse
          </Link>
          <Link
            to="/categories"
            className="text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 px-3 py-1.5 rounded-lg transition-colors"
          >
            Categories
          </Link>
        </nav>

        {/* Spacer — pushes search + actions to the right */}
        <div className="flex-1" />

        {/* Search — always visible pill */}
        <div ref={searchRef} className="w-[260px] relative hidden sm:block">
          <form onSubmit={handleSearchSubmit}>
            <div className="relative flex items-center">
              <Search className="absolute left-3.5 h-4 w-4 text-muted-foreground pointer-events-none z-10" />
              <Input
                ref={inputRef}
                type="text"
                placeholder="Search reviews, products…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                className={`h-9 pl-9 pr-8 rounded-full text-sm transition-all duration-200
                  ${searchFocused
                    ? "bg-background border-primary/40 shadow-sm ring-2 ring-primary/10"
                    : "bg-muted/70 border-transparent hover:bg-muted"
                  }`}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-3 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </form>

          {/* Results dropdown */}
          {showDropdown && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-2xl shadow-elevated overflow-hidden animate-fade-in z-50">
              {hasSuggestions ? (
                <div className="p-1.5">
                  {(searchResults!.reviews ?? []).length > 0 && (
                    <>
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-3 py-1.5">Reviews</p>
                      <ul>
                        {searchResults!.reviews.map((r) => (
                          <li key={`r-${r.id}`}>
                            <button
                              onClick={() => { navigate(`/review/${r.id}`); closeSuggestions(); }}
                              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-muted/60 text-left transition-colors"
                            >
                              <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                                <Search className="h-3.5 w-3.5 text-primary" />
                              </div>
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
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-3 py-1.5 mt-1">Products</p>
                      <ul>
                        {searchResults!.products.map((p) => (
                          <li key={`p-${p.id}`}>
                            <button
                              onClick={() => { navigate(`/product/${p.id}`); closeSuggestions(); }}
                              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-muted/60 text-left transition-colors"
                            >
                              <div className="h-7 w-7 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                                <Search className="h-3.5 w-3.5 text-accent" />
                              </div>
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
                  <div className="px-3 py-2 border-t border-border mt-1">
                    <button
                      onClick={handleSearchSubmit as any}
                      className="text-xs text-primary hover:underline"
                    >
                      See all results for "{searchQuery}" →
                    </button>
                  </div>
                </div>
              ) : (
                <div className="px-4 py-3 text-sm text-muted-foreground text-center">
                  No results for "<span className="font-medium text-foreground">{searchQuery}</span>"
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2 shrink-0">
          <Link to="/write-review" className="hidden sm:block">
            <Button variant="hero" size="sm" className="gap-1.5 rounded-full px-4">
              <PenSquare className="h-3.5 w-3.5" />
              Write Review
            </Button>
          </Link>

          {!loading && (
            user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="hidden sm:flex rounded-full h-9 w-9 p-0">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user.avatar_url} />
                      <AvatarFallback className="bg-primary text-primary-foreground text-sm font-semibold">
                        {userInitials}
                      </AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52 rounded-2xl shadow-elevated">
                  <div className="px-3 py-2">
                    <p className="text-sm font-semibold">{user.full_name || user.username || "User"}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild className="cursor-pointer rounded-xl mx-1">
                    <Link to="/profile" className="flex items-center">
                      <User className="h-4 w-4 mr-2" />
                      My Profile
                    </Link>
                  </DropdownMenuItem>
                  {user.is_product_owner && (
                    <DropdownMenuItem asChild className="cursor-pointer rounded-xl mx-1">
                      <Link to="/owner-dashboard" className="flex items-center">
                        <LayoutDashboard className="h-4 w-4 mr-2" />
                        Owner Dashboard
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={signOut}
                    className="text-destructive focus:text-destructive cursor-pointer rounded-xl mx-1 mb-1"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link to="/auth" className="hidden sm:block">
                <Button variant="outline" size="sm" className="gap-1.5 rounded-full px-4">
                  <User className="h-3.5 w-3.5" />
                  Sign In
                </Button>
              </Link>
            )
          )}

          <Button
            variant="ghost"
            size="icon"
            className="md:hidden rounded-full"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile menu */}
      {isMenuOpen && (
        <div className="md:hidden border-t border-border bg-background/98 px-4 py-4 animate-fade-in">
          {/* Mobile Search */}
          <form onSubmit={handleSearchSubmit} className="relative mb-4">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder="Search reviews, products…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-10 rounded-full bg-muted/70 border-transparent"
            />
          </form>

          <nav className="flex flex-col gap-0.5 mb-4">
            <Link
              to="/browse"
              onClick={() => setIsMenuOpen(false)}
              className="text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 px-3 py-2.5 rounded-xl transition-colors"
            >
              Browse Reviews
            </Link>
            <Link
              to="/categories"
              onClick={() => setIsMenuOpen(false)}
              className="text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 px-3 py-2.5 rounded-xl transition-colors"
            >
              Categories
            </Link>
            {user && (
              <Link
                to="/profile"
                onClick={() => setIsMenuOpen(false)}
                className="text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 px-3 py-2.5 rounded-xl transition-colors"
              >
                My Profile
              </Link>
            )}
            {user?.is_product_owner && (
              <Link
                to="/owner-dashboard"
                onClick={() => setIsMenuOpen(false)}
                className="text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 px-3 py-2.5 rounded-xl transition-colors"
              >
                Owner Dashboard
              </Link>
            )}
          </nav>

          <div className="flex gap-2 border-t border-border pt-4">
            <Link to="/write-review" className="flex-1">
              <Button variant="hero" size="sm" className="w-full gap-2 rounded-full">
                <PenSquare className="h-4 w-4" />
                Write Review
              </Button>
            </Link>
            {user ? (
              <Button variant="outline" size="sm" className="flex-1 gap-2 rounded-full" onClick={signOut}>
                <LogOut className="h-4 w-4" />
                Sign Out
              </Button>
            ) : (
              <Link to="/auth" className="flex-1">
                <Button variant="outline" size="sm" className="w-full gap-2 rounded-full">
                  <User className="h-4 w-4" />
                  Sign In
                </Button>
              </Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
