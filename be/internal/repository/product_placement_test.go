package repository

import "testing"

func TestPlacementOrderPrefix(t *testing.T) {
	// Only the explicit home placement asks for pinned-first ordering. Every
	// other caller — search, browse, the CMS product table — must keep the
	// ordering it has today.
	if got := placementOrderPrefix("home"); got != "(p.home_placement = 'pinned') DESC, " {
		t.Errorf("placementOrderPrefix(\"home\") = %q", got)
	}
	for _, s := range []string{"", "auto", "anything", "HOME"} {
		if got := placementOrderPrefix(s); got != "" {
			t.Errorf("placementOrderPrefix(%q) = %q, want empty", s, got)
		}
	}
}

func TestPlacementWhere(t *testing.T) {
	// Hidden products drop out of the home page only. An unrecognised value
	// must not filter anything, so a stale client cannot empty the list.
	if got := placementWhere("home"); got != " AND p.home_placement <> 'hidden'" {
		t.Errorf("placementWhere(\"home\") = %q", got)
	}
	for _, s := range []string{"", "auto", "hidden", "garbage"} {
		if got := placementWhere(s); got != "" {
			t.Errorf("placementWhere(%q) = %q, want empty", s, got)
		}
	}
}

func TestValidHomePlacement(t *testing.T) {
	for _, s := range []string{"auto", "pinned", "hidden"} {
		if !ValidHomePlacement(s) {
			t.Errorf("ValidHomePlacement(%q) = false, want true", s)
		}
	}
	for _, s := range []string{"", "Pinned", "featured", "hidden ", "drop table"} {
		if ValidHomePlacement(s) {
			t.Errorf("ValidHomePlacement(%q) = true, want false", s)
		}
	}
}
