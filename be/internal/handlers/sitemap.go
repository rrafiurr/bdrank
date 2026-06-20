package handlers

import (
	"database/sql"
	"encoding/xml"
	"fmt"
	"net/http"
	"time"
)

type SitemapHandler struct {
	db      *sql.DB
	siteURL string
}

func NewSitemapHandler(db *sql.DB, siteURL string) *SitemapHandler {
	return &SitemapHandler{db: db, siteURL: siteURL}
}

type urlEntry struct {
	Loc        string `xml:"loc"`
	Lastmod    string `xml:"lastmod,omitempty"`
	Changefreq string `xml:"changefreq,omitempty"`
	Priority   string `xml:"priority,omitempty"`
}

type urlSet struct {
	XMLName xml.Name   `xml:"urlset"`
	Xmlns   string     `xml:"xmlns,attr"`
	URLs    []urlEntry `xml:"url"`
}

func (h *SitemapHandler) Sitemap(w http.ResponseWriter, r *http.Request) {
	siteURL := h.siteURL
	if siteURL == "" {
		scheme := "http"
		if r.TLS != nil {
			scheme = "https"
		}
		siteURL = fmt.Sprintf("%s://%s", scheme, r.Host)
	}

	urls := []urlEntry{
		{Loc: siteURL + "/", Changefreq: "daily", Priority: "1.0"},
		{Loc: siteURL + "/browse", Changefreq: "hourly", Priority: "0.9"},
		{Loc: siteURL + "/categories", Changefreq: "weekly", Priority: "0.8"},
	}

	// Dynamic: approved reviews
	rows, err := h.db.QueryContext(r.Context(), `
		SELECT id, updated_at FROM reviews WHERE is_approved = 1 ORDER BY updated_at DESC LIMIT 1000`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var id int64
			var updatedAt time.Time
			if rows.Scan(&id, &updatedAt) == nil {
				urls = append(urls, urlEntry{
					Loc:        fmt.Sprintf("%s/review/%d", siteURL, id),
					Lastmod:    updatedAt.Format("2006-01-02"),
					Changefreq: "weekly",
					Priority:   "0.7",
				})
			}
		}
	}

	// Dynamic: products
	prows, err := h.db.QueryContext(r.Context(), `
		SELECT id, created_at FROM products ORDER BY created_at DESC LIMIT 500`)
	if err == nil {
		defer prows.Close()
		for prows.Next() {
			var id int64
			var createdAt time.Time
			if prows.Scan(&id, &createdAt) == nil {
				urls = append(urls, urlEntry{
					Loc:        fmt.Sprintf("%s/product/%d", siteURL, id),
					Lastmod:    createdAt.Format("2006-01-02"),
					Changefreq: "weekly",
					Priority:   "0.6",
				})
			}
		}
	}

	// Dynamic: published static pages
	pgrows, err := h.db.QueryContext(r.Context(), `
		SELECT slug, updated_at FROM pages WHERE is_published = 1`)
	if err == nil {
		defer pgrows.Close()
		for pgrows.Next() {
			var slug string
			var updatedAt time.Time
			if pgrows.Scan(&slug, &updatedAt) == nil {
				urls = append(urls, urlEntry{
					Loc:        fmt.Sprintf("%s/page/%s", siteURL, slug),
					Lastmod:    updatedAt.Format("2006-01-02"),
					Changefreq: "monthly",
					Priority:   "0.5",
				})
			}
		}
	}

	us := urlSet{Xmlns: "http://www.sitemaps.org/schemas/sitemap/0.9", URLs: urls}
	data, err := xml.MarshalIndent(us, "", "  ")
	if err != nil {
		http.Error(w, "failed to generate sitemap", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/xml; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(xml.Header))
	w.Write(data)
}
