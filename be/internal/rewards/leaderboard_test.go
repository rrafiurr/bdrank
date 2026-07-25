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

func TestBuildLeaderboardView(t *testing.T) {
	rows := []LeaderboardRow{
		{UserID: 7, Username: "alice", AvatarURL: "a.jpg", Points: 100},
		{UserID: 9, Username: "bob", Points: 80},
	}
	levels := map[int64]Level{7: {Name: "Gold", Icon: "g", Color: "#f00"}}

	// offset 50 -> ranks continue at 51; meID=9 flags bob; alice has a level, bob nil.
	v := buildLeaderboardView("week", rows, 50, 128, levels, 9, 27, 80)

	if v.Timeframe != "week" || v.Total != 128 {
		t.Fatalf("meta: %+v", v)
	}
	if v.Entries[0].Rank != 51 || v.Entries[1].Rank != 52 {
		t.Fatalf("ranks: %d %d", v.Entries[0].Rank, v.Entries[1].Rank)
	}
	if v.Entries[0].Level == nil || v.Entries[0].Level.Name != "Gold" {
		t.Fatalf("alice level: %+v", v.Entries[0].Level)
	}
	if v.Entries[1].Level != nil {
		t.Fatalf("bob should have no level")
	}
	if v.Entries[0].IsMe || !v.Entries[1].IsMe {
		t.Fatalf("is_me flags wrong")
	}
	if v.Me.Rank != 27 || v.Me.Points != 80 || v.Me.Unranked {
		t.Fatalf("me: %+v", v.Me)
	}

	// Zero points -> unranked.
	u := buildLeaderboardView("today", nil, 0, 0, nil, 9, 0, 0)
	if !u.Me.Unranked || u.Me.Rank != 0 || len(u.Entries) != 0 {
		t.Fatalf("unranked me: %+v entries=%d", u.Me, len(u.Entries))
	}
}
