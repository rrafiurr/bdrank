package rewards

import "testing"

func TestLevelFor(t *testing.T) {
	levels := []Level{
		{ID: 1, Name: "Bronze", MinPoints: 0, IsActive: true},
		{ID: 2, Name: "Silver", MinPoints: 100, IsActive: true},
		{ID: 3, Name: "Gold", MinPoints: 500, IsActive: true},
		{ID: 4, Name: "Hidden", MinPoints: 300, IsActive: false},
	}
	if l := LevelFor(levels, 50); l == nil || l.Name != "Bronze" {
		t.Fatalf("50 -> %v want Bronze", l)
	}
	if l := LevelFor(levels, 100); l == nil || l.Name != "Silver" {
		t.Fatalf("100 -> %v want Silver", l)
	}
	if l := LevelFor(levels, 400); l == nil || l.Name != "Silver" {
		t.Fatalf("400 -> %v want Silver (Hidden inactive)", l)
	}
	none := []Level{{Name: "Silver", MinPoints: 100, IsActive: true}}
	if l := LevelFor(none, 50); l != nil {
		t.Fatalf("below lowest -> %v want nil", l)
	}
}

func TestNextLevel(t *testing.T) {
	levels := []Level{
		{Name: "Bronze", MinPoints: 0, IsActive: true},
		{Name: "Silver", MinPoints: 100, IsActive: true},
		{Name: "Gold", MinPoints: 500, IsActive: true},
	}
	next, need := NextLevel(levels, 40)
	if next == nil || next.Name != "Silver" || need != 60 {
		t.Fatalf("40 -> (%v,%d) want (Silver,60)", next, need)
	}
	top, need := NextLevel(levels, 600)
	if top != nil || need != 0 {
		t.Fatalf("600 -> (%v,%d) want (nil,0)", top, need)
	}
}
