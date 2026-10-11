// Package gif holds the GIF providers supported by retro items and validates GIFs sent by clients
package gif

import (
	"errors"
	"maps"
	"net/url"
	"slices"
	"strings"

	"github.com/StevenWeathers/thunderdome-planning-poker/thunderdome"
)

const (
	maxIDLength    = 128
	maxURLLength   = 2048
	maxTitleLength = 256
	maxDimension   = 4096
)

// Provider describes a GIF search provider
type Provider struct {
	// Name is the value used in config (config.gif_provider) and stored on each GIF
	Name string
	// APIOrigin is called by the browser, it must be allowed in the CSP connect-src directive
	APIOrigin string
	// MediaHosts are the hosts (and their subdomains) a stored GIF URL may point to
	MediaHosts []string
}

var providers = map[string]Provider{
	"giphy": {
		Name:       "giphy",
		APIOrigin:  "https://api.giphy.com",
		MediaHosts: []string{"giphy.com"},
	},
	"klipy": {
		Name:       "klipy",
		APIOrigin:  "https://api.klipy.com",
		MediaHosts: []string{"klipy.com", "klipy.co"},
	},
}

var (
	// ErrUnknownProvider is returned when GIFs are disabled or the active provider is not registered
	ErrUnknownProvider = errors.New("GIF_PROVIDER_UNKNOWN")
	// ErrInvalidGif is returned when a GIF does not match the active provider rules
	ErrInvalidGif = errors.New("GIF_INVALID")
)

// Lookup returns the provider registered under name
func Lookup(name string) (Provider, bool) {
	p, ok := providers[strings.ToLower(strings.TrimSpace(name))]
	return p, ok
}

// Names returns the registered provider names, sorted
func Names() []string {
	return slices.Sorted(maps.Keys(providers))
}

// Validate checks that a GIF sent by a client comes from the active provider and points to an allowed host
func Validate(activeProvider string, g *thunderdome.RetroItemGif) error {
	p, ok := Lookup(activeProvider)
	if !ok {
		return ErrUnknownProvider
	}
	if g == nil || g.Provider != p.Name {
		return ErrInvalidGif
	}
	if g.ID == "" || len(g.ID) > maxIDLength || len(g.Title) > maxTitleLength || len(g.URL) > maxURLLength {
		return ErrInvalidGif
	}
	if g.Width < 1 || g.Width > maxDimension || g.Height < 1 || g.Height > maxDimension {
		return ErrInvalidGif
	}

	u, err := url.Parse(g.URL)
	if err != nil || u.Scheme != "https" || u.User != nil || u.Port() != "" {
		return ErrInvalidGif
	}
	if !p.allowsHost(u.Hostname()) {
		return ErrInvalidGif
	}

	return nil
}

func (p Provider) allowsHost(host string) bool {
	host = strings.ToLower(host)
	for _, allowed := range p.MediaHosts {
		if host == allowed || strings.HasSuffix(host, "."+allowed) {
			return true
		}
	}
	return false
}
