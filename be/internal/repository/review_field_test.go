package repository

import (
	"testing"

	"final-review/be/internal/models"
)

func names(fs []models.ReviewField) []string {
	out := make([]string, 0, len(fs))
	for _, f := range fs {
		out = append(out, f.FieldKey)
	}
	return out
}

func eq(t *testing.T, got []string, want ...string) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got %v, want %v", got, want)
		}
	}
}

func TestMergeFieldsInheritsCategoryFields(t *testing.T) {
	cat := []models.ReviewField{
		{ID: 1, FieldKey: "page_link", SortOrder: 10},
		{ID: 2, FieldKey: "delivery_days", SortOrder: 20},
	}
	eq(t, names(MergeFields(cat, nil, nil)), "page_link", "delivery_days")
}

func TestMergeFieldsAddsProductFields(t *testing.T) {
	cat := []models.ReviewField{{ID: 1, FieldKey: "page_link", SortOrder: 10}}
	prod := []models.ReviewField{{ID: 5, FieldKey: "instagram", SortOrder: 20}}
	eq(t, names(MergeFields(cat, prod, nil)), "page_link", "instagram")
}

func TestMergeFieldsHidesInherited(t *testing.T) {
	cat := []models.ReviewField{
		{ID: 1, FieldKey: "page_link", SortOrder: 10},
		{ID: 2, FieldKey: "delivery_days", SortOrder: 20},
	}
	prod := []models.ReviewField{{ID: 5, FieldKey: "instagram", SortOrder: 30}}
	eq(t, names(MergeFields(cat, prod, map[int64]bool{2: true})), "page_link", "instagram")
}

func TestMergeFieldsHideAppliesOnlyToCategoryFields(t *testing.T) {
	// A product cannot hide its own field — it would just delete it instead.
	// A stale hide row naming a product field must not remove it.
	prod := []models.ReviewField{{ID: 5, FieldKey: "instagram", SortOrder: 10}}
	eq(t, names(MergeFields(nil, prod, map[int64]bool{5: true})), "instagram")
}

func TestMergeFieldsOrdersBySortOrderThenID(t *testing.T) {
	cat := []models.ReviewField{{ID: 9, FieldKey: "b", SortOrder: 5}}
	prod := []models.ReviewField{
		{ID: 3, FieldKey: "a", SortOrder: 5},
		{ID: 4, FieldKey: "c", SortOrder: 1},
	}
	// sort_order first, then id as the tiebreak
	eq(t, names(MergeFields(cat, prod, nil)), "c", "a", "b")
}

func TestMergeFieldsEmpty(t *testing.T) {
	if got := MergeFields(nil, nil, nil); len(got) != 0 {
		t.Fatalf("got %v, want empty", got)
	}
}

func TestShouldHaveNumberValueTextField(t *testing.T) {
	// Text field should NOT populate value_number, even if the value looks numeric
	if shouldHaveNumberValue("text") {
		t.Fatal("text field should not have number value")
	}
}

func TestShouldHaveNumberValueNumberField(t *testing.T) {
	// Number field SHOULD populate value_number
	if !shouldHaveNumberValue("number") {
		t.Fatal("number field should have number value")
	}
}

func TestShouldHaveNumberValueOtherTypes(t *testing.T) {
	// Other field types should NOT populate value_number
	types := []string{"select", "checkbox", "textarea", "date"}
	for _, typ := range types {
		if shouldHaveNumberValue(typ) {
			t.Fatalf("field type %q should not have number value", typ)
		}
	}
}
