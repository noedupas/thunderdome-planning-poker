package retro

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/StevenWeathers/thunderdome-planning-poker/internal/gif"
	"github.com/StevenWeathers/thunderdome-planning-poker/internal/wshub"
	"github.com/StevenWeathers/thunderdome-planning-poker/thunderdome"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

// mockRetroDataSvc only implements CreateRetroItem, any other RetroDataSvc method panics (nil embedded interface)
type mockRetroDataSvc struct {
	RetroDataSvc
	mock.Mock
}

func (m *mockRetroDataSvc) CreateRetroItem(retroID string, userID string, itemType string, content string, g *thunderdome.RetroItemGif) ([]*thunderdome.RetroItem, error) {
	args := m.Called(retroID, userID, itemType, content, g)
	return args.Get(0).([]*thunderdome.RetroItem), args.Error(1)
}

const (
	testRetroID = "a1b2c3d4-0000-0000-0000-000000000001"
	testUserID  = "a1b2c3d4-0000-0000-0000-000000000002"
)

func testGif() *thunderdome.RetroItemGif {
	return &thunderdome.RetroItemGif{
		Provider: "giphy",
		ID:       "abc",
		URL:      "https://media.giphy.com/media/abc/200w.gif",
		Width:    200,
		Height:   120,
		Title:    "yay",
	}
}

func eventValue(t *testing.T, v any) string {
	t.Helper()
	b, err := json.Marshal(v)
	require.NoError(t, err)
	return string(b)
}

func TestCreateItem(t *testing.T) {
	tests := []struct {
		name        string
		gifProvider string
		payload     map[string]any
		wantGif     *thunderdome.RetroItemGif
		wantErr     string
	}{
		{
			name:        "text only",
			gifProvider: "giphy",
			payload:     map[string]any{"type": "worked", "content": "Nice sprint", "phase": "brainstorm"},
		},
		{
			name:        "text only when gifs are disabled",
			gifProvider: "",
			payload:     map[string]any{"type": "worked", "content": "Nice sprint", "gif": nil},
		},
		{
			name:        "text with gif",
			gifProvider: "giphy",
			payload:     map[string]any{"type": "worked", "content": "Nice sprint", "gif": testGif()},
			wantGif:     testGif(),
		},
		{
			name:        "gif only",
			gifProvider: "giphy",
			payload:     map[string]any{"type": "worked", "content": "", "gif": testGif()},
			wantGif:     testGif(),
		},
		{
			name:        "empty item rejected",
			gifProvider: "giphy",
			payload:     map[string]any{"type": "worked", "content": "  \n "},
			wantErr:     "RETRO_ITEM_EMPTY",
		},
		{
			name:        "gif rejected when gifs are disabled",
			gifProvider: "",
			payload:     map[string]any{"type": "worked", "content": "x", "gif": testGif()},
			wantErr:     gif.ErrUnknownProvider.Error(),
		},
		{
			name:        "gif from a foreign host rejected",
			gifProvider: "giphy",
			payload: map[string]any{"type": "worked", "content": "x", "gif": map[string]any{
				"provider": "giphy", "id": "abc", "url": "https://tracker.example.com/pixel.gif", "width": 1, "height": 1,
			}},
			wantErr: gif.ErrInvalidGif.Error(),
		},
		{
			name:        "gif from another provider rejected",
			gifProvider: "klipy",
			payload:     map[string]any{"type": "worked", "content": "x", "gif": testGif()},
			wantErr:     gif.ErrInvalidGif.Error(),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m := new(mockRetroDataSvc)
			content := tt.payload["content"].(string)
			items := []*thunderdome.RetroItem{{ID: "item-1", Content: content, Type: "worked", Gif: tt.wantGif}}
			if tt.wantErr == "" {
				m.On("CreateRetroItem", testRetroID, testUserID, "worked", content, tt.wantGif).Return(items, nil)
			}
			s := &Service{config: Config{GifProvider: tt.gifProvider}, RetroService: m}

			_, msg, err, forceClosed := s.CreateItem(context.Background(), testRetroID, testUserID, eventValue(t, tt.payload))

			assert.False(t, forceClosed)
			if tt.wantErr != "" {
				require.EqualError(t, err, tt.wantErr)
				assert.Nil(t, msg)
				m.AssertNotCalled(t, "CreateRetroItem", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything)
				return
			}

			require.NoError(t, err)
			m.AssertExpectations(t)

			var event wshub.SocketEvent
			require.NoError(t, json.Unmarshal(msg, &event))
			assert.Equal(t, "items_updated", event.Type)

			var broadcast []*thunderdome.RetroItem
			require.NoError(t, json.Unmarshal([]byte(event.Value), &broadcast))
			require.Len(t, broadcast, 1)
			assert.Equal(t, tt.wantGif, broadcast[0].Gif)
		})
	}
}

func TestCreateItemInvalidJSON(t *testing.T) {
	m := new(mockRetroDataSvc)
	s := &Service{config: Config{GifProvider: "giphy"}, RetroService: m}

	_, msg, err, _ := s.CreateItem(context.Background(), testRetroID, testUserID, "{not json")

	assert.Error(t, err)
	assert.Nil(t, msg)
	m.AssertNotCalled(t, "CreateRetroItem", mock.Anything, mock.Anything, mock.Anything, mock.Anything, mock.Anything)
}
