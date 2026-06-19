DB_USER ?= root
DB_PASSWORD ?=
DB_NAME ?= finalreview

.PHONY: dev build build-image migrate deps tidy

## dev — run with Docker + hot-reload (reads .env, connects to local MySQL/Redis)
dev:
	docker compose up --build

## build — compile the binary directly (requires Go installed)
build:
	go build -o server ./cmd/server

## build-image — produce a prod Docker image
build-image:
	docker build -t final-review-api:latest .

## extract-binary — build the prod binary via Docker without installing Go locally
## Output: ./server
extract-binary:
	docker build --target builder -t final-review-builder .
	docker create --name _tmp_builder final-review-builder
	docker cp _tmp_builder:/app/server ./server
	docker rm _tmp_builder
	@echo "Binary ready: ./server"

## migrate — run the initial SQL migration
migrate:
	mysql -u$(DB_USER) $(if $(DB_PASSWORD),-p$(DB_PASSWORD)) $(DB_NAME) < migrations/001_initial.sql

## tidy — update go.sum (requires Go installed, or run via Docker)
tidy:
	docker run --rm -v $(PWD):/app -w /app golang:1.22-alpine go mod tidy

## deps — download Go modules into the module cache (requires Go installed)
deps:
	go mod download
