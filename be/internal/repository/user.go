package repository

import (
	"context"
	"database/sql"
	"errors"

	"final-review/be/internal/models"
)

var ErrNotFound = errors.New("not found")

type UserRepo struct {
	db      *sql.DB
	baseURL string
}

func NewUserRepo(db *sql.DB, baseURL string) *UserRepo {
	return &UserRepo{db: db, baseURL: baseURL}
}

func (r *UserRepo) Create(ctx context.Context, email, passwordHash, fullName string) (*models.User, error) {
	res, err := r.db.ExecContext(ctx,
		`INSERT INTO users (email, password_hash, full_name) VALUES (?, ?, ?)`,
		email, passwordHash, fullName,
	)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	return r.FindByID(ctx, id)
}

// FindByEmail returns the user and their password hash.
func (r *UserRepo) FindByEmail(ctx context.Context, email string) (*models.User, string, error) {
	var u models.User
	var hash string
	err := r.db.QueryRowContext(ctx,
		`SELECT id, email, COALESCE(full_name,''), COALESCE(username,''), COALESCE(bio,''), COALESCE(avatar_url,''), password_hash, created_at
		 FROM users WHERE email = ?`, email,
	).Scan(&u.ID, &u.Email, &u.FullName, &u.Username, &u.Bio, &u.AvatarURL, &hash, &u.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, "", ErrNotFound
	}
	u.AvatarURL = absURL(r.baseURL, u.AvatarURL)
	return &u, hash, err
}

func (r *UserRepo) FindByID(ctx context.Context, id int64) (*models.User, error) {
	var u models.User
	err := r.db.QueryRowContext(ctx,
		`SELECT id, email, COALESCE(full_name,''), COALESCE(username,''), COALESCE(bio,''), COALESCE(avatar_url,''), created_at
		 FROM users WHERE id = ?`, id,
	).Scan(&u.ID, &u.Email, &u.FullName, &u.Username, &u.Bio, &u.AvatarURL, &u.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, ErrNotFound
	}
	u.AvatarURL = absURL(r.baseURL, u.AvatarURL)
	return &u, err
}

func (r *UserRepo) UpdateProfile(ctx context.Context, id int64, username, bio, avatarURL *string) (*models.User, error) {
	_, err := r.db.ExecContext(ctx,
		`UPDATE users SET
		 username   = COALESCE(?, username),
		 bio        = COALESCE(?, bio),
		 avatar_url = COALESCE(?, avatar_url)
		 WHERE id = ?`,
		username, bio, avatarURL, id,
	)
	if err != nil {
		return nil, err
	}
	return r.FindByID(ctx, id)
}
