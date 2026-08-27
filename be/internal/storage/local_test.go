package storage

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestListReturnsUploadsNewestFirst(t *testing.T) {
	dir := t.TempDir()
	s := NewLocal(dir, "http://example.test")

	// Written oldest-first, then back-dated so ordering cannot pass by accident.
	for i, name := range []string{"old.jpg", "mid.jpg", "new.jpg"} {
		p := filepath.Join(dir, name)
		if err := os.WriteFile(p, []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
		mt := time.Now().Add(time.Duration(i-3) * time.Hour)
		os.Chtimes(p, mt, mt)
	}

	files, err := s.List(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 3 {
		t.Fatalf("got %d files, want 3", len(files))
	}
	want := []string{"new.jpg", "mid.jpg", "old.jpg"}
	for i, w := range want {
		if files[i].Filename != w {
			t.Errorf("position %d = %q, want %q", i, files[i].Filename, w)
		}
	}
	if files[0].URL != "http://example.test/uploads/new.jpg" {
		t.Errorf("URL = %q", files[0].URL)
	}
	if files[0].Path != "uploads/new.jpg" {
		t.Errorf("Path = %q, want the form Delete accepts", files[0].Path)
	}
}

func TestListSkipsDotfilesAndDirs(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, ".gitkeep"), nil, 0o644)
	os.Mkdir(filepath.Join(dir, "thumbs"), 0o755)
	os.WriteFile(filepath.Join(dir, "real.png"), []byte("x"), 0o644)

	files, err := NewLocal(dir, "http://example.test").List(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 1 || files[0].Filename != "real.png" {
		t.Fatalf("got %+v, want only real.png", files)
	}
}

func TestListMissingDirIsEmptyNotError(t *testing.T) {
	s := &LocalStorage{uploadDir: filepath.Join(t.TempDir(), "nope"), baseURL: "http://x"}
	files, err := s.List(context.Background())
	if err != nil {
		t.Fatalf("err = %v, want nil for a missing dir", err)
	}
	if len(files) != 0 {
		t.Fatalf("got %d files, want 0", len(files))
	}
}

func TestDeleteCannotEscapeUploadDir(t *testing.T) {
	dir := t.TempDir()
	outside := filepath.Join(dir, "..", "secret.txt")
	if err := os.WriteFile(outside, []byte("x"), 0o644); err != nil {
		t.Skip("cannot stage file outside temp dir")
	}
	defer os.Remove(outside)

	s := NewLocal(filepath.Join(dir, "up"), "http://x")
	if err := s.Delete(context.Background(), "uploads/../../secret.txt"); err != nil {
		t.Fatalf("Delete = %v, want nil (missing file is not an error)", err)
	}
	if _, err := os.Stat(outside); err != nil {
		t.Fatal("Delete escaped the upload directory and removed an outside file")
	}
}
