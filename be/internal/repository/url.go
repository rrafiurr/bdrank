package repository

import "strings"

// absURL turns a stored relative path into a full URL.
// If raw is empty or already starts with "http" (external URL), it is returned unchanged.
func absURL(base, raw string) string {
	if raw == "" || strings.HasPrefix(raw, "http") {
		return raw
	}
	return strings.TrimRight(base, "/") + "/" + strings.TrimLeft(raw, "/")
}

// absURLSlice applies absURL to every element of a slice in-place.
func absURLSlice(base string, paths []string) []string {
	for i, p := range paths {
		paths[i] = absURL(base, p)
	}
	return paths
}
