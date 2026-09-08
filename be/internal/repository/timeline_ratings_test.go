package repository

import (
	"database/sql"
	"testing"
)

func TestParseTimelineRatingsOrder(t *testing.T) {
	got := parseTimelineRatings(sql.NullString{String: "5,4,3", Valid: true})
	want := []int{5, 4, 3}
	if len(got) != len(want) {
		t.Fatalf("len = %d, want %d (%v)", len(got), len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got %v, want %v", got, want)
		}
	}
}

func TestParseTimelineRatingsEmptyIsNil(t *testing.T) {
	// A review with no timeline entries must omit the field entirely rather
	// than serialising an empty array, so the frontend can tell them apart.
	if got := parseTimelineRatings(sql.NullString{}); got != nil {
		t.Fatalf("invalid NullString -> %v, want nil", got)
	}
	if got := parseTimelineRatings(sql.NullString{String: "", Valid: true}); got != nil {
		t.Fatalf("empty string -> %v, want nil", got)
	}
}

func TestParseTimelineRatingsSkipsGarbage(t *testing.T) {
	got := parseTimelineRatings(sql.NullString{String: "5,,x,2", Valid: true})
	want := []int{5, 2}
	if len(got) != len(want) || got[0] != want[0] || got[1] != want[1] {
		t.Fatalf("got %v, want %v", got, want)
	}
}
