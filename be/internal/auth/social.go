package auth

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
)

// ErrNoEmail is returned when a provider does not supply an email address.
var ErrNoEmail = errors.New("no email from provider")

// SocialProfile is the verified, normalized identity from an OAuth provider.
type SocialProfile struct {
	Email     string
	Name      string
	AvatarURL string
	Provider  string // "google" | "facebook"
}

// VerifyGoogle validates a Google ID token via the tokeninfo endpoint and
// returns the verified profile. It rejects tokens whose audience does not
// match clientID or whose email is unverified.
func VerifyGoogle(ctx context.Context, credential, clientID string) (*SocialProfile, error) {
	endpoint := "https://oauth2.googleapis.com/tokeninfo?id_token=" + url.QueryEscape(credential)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("google tokeninfo status %d", resp.StatusCode)
	}

	var body struct {
		Aud           string `json:"aud"`
		Email         string `json:"email"`
		EmailVerified string `json:"email_verified"`
		Name          string `json:"name"`
		Picture       string `json:"picture"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return nil, err
	}
	if body.Aud != clientID {
		return nil, errors.New("google token audience mismatch")
	}
	if body.EmailVerified != "true" {
		return nil, errors.New("google email not verified")
	}
	if body.Email == "" {
		return nil, ErrNoEmail
	}
	return &SocialProfile{
		Email:     body.Email,
		Name:      body.Name,
		AvatarURL: body.Picture,
		Provider:  "google",
	}, nil
}

// VerifyFacebook confirms the access token belongs to our app (via debug_token)
// and then fetches the user profile. It returns ErrNoEmail when Facebook does
// not provide an email.
func VerifyFacebook(ctx context.Context, accessToken, appID, appSecret string) (*SocialProfile, error) {
	// 1. Confirm the token was issued for our app.
	appToken := url.QueryEscape(appID + "|" + appSecret)
	debugURL := fmt.Sprintf(
		"https://graph.facebook.com/debug_token?input_token=%s&access_token=%s",
		url.QueryEscape(accessToken), appToken,
	)
	debugReq, err := http.NewRequestWithContext(ctx, http.MethodGet, debugURL, nil)
	if err != nil {
		return nil, err
	}
	debugResp, err := http.DefaultClient.Do(debugReq)
	if err != nil {
		return nil, err
	}
	defer debugResp.Body.Close()
	if debugResp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("facebook debug_token status %d", debugResp.StatusCode)
	}
	var debug struct {
		Data struct {
			AppID   string `json:"app_id"`
			IsValid bool   `json:"is_valid"`
		} `json:"data"`
	}
	if err := json.NewDecoder(debugResp.Body).Decode(&debug); err != nil {
		return nil, err
	}
	if !debug.Data.IsValid || debug.Data.AppID != appID {
		return nil, errors.New("facebook token invalid or app mismatch")
	}

	// 2. Fetch the profile.
	meURL := "https://graph.facebook.com/me?fields=id,name,email,picture&access_token=" +
		url.QueryEscape(accessToken)
	meReq, err := http.NewRequestWithContext(ctx, http.MethodGet, meURL, nil)
	if err != nil {
		return nil, err
	}
	meResp, err := http.DefaultClient.Do(meReq)
	if err != nil {
		return nil, err
	}
	defer meResp.Body.Close()
	if meResp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("facebook me status %d", meResp.StatusCode)
	}
	var me struct {
		Email   string `json:"email"`
		Name    string `json:"name"`
		Picture struct {
			Data struct {
				URL string `json:"url"`
			} `json:"data"`
		} `json:"picture"`
	}
	if err := json.NewDecoder(meResp.Body).Decode(&me); err != nil {
		return nil, err
	}
	if me.Email == "" {
		return nil, ErrNoEmail
	}
	return &SocialProfile{
		Email:     me.Email,
		Name:      me.Name,
		AvatarURL: me.Picture.Data.URL,
		Provider:  "facebook",
	}, nil
}
