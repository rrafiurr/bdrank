package auth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/redis/go-redis/v9"
)

type Claims struct {
	UserID int64  `json:"user_id"`
	JTI    string `json:"jti"`
	jwt.RegisteredClaims
}

func NewToken(userID int64, secret string, ttl time.Duration, rdb *redis.Client) (string, error) {
	jti := newJTI()
	claims := Claims{
		UserID: userID,
		JTI:    jti,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(ttl)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(secret))
	if err != nil {
		return "", err
	}
	rdb.Set(context.Background(), sessionKey(jti), userID, ttl)
	return signed, nil
}

func ParseToken(tokenStr, secret string) (*Claims, error) {
	var claims Claims
	_, err := jwt.ParseWithClaims(tokenStr, &claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return []byte(secret), nil
	})
	if err != nil {
		return nil, err
	}
	return &claims, nil
}

func ValidateSession(ctx context.Context, jti string, rdb *redis.Client) bool {
	return rdb.Exists(ctx, sessionKey(jti)).Val() > 0
}

func RevokeSession(ctx context.Context, jti string, rdb *redis.Client) {
	rdb.Del(ctx, sessionKey(jti))
}

func sessionKey(jti string) string {
	return "session:" + jti
}

func newJTI() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}
