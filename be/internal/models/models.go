package models

import "time"

type User struct {
	ID        int64     `json:"id"`
	Email     string    `json:"email"`
	FullName  string    `json:"full_name"`
	Username  string    `json:"username"`
	Bio       string    `json:"bio"`
	AvatarURL string    `json:"avatar_url"`
	CreatedAt time.Time `json:"created_at"`
}

type Product struct {
	ID          int64     `json:"id"`
	Name        string    `json:"name"`
	Category    string    `json:"category"`
	ImageURL    string    `json:"image_url"`
	ReviewCount int       `json:"review_count"`
	AvgRating   float64   `json:"avg_rating"`
	CreatedAt   time.Time `json:"created_at"`
}

type Review struct {
	ID                   int64           `json:"id"`
	Title                string          `json:"title"`
	Content              string          `json:"content,omitempty"`
	Excerpt              string          `json:"excerpt,omitempty"`
	Rating               int             `json:"rating"`
	Category             string          `json:"category"`
	Product              *ProductRef     `json:"product,omitempty"`
	Author               *AuthorRef      `json:"author,omitempty"`
	Images               []string        `json:"images"`
	LikesCount           int             `json:"likes_count"`
	CommentsCount        int             `json:"comments_count"`
	ViewsCount           int             `json:"views_count"`
	IsTimeline           bool            `json:"is_timeline"`
	TimelineUpdatesCount int             `json:"timeline_updates_count,omitempty"`
	Timeline             []TimelineEntry `json:"timeline,omitempty"`
	Comments             []Comment       `json:"comments,omitempty"`
	CreatedAt            time.Time       `json:"created_at"`
}

type ProductRef struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	ImageURL string `json:"image_url,omitempty"`
}

type AuthorRef struct {
	ID        int64     `json:"id"`
	Username  string    `json:"username"`
	AvatarURL string    `json:"avatar_url"`
	CreatedAt time.Time `json:"created_at,omitempty"`
}

type TimelineEntry struct {
	ID        int64     `json:"id"`
	Title     string    `json:"title"`
	Content   string    `json:"content"`
	Rating    int       `json:"rating"`
	ImageURL  string    `json:"image_url,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}

type Comment struct {
	ID         int64      `json:"id"`
	Content    string     `json:"content"`
	LikesCount int        `json:"likes_count"`
	Author     *AuthorRef `json:"author"`
	CreatedAt  time.Time  `json:"created_at"`
}

type Category struct {
	Slug  string `json:"slug"`
	Label string `json:"label"`
}

type CategoryStat struct {
	Category    string `json:"category"`
	ReviewCount int    `json:"review_count"`
}

type Page struct {
	Slug            string    `json:"slug"`
	Title           string    `json:"title"`
	MetaDescription string    `json:"meta_description"`
	Content         string    `json:"content,omitempty"`
	IsPublished     bool      `json:"is_published"`
	UpdatedAt       time.Time `json:"updated_at"`
}

type PageListItem struct {
	Slug            string `json:"slug"`
	Title           string `json:"title"`
	MetaDescription string `json:"meta_description"`
}
