package handlers

import (
	"testing"

	"final-review/be/internal/models"
)

func f(id int64, typ string, required bool) models.ReviewField {
	return models.ReviewField{ID: id, FieldKey: "k", Label: "L", Type: typ, IsRequired: required}
}

func TestValidateAcceptsGoodAnswers(t *testing.T) {
	fields := []models.ReviewField{f(1, "url", true), f(2, "number", false)}
	vals, msg := ValidateFieldAnswers(fields, map[string]string{"1": "https://facebook.com/x", "2": "3"})
	if msg != "" {
		t.Fatalf("msg = %q, want empty", msg)
	}
	if vals[1] != "https://facebook.com/x" || vals[2] != "3" {
		t.Fatalf("vals = %v", vals)
	}
}

func TestValidateRejectsMissingRequired(t *testing.T) {
	fields := []models.ReviewField{f(1, "text", true)}
	if _, msg := ValidateFieldAnswers(fields, map[string]string{}); msg == "" {
		t.Fatal("want an error for a missing required field")
	}
}

func TestValidateTreatsBlankAsMissing(t *testing.T) {
	fields := []models.ReviewField{f(1, "text", true)}
	if _, msg := ValidateFieldAnswers(fields, map[string]string{"1": "   "}); msg == "" {
		t.Fatal("whitespace must not satisfy a required field")
	}
}

func TestValidateIgnoresUnknownKeys(t *testing.T) {
	// An admin editing fields while a reviewer has the form open must not turn
	// their submit into an error.
	fields := []models.ReviewField{f(1, "text", false)}
	vals, msg := ValidateFieldAnswers(fields, map[string]string{"1": "ok", "999": "stale"})
	if msg != "" {
		t.Fatalf("msg = %q, want empty", msg)
	}
	if _, present := vals[999]; present {
		t.Fatal("unknown key must not be stored")
	}
}

func TestValidateRejectsBadURL(t *testing.T) {
	fields := []models.ReviewField{f(1, "url", false)}
	for _, bad := range []string{"notaurl", "ftp://x.com", "javascript:alert(1)"} {
		if _, msg := ValidateFieldAnswers(fields, map[string]string{"1": bad}); msg == "" {
			t.Errorf("%q should be rejected", bad)
		}
	}
}

func TestValidateRejectsNonNumeric(t *testing.T) {
	fields := []models.ReviewField{f(1, "number", false)}
	if _, msg := ValidateFieldAnswers(fields, map[string]string{"1": "three"}); msg == "" {
		t.Fatal("want an error for a non-numeric number field")
	}
}

func TestValidateEnforcesNumberRange(t *testing.T) {
	min, max := 1.0, 10.0
	fields := []models.ReviewField{{ID: 1, Type: "number", Label: "Days", MinValue: &min, MaxValue: &max}}
	if _, msg := ValidateFieldAnswers(fields, map[string]string{"1": "50"}); msg == "" {
		t.Fatal("want an error above max_value")
	}
	if _, msg := ValidateFieldAnswers(fields, map[string]string{"1": "5"}); msg != "" {
		t.Fatalf("in-range value rejected: %s", msg)
	}
}

func TestValidateRejectsUnlistedSelectOption(t *testing.T) {
	fields := []models.ReviewField{{ID: 1, Type: "select", Label: "How", Options: []string{"Facebook", "WhatsApp"}}}
	if _, msg := ValidateFieldAnswers(fields, map[string]string{"1": "Telegram"}); msg == "" {
		t.Fatal("want an error for an option not in the list")
	}
	if _, msg := ValidateFieldAnswers(fields, map[string]string{"1": "WhatsApp"}); msg != "" {
		t.Fatalf("listed option rejected: %s", msg)
	}
}

func TestValidateRejectsOverlongText(t *testing.T) {
	long := make([]byte, 1001)
	for i := range long {
		long[i] = 'a'
	}
	fields := []models.ReviewField{f(1, "text", false)}
	if _, msg := ValidateFieldAnswers(fields, map[string]string{"1": string(long)}); msg == "" {
		t.Fatal("want an error above 1000 characters")
	}
}
