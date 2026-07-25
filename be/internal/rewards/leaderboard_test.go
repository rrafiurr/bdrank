package rewards

import (
	"testing"
	"time"
)

func TestWindowStart(t *testing.T) {
	// A Wednesday: 2026-07-22 15:04 UTC.
	now := time.Date(2026, 7, 22, 15, 4, 0, 0, time.UTC)

	if _, windowed, valid := WindowStart("all", now); !valid || windowed {
		t.Fatalf("all: valid=%v windowed=%v want true,false", valid, windowed)
	}
	if s, windowed, valid := WindowStart("today", now); !valid || !windowed ||
		!s.Equal(time.Date(2026, 7, 22, 0, 0, 0, 0, time.UTC)) {
		t.Fatalf("today start=%v", s)
	}
	if s, _, _ := WindowStart("week", now); !s.Equal(time.Date(2026, 7, 20, 0, 0, 0, 0, time.UTC)) {
		t.Fatalf("week start=%v want Monday 2026-07-20", s) // Wed -> Mon
	}
	if s, _, _ := WindowStart("month", now); !s.Equal(time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)) {
		t.Fatalf("month start=%v", s)
	}
	// Sunday must map back to the previous Monday.
	sun := time.Date(2026, 7, 26, 9, 0, 0, 0, time.UTC)
	if s, _, _ := WindowStart("week", sun); !s.Equal(time.Date(2026, 7, 20, 0, 0, 0, 0, time.UTC)) {
		t.Fatalf("sunday week start=%v want 2026-07-20", s)
	}
	if _, _, valid := WindowStart("garbage", now); valid {
		t.Fatalf("garbage should be invalid")
	}
}
