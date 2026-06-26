package repository

import (
	"context"
	"database/sql"
	"errors"

	"final-review/be/internal/models"
)

var ErrNotFound = errors.New("not found")

var ErrElevatedAccount = errors.New("elevated account requires email login")

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

func (r *UserRepo) CreateOwner(ctx context.Context, email, passwordHash, fullName, companyName string) (*models.User, error) {
	res, err := r.db.ExecContext(ctx,
		`INSERT INTO users (email, password_hash, full_name, company_name, is_product_owner, owner_verified)
		 VALUES (?, ?, ?, ?, 1, 0)`,
		email, passwordHash, fullName, companyName,
	)
	if err != nil {
		return nil, err
	}
	id, _ := res.LastInsertId()
	return r.FindByID(ctx, id)
}

// FindOrCreateSocial logs in or registers an end user from a verified social
// profile. If the email already belongs to an admin or product owner it returns
// ErrElevatedAccount, enforcing email-only login for elevated roles.
func (r *UserRepo) FindOrCreateSocial(ctx context.Context, email, name, avatarURL, provider string) (*models.User, error) {
	var (
		id             int64
		isAdmin        int
		isProductOwner int
		currentAvatar  sql.NullString
	)
	err := r.db.QueryRowContext(ctx,
		`SELECT id, is_admin, is_product_owner, avatar_url FROM users WHERE email = ?`, email,
	).Scan(&id, &isAdmin, &isProductOwner, &currentAvatar)

	if err == sql.ErrNoRows {
		res, cerr := r.db.ExecContext(ctx,
			`INSERT INTO users (email, full_name, avatar_url, auth_provider, password_hash)
			 VALUES (?, ?, ?, ?, NULL)`,
			email, name, avatarURL, provider,
		)
		if cerr != nil {
			return nil, cerr
		}
		newID, _ := res.LastInsertId()
		return r.FindByID(ctx, newID)
	}
	if err != nil {
		return nil, err
	}

	if isAdmin == 1 || isProductOwner == 1 {
		return nil, ErrElevatedAccount
	}

	// Existing regular user: backfill avatar if it is currently empty.
	if (!currentAvatar.Valid || currentAvatar.String == "") && avatarURL != "" {
		r.db.ExecContext(ctx, `UPDATE users SET avatar_url = ? WHERE id = ?`, avatarURL, id)
	}
	return r.FindByID(ctx, id)
}

func (r *UserRepo) FindByEmail(ctx context.Context, email string) (*models.User, string, error) {
	var u models.User
	var hash string
	var isProductOwner, ownerVerified int
	var companyName sql.NullString
	err := r.db.QueryRowContext(ctx,
		`SELECT id, email, COALESCE(full_name,''), COALESCE(username,''), COALESCE(bio,''),
		        COALESCE(avatar_url,''), is_admin, is_product_owner, owner_verified,
		        COALESCE(company_name,''), COALESCE(password_hash,''), created_at
		 FROM users WHERE email = ?`, email,
	).Scan(&u.ID, &u.Email, &u.FullName, &u.Username, &u.Bio, &u.AvatarURL,
		&u.IsAdmin, &isProductOwner, &ownerVerified, &companyName, &hash, &u.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, "", ErrNotFound
	}
	u.AvatarURL = absURL(r.baseURL, u.AvatarURL)
	u.IsProductOwner = isProductOwner == 1
	u.OwnerVerified = ownerVerified == 1
	if companyName.Valid {
		u.CompanyName = companyName.String
	}
	return &u, hash, err
}

func (r *UserRepo) FindByID(ctx context.Context, id int64) (*models.User, error) {
	var u models.User
	var isProductOwner, ownerVerified int
	var companyName sql.NullString
	err := r.db.QueryRowContext(ctx,
		`SELECT id, email, COALESCE(full_name,''), COALESCE(username,''), COALESCE(bio,''),
		        COALESCE(avatar_url,''), is_admin, is_product_owner, owner_verified,
		        COALESCE(company_name,''), created_at
		 FROM users WHERE id = ?`, id,
	).Scan(&u.ID, &u.Email, &u.FullName, &u.Username, &u.Bio, &u.AvatarURL,
		&u.IsAdmin, &isProductOwner, &ownerVerified, &companyName, &u.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, ErrNotFound
	}
	u.AvatarURL = absURL(r.baseURL, u.AvatarURL)
	u.IsProductOwner = isProductOwner == 1
	u.OwnerVerified = ownerVerified == 1
	if companyName.Valid {
		u.CompanyName = companyName.String
	}
	return &u, err
}

func (r *UserRepo) IsAdmin(ctx context.Context, id int64) bool {
	var v int
	r.db.QueryRowContext(ctx, `SELECT is_admin FROM users WHERE id = ?`, id).Scan(&v)
	return v == 1
}

func (r *UserRepo) IsVerifiedOwner(ctx context.Context, id int64) bool {
	var v int
	r.db.QueryRowContext(ctx, `SELECT owner_verified FROM users WHERE id = ? AND is_product_owner = 1`, id).Scan(&v)
	return v == 1
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

// Admin ops

func (r *UserRepo) List(ctx context.Context) ([]*models.User, error) {
	rows, err := r.db.QueryContext(ctx,
		`SELECT id, email, COALESCE(full_name,''), COALESCE(username,''), COALESCE(avatar_url,''),
		        is_admin, is_product_owner, owner_verified, COALESCE(company_name,''), created_at
		 FROM users ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var users []*models.User
	for rows.Next() {
		var u models.User
		var isProductOwner, ownerVerified int
		rows.Scan(&u.ID, &u.Email, &u.FullName, &u.Username, &u.AvatarURL,
			&u.IsAdmin, &isProductOwner, &ownerVerified, &u.CompanyName, &u.CreatedAt)
		u.AvatarURL = absURL(r.baseURL, u.AvatarURL)
		u.IsProductOwner = isProductOwner == 1
		u.OwnerVerified = ownerVerified == 1
		users = append(users, &u)
	}
	if users == nil {
		users = []*models.User{}
	}
	return users, nil
}

func (r *UserRepo) SetAdmin(ctx context.Context, id int64, isAdmin bool) error {
	v := 0
	if isAdmin {
		v = 1
	}
	_, err := r.db.ExecContext(ctx, `UPDATE users SET is_admin = ? WHERE id = ?`, v, id)
	return err
}
