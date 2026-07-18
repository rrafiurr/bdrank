package rewards

import "sort"

func activeSorted(levels []Level) []Level {
	out := make([]Level, 0, len(levels))
	for _, l := range levels {
		if l.IsActive {
			out = append(out, l)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].MinPoints < out[j].MinPoints })
	return out
}

// LevelFor returns the highest active level whose MinPoints <= lifetime, or nil.
func LevelFor(levels []Level, lifetime int) *Level {
	s := activeSorted(levels)
	var cur *Level
	for i := range s {
		if s[i].MinPoints <= lifetime {
			l := s[i]
			cur = &l
		} else {
			break
		}
	}
	return cur
}

// NextLevel returns the next active level above the user's lifetime points and
// the points still needed; (nil, 0) when already at the top.
func NextLevel(levels []Level, lifetime int) (*Level, int) {
	for _, l := range activeSorted(levels) {
		if l.MinPoints > lifetime {
			nl := l
			return &nl, l.MinPoints - lifetime
		}
	}
	return nil, 0
}
