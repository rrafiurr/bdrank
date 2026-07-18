package database

import (
	"database/sql"
	"fmt"
	"time"

	"final-review/be/internal/config"
	_ "github.com/go-sql-driver/mysql"
)

func New(cfg *config.Config) (*sql.DB, error) {
	// time_zone=+00:00 (URL-encoded) is an unknown DSN param to the driver,
	// so go-sql-driver/mysql treats it as a session system var and issues
	// SET time_zone='+00:00' on every new connection. This pins the MySQL
	// session's time zone to UTC so NOW()/CURRENT_TIMESTAMP/UTC_DATE() are
	// consistent with the Go-side loc=UTC parsing above — required for the
	// reward daily-cap check's `created_at >= UTC_DATE()` comparison to use
	// the correct day boundary regardless of the DB server's configured tz.
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true&charset=utf8mb4&loc=UTC&time_zone=%%27%%2B00%%3A00%%27",
		cfg.DBUser, cfg.DBPassword, cfg.DBHost, cfg.DBPort, cfg.DBName,
	)
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("mysql ping: %w", err)
	}
	return db, nil
}
