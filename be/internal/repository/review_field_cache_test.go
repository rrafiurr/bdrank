package repository

import "testing"

func TestCacheKeyShapes(t *testing.T) {
	if got := CategoryKey("fcommerce"); got != "reviewform:v1:cat:fcommerce" {
		t.Errorf("CategoryKey = %q", got)
	}
	if got := ProductKey(42); got != "reviewform:v1:prod:42" {
		t.Errorf("ProductKey = %q", got)
	}
	if got := MembersKey("fcommerce"); got != "reviewform:v1:cat:fcommerce:members" {
		t.Errorf("MembersKey = %q", got)
	}
}
