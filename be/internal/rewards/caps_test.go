package rewards

import "testing"

func p(n int) *int { return &n }

func TestCapReached(t *testing.T) {
	cases := []struct {
		name        string
		rule        Rule
		today, life int
		want        bool
	}{
		{"no caps", Rule{DailyCap: nil, LifetimeCap: nil}, 100, 100, false},
		{"under daily", Rule{DailyCap: p(10)}, 9, 0, false},
		{"at daily", Rule{DailyCap: p(10)}, 10, 0, true},
		{"over daily", Rule{DailyCap: p(10)}, 11, 0, true},
		{"at lifetime", Rule{LifetimeCap: p(1)}, 0, 1, true},
		{"under lifetime", Rule{LifetimeCap: p(1)}, 0, 0, false},
		{"daily ok but lifetime hit", Rule{DailyCap: p(10), LifetimeCap: p(1)}, 0, 1, true},
	}
	for _, c := range cases {
		if got := CapReached(c.rule, c.today, c.life); got != c.want {
			t.Errorf("%s: CapReached=%v want %v", c.name, got, c.want)
		}
	}
}
