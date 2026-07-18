package rewards

// CapReached reports whether awarding one more of this event would exceed a cap.
func CapReached(rule Rule, todayCount, lifetimeCount int) bool {
	if rule.DailyCap != nil && todayCount >= *rule.DailyCap {
		return true
	}
	if rule.LifetimeCap != nil && lifetimeCount >= *rule.LifetimeCap {
		return true
	}
	return false
}
