package models

import "time"

// Feedback is one feedback item as its author sees it. Status is the public
// status: "spam" is reported as "closed" (see feedback.PublicStatus).
type Feedback struct {
	ID          int64      `json:"id"`
	Type        string     `json:"type"`
	Message     string     `json:"message"`
	Status      string     `json:"status"`
	AdminReply  string     `json:"admin_reply"` // "" when there is no reply
	RepliedAt   *time.Time `json:"replied_at"`
	ReplyUnread bool       `json:"reply_unread"`
	CreatedAt   time.Time  `json:"created_at"`
}

// AdminFeedback is one item as the CMS inbox sees it: the raw status, plus the
// context captured at submission and who sent it.
type AdminFeedback struct {
	ID          int64        `json:"id"`
	Type        string       `json:"type"`
	Message     string       `json:"message"`
	Status      string       `json:"status"`
	AdminReply  string       `json:"admin_reply"`
	RepliedAt   *time.Time   `json:"replied_at"`
	ReplyUnread bool         `json:"reply_unread"`
	PagePath    string       `json:"page_path"`
	UserAgent   string       `json:"user_agent"`
	User        FeedbackUser `json:"user"`
	CreatedAt   time.Time    `json:"created_at"`
}

type FeedbackUser struct {
	ID       int64  `json:"id"`
	Username string `json:"username"`
	Email    string `json:"email"`
}
