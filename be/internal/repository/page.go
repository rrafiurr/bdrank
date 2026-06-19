package repository

import (
	"context"
	"database/sql"

	"final-review/be/internal/models"
)

type PageRepo struct {
	db *sql.DB
}

func NewPageRepo(db *sql.DB) *PageRepo {
	return &PageRepo{db: db}
}

func (r *PageRepo) FindBySlug(ctx context.Context, slug string) (*models.Page, error) {
	var p models.Page
	var meta sql.NullString
	err := r.db.QueryRowContext(ctx,
		`SELECT slug, title, COALESCE(meta_description,''), content, is_published, updated_at
		 FROM pages WHERE slug = ? AND is_published = 1`, slug,
	).Scan(&p.Slug, &p.Title, &meta, &p.Content, &p.IsPublished, &p.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	p.MetaDescription = meta.String
	return &p, nil
}

func (r *PageRepo) List(ctx context.Context) ([]*models.PageListItem, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT slug, title, COALESCE(meta_description,'') FROM pages WHERE is_published = 1 ORDER BY slug`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var pages []*models.PageListItem
	for rows.Next() {
		var p models.PageListItem
		if err := rows.Scan(&p.Slug, &p.Title, &p.MetaDescription); err != nil {
			return nil, err
		}
		pages = append(pages, &p)
	}
	if pages == nil {
		pages = []*models.PageListItem{}
	}
	return pages, nil
}
