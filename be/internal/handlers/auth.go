package handlers

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"final-review/be/internal/auth"
	"final-review/be/internal/config"
	"final-review/be/internal/middleware"
	"final-review/be/internal/repository"
	"github.com/go-sql-driver/mysql"
	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"
)

func isDuplicateEmail(err error) bool {
	var me *mysql.MySQLError
	if errors.As(err, &me) {
		return me.Number == 1062
	}
	return false
}

type AuthHandler struct {
	users *repository.UserRepo
	redis *redis.Client
	cfg   *config.Config
}

func NewAuthHandler(users *repository.UserRepo, rdb *redis.Client, cfg *config.Config) *AuthHandler {
	return &AuthHandler{users: users, redis: rdb, cfg: cfg}
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		FullName string `json:"full_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Email == "" || body.Password == "" {
		writeError(w, http.StatusBadRequest, "email and password required")
		return
	}
	if len(body.Password) < 8 {
		writeError(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(body.Password), bcrypt.DefaultCost)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	user, err := h.users.Create(r.Context(), body.Email, string(hash), body.FullName)
	if err != nil {
		if isDuplicateEmail(err) {
			writeError(w, http.StatusConflict, "email already in use")
		} else {
			log.Printf("ERROR Create user email=%q: %v", body.Email, err)
			writeError(w, http.StatusInternalServerError, "internal error")
		}
		return
	}
	token, err := auth.NewToken(user.ID, h.cfg.JWTSecret, h.cfg.TokenTTL, h.redis)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"token": token, "user": user})
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Email == "" || body.Password == "" {
		writeError(w, http.StatusBadRequest, "email and password required")
		return
	}
	user, hash, err := h.users.FindByEmail(r.Context(), body.Email)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(body.Password)); err != nil {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	token, err := auth.NewToken(user.ID, h.cfg.JWTSecret, h.cfg.TokenTTL, h.redis)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"token": token, "user": user})
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	jti := middleware.JTIFromCtx(r.Context())
	if jti != "" {
		auth.RevokeSession(r.Context(), jti, h.redis)
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *AuthHandler) RegisterOwner(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email       string `json:"email"`
		Password    string `json:"password"`
		FullName    string `json:"full_name"`
		CompanyName string `json:"company_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil ||
		body.Email == "" || body.Password == "" || body.CompanyName == "" {
		writeError(w, http.StatusBadRequest, "email, password and company_name required")
		return
	}
	if len(body.Password) < 8 {
		writeError(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(body.Password), bcrypt.DefaultCost)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	user, err := h.users.CreateOwner(r.Context(), body.Email, string(hash), body.FullName, body.CompanyName)
	if err != nil {
		if isDuplicateEmail(err) {
			writeError(w, http.StatusConflict, "email already in use")
		} else {
			log.Printf("ERROR CreateOwner email=%q: %v", body.Email, err)
			writeError(w, http.StatusInternalServerError, "internal error")
		}
		return
	}
	// No token issued — owner must wait for admin verification before logging in
	writeJSON(w, http.StatusCreated, map[string]any{
		"message": "Registration submitted. Your account is pending admin verification.",
		"user_id": user.ID,
	})
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromCtx(r.Context())
	user, err := h.users.FindByID(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	writeJSON(w, http.StatusOK, user)
}
