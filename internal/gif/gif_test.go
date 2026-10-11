package gif

import (
	"errors"
	"strings"
	"testing"

	"github.com/StevenWeathers/thunderdome-planning-poker/thunderdome"
)

func validGiphyGif() *thunderdome.RetroItemGif {
	return &thunderdome.RetroItemGif{
		Provider: "giphy",
		ID:       "abc123",
		URL:      "https://media2.giphy.com/media/abc123/200w.gif?cid=xyz&rid=200w.gif",
		Width:    200,
		Height:   150,
		Title:    "Happy dance",
	}
}

func TestLookup(t *testing.T) {
	for _, name := range []string{"giphy", "klipy", " GIPHY "} {
		if _, ok := Lookup(name); !ok {
			t.Errorf("expected provider %q to be registered", name)
		}
	}
	for _, name := range []string{"", "tenor", "unknown"} {
		if _, ok := Lookup(name); ok {
			t.Errorf("expected provider %q not to be registered", name)
		}
	}
}

func TestNames(t *testing.T) {
	got := strings.Join(Names(), ",")
	if got != "giphy,klipy" {
		t.Fatalf("Names() = %q, want %q", got, "giphy,klipy")
	}
}

func TestValidate(t *testing.T) {
	tests := []struct {
		name     string
		provider string
		mutate   func(g *thunderdome.RetroItemGif)
		nilGif   bool
		wantErr  error
	}{
		{name: "valid giphy gif", provider: "giphy"},
		{name: "active provider is case insensitive", provider: "GIPHY"},
		{name: "i.giphy.com is allowed", provider: "giphy", mutate: func(g *thunderdome.RetroItemGif) {
			g.URL = "https://i.giphy.com/abc123.gif"
		}},
		{name: "uppercase host is allowed", provider: "giphy", mutate: func(g *thunderdome.RetroItemGif) {
			g.URL = "https://MEDIA.GIPHY.COM/media/abc123/200w.gif"
		}},
		{name: "valid klipy gif", provider: "klipy", mutate: func(g *thunderdome.RetroItemGif) {
			g.Provider = "klipy"
			g.URL = "https://static.klipy.com/ii/abc/sm.gif"
		}},
		{name: "gifs disabled", provider: "", wantErr: ErrUnknownProvider},
		{name: "unknown active provider", provider: "tenor", wantErr: ErrUnknownProvider},
		{name: "nil gif", provider: "giphy", nilGif: true, wantErr: ErrInvalidGif},
		{name: "provider mismatch", provider: "klipy", wantErr: ErrInvalidGif},
		{name: "http scheme", provider: "giphy", mutate: func(g *thunderdome.RetroItemGif) {
			g.URL = "http://media.giphy.com/a.gif"
		}, wantErr: ErrInvalidGif},
		{name: "javascript scheme", provider: "giphy", mutate: func(g *thunderdome.RetroItemGif) {
			g.URL = "javascript:alert(1)"
		}, wantErr: ErrInvalidGif},
		{name: "data uri", provider: "giphy", mutate: func(g *thunderdome.RetroItemGif) {
			g.URL = "data:image/gif;base64,R0lGOD"
		}, wantErr: ErrInvalidGif},
		{name: "relative url", provider: "giphy", mutate: func(g *thunderdome.RetroItemGif) {
			g.URL = "/media/abc123/200w.gif"
		}, wantErr: ErrInvalidGif},
		{name: "foreign host", provider: "giphy", mutate: func(g *thunderdome.RetroItemGif) {
			g.URL = "https://evil.example.com/a.gif"
		}, wantErr: ErrInvalidGif},
		{name: "host suffix trick", provider: "giphy", mutate: func(g *thunderdome.RetroItemGif) {
			g.URL = "https://notgiphy.com/a.gif"
		}, wantErr: ErrInvalidGif},
		{name: "allowed host as subdomain of attacker", provider: "giphy", mutate: func(g *thunderdome.RetroItemGif) {
			g.URL = "https://giphy.com.evil.com/a.gif"
		}, wantErr: ErrInvalidGif},
		{name: "media host of another provider", provider: "giphy", mutate: func(g *thunderdome.RetroItemGif) {
			g.URL = "https://static.klipy.com/ii/abc/sm.gif"
		}, wantErr: ErrInvalidGif},
		{name: "credentials in url", provider: "giphy", mutate: func(g *thunderdome.RetroItemGif) {
			g.URL = "https://user:pass@media.giphy.com/a.gif"
		}, wantErr: ErrInvalidGif},
		{name: "custom port", provider: "giphy", mutate: func(g *thunderdome.RetroItemGif) {
			g.URL = "https://media.giphy.com:8443/a.gif"
		}, wantErr: ErrInvalidGif},
		{name: "url too long", provider: "giphy", mutate: func(g *thunderdome.RetroItemGif) {
			g.URL = "https://media.giphy.com/" + strings.Repeat("a", maxURLLength)
		}, wantErr: ErrInvalidGif},
		{name: "empty id", provider: "giphy", mutate: func(g *thunderdome.RetroItemGif) {
			g.ID = ""
		}, wantErr: ErrInvalidGif},
		{name: "id too long", provider: "giphy", mutate: func(g *thunderdome.RetroItemGif) {
			g.ID = strings.Repeat("i", maxIDLength+1)
		}, wantErr: ErrInvalidGif},
		{name: "title too long", provider: "giphy", mutate: func(g *thunderdome.RetroItemGif) {
			g.Title = strings.Repeat("t", maxTitleLength+1)
		}, wantErr: ErrInvalidGif},
		{name: "empty title is allowed", provider: "giphy", mutate: func(g *thunderdome.RetroItemGif) {
			g.Title = ""
		}},
		{name: "zero width", provider: "giphy", mutate: func(g *thunderdome.RetroItemGif) {
			g.Width = 0
		}, wantErr: ErrInvalidGif},
		{name: "negative height", provider: "giphy", mutate: func(g *thunderdome.RetroItemGif) {
			g.Height = -1
		}, wantErr: ErrInvalidGif},
		{name: "huge height", provider: "giphy", mutate: func(g *thunderdome.RetroItemGif) {
			g.Height = maxDimension + 1
		}, wantErr: ErrInvalidGif},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			g := validGiphyGif()
			if tt.mutate != nil {
				tt.mutate(g)
			}
			if tt.nilGif {
				g = nil
			}

			err := Validate(tt.provider, g)
			if !errors.Is(err, tt.wantErr) {
				t.Fatalf("Validate() error = %v, want %v", err, tt.wantErr)
			}
		})
	}
}
