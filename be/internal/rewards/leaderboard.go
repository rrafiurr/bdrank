package rewards

import "time"

// WindowStart returns the UTC start instant for a leaderboard timeframe.
// valid is false for an unknown timeframe. For "all", windowed is false and
// start is the zero time (the caller ranks by lifetime_points instead).
func WindowStart(timeframe string, now time.Time) (start time.Time, windowed, valid bool) {
	now = now.UTC()
	midnight := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	switch timeframe {
	case "all":
		return time.Time{}, false, true
	case "today":
		return midnight, true, true
	case "week":
		wd := int(now.Weekday()) // Sunday=0 .. Saturday=6
		if wd == 0 {
			wd = 7
		}
		return midnight.AddDate(0, 0, -(wd - 1)), true, true
	case "month":
		return time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC), true, true
	default:
		return time.Time{}, false, false
	}
}
