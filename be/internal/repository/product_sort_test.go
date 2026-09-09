package repository

import "testing"

func TestProductOrderBy(t *testing.T) {
	cases := []struct {
		sort string
		want string
	}{
		{"", "review_count DESC"},
		{"unknown", "review_count DESC"},
		{"avg_rating", "avg_rating DESC"},
		{"created_at", "p.created_at DESC"},
		// Ordering by the newest review on each product, not by when the
		// product row was created. Products with no approved reviews have a
		// NULL max and MySQL sorts NULLs last under DESC, so they fall to the
		// end rather than jumping to the front.
		{"recent_review", "MAX(r.created_at) DESC"},
	}
	for _, c := range cases {
		if got := productOrderBy(c.sort); got != c.want {
			t.Errorf("productOrderBy(%q) = %q, want %q", c.sort, got, c.want)
		}
	}
}
